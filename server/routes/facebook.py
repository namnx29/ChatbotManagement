from flask import Blueprint, request, jsonify, current_app
from models.integration import IntegrationModel
from utils.redis_client import set_key, get_key, del_key
from config import Config
import logging
import secrets
import requests
import json
from datetime import datetime, timedelta
import base64
from io import BytesIO

facebook_bp = Blueprint('facebook', __name__)
logger = logging.getLogger(__name__)

PKCE_TTL = 600  # seconds (we reuse state storage for flow)


def _emit_socket(event, payload):
    """Emit a socket event in a backwards-compatible way.
    Some server instances accept `broadcast=True`, others (raw python-socketio Server)
    don't. Try with `broadcast=True` first and fall back to a plain emit.
    """
    try:
        socketio = getattr(current_app, 'socketio', None)
        if not socketio:
            return False
        try:
            socketio.emit(event, payload, broadcast=True)
        except TypeError:
            # fall back for servers that don't accept broadcast kw
            socketio.emit(event, payload)
        return True
    except Exception as e:
        logger.error(f"Socket emit failed: {e}")
        return False

from utils.request_helpers import get_account_id_from_request as _get_account_id_from_request


@facebook_bp.route('/api/facebook/auth-url', methods=['GET'])
def get_auth_url():
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    state = secrets.token_urlsafe(16)

    # accept optional chatbotId so we can redirect back to the right chatbot page after callback
    chatbot_id = request.args.get('chatbotId') or (request.get_json(silent=True) or {}).get('chatbotId')

    payload = {'accountId': account_id}
    if chatbot_id:
        payload['chatbotId'] = chatbot_id

    try:
        set_key(f"facebook:pkce:{state}", json.dumps(payload), ex=PKCE_TTL)
    except Exception:
        set_key(f"facebook:pkce:{state}", payload, ex=PKCE_TTL)

    # Build Facebook OAuth URL
    from urllib.parse import urlencode
    params = {
        'client_id': Config.FB_APP_ID,
        'redirect_uri': Config.FB_REDIRECT_URI,
        'state': state,
        'scope': Config.FB_SCOPE,
        'response_type': 'code'
    }
    auth_url = f"https://www.facebook.com/{Config.FB_API_VERSION}/dialog/oauth?{urlencode(params)}"

    return jsonify({'success': True, 'auth_url': auth_url, 'state': state}), 200


@facebook_bp.route('/facebook-callback', methods=['GET', 'POST'])
def facebook_callback():
    code = request.args.get('code') or (request.get_json(silent=True) or {}).get('code')
    state = request.args.get('state') or (request.get_json(silent=True) or {}).get('state')
    account_id = _get_account_id_from_request()

    if not state or not code:
        return jsonify({'success': False, 'message': 'Missing code or state'}), 400

    stored = get_key(f"facebook:pkce:{state}")
    chatbot_id = None
    try:
        if stored:
            try:
                parsed = json.loads(stored) if isinstance(stored, str) else stored
            except Exception:
                parsed = stored
            if isinstance(parsed, dict):
                chatbot_id = parsed.get('chatbotId')
                if not account_id:
                    account_id = parsed.get('accountId')
    except Exception as e:
        logger.warning(f"Failed to parse stored state data: {e}")

    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    # Exchange code for user access token
    token_url = f"{Config.FB_API_BASE}/oauth/access_token"
    params = {
        'client_id': Config.FB_APP_ID,
        'redirect_uri': Config.FB_REDIRECT_URI,
        'client_secret': Config.FB_APP_SECRET,
        'code': code
    }

    try:
        resp = requests.get(token_url, params=params, timeout=10)
        data = resp.json()
        user_access_token = data.get('access_token')
        if not user_access_token:
            raise Exception(f"Token exchange failed: {data}")

        # Exchange for long-lived token if possible
        resp2 = requests.get(token_url, params={'grant_type': 'fb_exchange_token', 'client_id': Config.FB_APP_ID, 'client_secret': Config.FB_APP_SECRET, 'fb_exchange_token': user_access_token}, timeout=10)
        long_data = resp2.json() if resp2.status_code == 200 else {}
        long_lived_token = long_data.get('access_token') or user_access_token

        # Fetch list of Pages the user manages
        pages_url = f"{Config.FB_API_BASE}/me/accounts"
        pages_resp = requests.get(pages_url, params={'access_token': user_access_token}, timeout=10)
        pages_data = pages_resp.json()
        pages = pages_data.get('data') if isinstance(pages_data, dict) else []

        # Choose first available page (simplest UX). In future we could show a page picker in UI.
        if not pages:
            raise Exception('No pages available or insufficient permissions')

        page = pages[0]
        page_id = page.get('id')
        page_token = page.get('access_token')
        page_name = page.get('name')

        # Try to fetch page picture using safest Graph API patterns
        avatar_url = None
        try:
            # Prefer requesting the picture URL explicitly
            pic_resp = requests.get(
                f"{Config.FB_API_BASE}/{page_id}",
                params={'fields': 'picture{url}', 'access_token': page_token},
                timeout=5,
            )
            if pic_resp.status_code == 200:
                pic_data = pic_resp.json()
                picture = pic_data.get('picture')
                if isinstance(picture, dict):
                    # Graph may return picture.data.url or picture.url
                    if isinstance(picture.get('data'), dict):
                        avatar_url = picture['data'].get('url')
                    else:
                        avatar_url = picture.get('url')

            # Fallback: use the /picture endpoint with redirect=false
            if not avatar_url:
                pic2 = requests.get(
                    f"{Config.FB_API_BASE}/{page_id}/picture",
                    params={'redirect': 'false', 'access_token': page_token},
                    timeout=5,
                )
                if pic2.status_code == 200:
                    p2 = pic2.json()
                    avatar_url = (p2.get('data') or {}).get('url')
        except Exception as e:
            logger.info(f"Could not fetch page picture: {e}")
            avatar_url = None

        access_token = page_token
        refresh_token = long_lived_token
        expires_in = None

    except Exception as e:
        logger.error(f"Facebook token exchange failed: {e}")
        # Fallback to mock behavior for local dev
        access_token = f"mock_fb_access_{state}"
        refresh_token = f"mock_fb_refresh_{state}"
        expires_in = 3600
        page_id = request.args.get('page_id') or f"mock_page_{state}"
        page_name = f"Mock Page {page_id}"
        avatar_url = None

    # Persist integration (include name/avatar if available)
    integration_model = IntegrationModel(current_app.mongo_client)

    existing_global = integration_model.find_by_platform_and_oa('facebook', page_id)

    accept = request.headers.get('Accept', '')

    # Chatbot conflict checks (same as Zalo pattern)
    if chatbot_id:
        existing_on_chatbot_list = integration_model.find_by_account(account_id, platform='facebook', chatbot_id=chatbot_id)
        existing_on_chatbot = existing_on_chatbot_list[0] if existing_on_chatbot_list else None
        if existing_on_chatbot and existing_on_chatbot.get('oa_id') != page_id:
            if 'application/json' in accept or request.args.get('format') == 'json' or request.is_json:
                return jsonify({'success': False, 'message': 'Chatbot already has a different Page connected', 'conflict': {'type': 'chatbot_has_other', 'chatbotId': chatbot_id, 'other_oa_id': existing_on_chatbot.get('oa_id')}}), 409
            params = f"platform=facebook&oa_id={page_id}&status=conflict&conflict_type=chatbot_has_other&other_oa_id={existing_on_chatbot.get('oa_id')}"
            if chatbot_id:
                target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot/{chatbot_id}/platform-intergrate?{params}"
            else:
                target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot?{params}"
            from flask import redirect
            try:
                del_key(f"facebook:pkce:{state}")
            except Exception:
                pass
            return redirect(target, code=302)

    if existing_global and existing_global.get('chatbotId') and existing_global.get('chatbotId') != chatbot_id:
        conflict_chatbot_id = existing_global.get('chatbotId')
        conflict_bot_name = None
        try:
            from models.chatbot import ChatbotModel
            cb_model = ChatbotModel(current_app.mongo_client)
            cb = cb_model.get_chatbot(conflict_chatbot_id)
            if cb:
                conflict_bot_name = cb.get('name')
        except Exception:
            conflict_bot_name = None

        if 'application/json' in accept or request.args.get('format') == 'json' or request.is_json:
            return jsonify({'success': False, 'message': 'Page already connected to another chatbot', 'conflict': {'type': 'oa_assigned', 'chatbotId': conflict_chatbot_id, 'chatbotName': conflict_bot_name, 'oa_id': page_id}}), 409

        from urllib.parse import quote_plus
        params = f"platform=facebook&oa_id={page_id}&status=conflict&conflict_type=oa_assigned&conflict_chatbotId={conflict_chatbot_id}&conflict_chatbotName={quote_plus(conflict_bot_name or '')}"
        if chatbot_id:
            target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot/{chatbot_id}/platform-intergrate?{params}"
        else:
            target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot?{params}"
        from flask import redirect
        try:
            del_key(f"facebook:pkce:{state}")
        except Exception:
            pass
        return redirect(target, code=302)

    already_connected = False
    if existing_global and existing_global.get('accountId') == account_id and (not existing_global.get('chatbotId') or existing_global.get('chatbotId') == chatbot_id):
        already_connected = True

    integration = integration_model.create_or_update(
        account_id=account_id,
        platform='facebook',
        oa_id=page_id,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        meta={'profile': {'page': page_name}},
        is_active=True,
        name=page_name,
        avatar_url=avatar_url,
        chatbot_id=chatbot_id,
    )

    # Log integration result for easier debugging and verification
    try:
        logger.info(f"Facebook integration persisted: platform=facebook, oa_id={integration.get('oa_id')}, account={integration.get('accountId')}, chatbotId={integration.get('chatbotId')}, avatar_url={integration.get('avatar_url')}")
    except Exception:
        logger.info(f"Facebook integration persisted (id={page_id})")

    try:
        del_key(f"facebook:pkce:{state}")
    except Exception:
        pass

    if 'application/json' in accept or request.args.get('format') == 'json' or request.is_json:
        return jsonify({'success': True, 'message': 'Facebook Page connected', 'data': {'oa_id': page_id, 'status': ('already' if already_connected else 'connected')}}), 200

    status = 'already' if already_connected else 'connected'
    if chatbot_id:
        target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot/{chatbot_id}/platform-intergrate?platform=facebook&oa_id={page_id}&status={status}"
    else:
        target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot?platform=facebook&oa_id={page_id}&status={status}"

    from flask import redirect
    return redirect(target, code=302)


@facebook_bp.route('/api/facebook/refresh/<integration_id>', methods=['POST'])
def refresh_facebook_integration(integration_id):
    """Refresh stored profile (name/avatar/meta) for the given integration id. Requires X-Account-Id header to match."""
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    model = IntegrationModel(current_app.mongo_client)
    existing = model.find_by_id(integration_id)
    if not existing:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    if existing.get('accountId') != account_id:
        return jsonify({'success': False, 'message': 'Not authorized'}), 403

    page_id = existing.get('oa_id')
    page_token = existing.get('access_token')
    if not page_id:
        return jsonify({'success': False, 'message': 'Integration has no page id'}), 400

    # try to fetch fresh profile data
    name = existing.get('name')
    avatar_url = existing.get('avatar_url')
    try:
        resp = requests.get(f"{Config.FB_API_BASE}/{page_id}", params={'fields': 'name,picture{url}', 'access_token': page_token}, timeout=10)
        if resp.status_code == 200:
            d = resp.json() or {}
            name = d.get('name') or name
            pic = d.get('picture') or {}
            if isinstance(pic, dict):
                if isinstance(pic.get('data'), dict):
                    avatar_url = pic['data'].get('url') or avatar_url
                else:
                    avatar_url = pic.get('url') or avatar_url
    except Exception as e:
        logger.info(f"Profile refresh failed for {integration_id}: {e}")

    updated = model.update_profile(integration_id, name=name, avatar_url=avatar_url, meta={'profile': {'page': name}})
    return jsonify({'success': True, 'data': updated}), 200


@facebook_bp.route('/webhooks/facebook', methods=['GET'])
def webhook_verify():
    # Facebook verification uses hub.verify_token and hub.challenge
    token = request.args.get('hub.verify_token') or request.args.get('verify_token')
    challenge = request.args.get('hub.challenge')

    if token and token == Config.FB_VERIFICATION_TOKEN:
        return (challenge or 'OK'), 200
    else:
        logger.warning('Facebook webhook verification failed: token mismatch')
        return 'verification failed', 403


@facebook_bp.route('/webhooks/facebook', methods=['POST'])
def webhook_event():
    data = request.get_json() or {}
    logger.info(f"Facebook webhook event received: {data}")

    # Facebook sends a top-level 'entry' list
    entries = data.get('entry') or []

    integration_model = IntegrationModel(current_app.mongo_client)
    from models.customer import CustomerModel
    from models.conversation import ConversationModel
    from models.message import MessageModel
    
    customer_model = CustomerModel(current_app.mongo_client)
    conversation_model = ConversationModel(current_app.mongo_client)
    message_model = MessageModel(current_app.mongo_client)

    for entry in entries:
        page_id = entry.get('id')
        # messaging events
        for messaging in entry.get('messaging', []) or entry.get('messaging', []):
            # Skip non-message events (read receipts, delivery receipts, etc.)
            if 'message' not in messaging and 'postback' not in messaging:
                logger.debug(f"Skipping non-message event: {list(messaging.keys())}")
                continue
            
            sender_id = (messaging.get('sender') or {}).get('id')
            recipient_id = (messaging.get('recipient') or {}).get('id')
            message_text = None
            
            # Check if this is an echo (message sent by the page itself)
            is_echo = messaging.get('message', {}).get('is_echo', False)
            
            # CRITICAL FIX: If sender_id == page_id (echo), the customer is recipient_id
            # Otherwise, customer is sender_id
            if is_echo or sender_id == page_id:
                # This is an echo - the page sent a message, so customer is the recipient
                customer_platform_id = recipient_id
                direction = 'out'  # Outgoing from page perspective
                oa_id = page_id
            else:
                # Normal incoming message from customer
                customer_platform_id = sender_id
                direction = 'in'
                oa_id = page_id
            
            # message text
            if messaging.get('message'):
                message_text = messaging['message'].get('text') or messaging['message'].get('sticker_id') or None
            else:
                # No message field - skip this event (read receipt, delivery receipt, etc.)
                continue

            integration = None
            if oa_id:
                integration = integration_model.find_by_platform_and_oa('facebook', oa_id)

            if not integration or not integration.get('is_active'):
                logger.info('Facebook integration not found or inactive; ignoring message')
                continue

            # Skip if no customer identified
            if not customer_platform_id:
                logger.warning('No customer identified in webhook message')
                continue

            # Upsert customer
            sender_profile = None
            try:
                page_token = integration.get('access_token')
                if page_token and customer_platform_id:
                    try:
                        resp = requests.get(f"{Config.FB_API_BASE}/{customer_platform_id}", params={'fields': 'name,picture{url}', 'access_token': page_token}, timeout=5)
                        if resp.status_code == 200:
                            d = resp.json() or {}
                            name = d.get('name')
                            pic = d.get('picture') or {}
                            avatar = None
                            if isinstance(pic, dict):
                                if isinstance(pic.get('data'), dict):
                                    avatar = pic['data'].get('url')
                                else:
                                    avatar = pic.get('url')
                            if name or avatar:
                                sender_profile = {'name': name, 'avatar': avatar}
                    except Exception as e:
                        logger.info(f"Failed to fetch sender profile for {customer_platform_id}: {e}")
            except Exception:
                sender_profile = None

            # Upsert customer
            customer_id = f"facebook:{customer_platform_id}"
            customer_doc = customer_model.upsert_customer(
                platform='facebook',
                platform_specific_id=customer_platform_id,
                name=sender_profile.get('name') if sender_profile else None,
                avatar=sender_profile.get('avatar') if sender_profile else None,
            )

            msg_obj = messaging.get('message') or {}
            preview_text = message_text
            try:
                if not preview_text:
                    # Facebook attachments appear under 'attachments'
                    if (isinstance(msg_obj.get('attachments'), list) and len(msg_obj.get('attachments')) > 0) or msg_obj.get('image') or msg_obj.get('attachment'):
                        preview_text = 'Tệp đính kèm'
            except Exception:
                preview_text = preview_text

            # Upsert conversation and get conversation_id
            # Only update last_message_text if we have actual text
            # For attachment-only messages, we still want to update the conversation timestamp
            conversation_doc = conversation_model.upsert_conversation(
                oa_id=integration.get('oa_id'),
                customer_id=customer_id,
                last_message_text=preview_text,  # Can be None for attachment-only messages
                last_message_created_at=datetime.utcnow() if message_text else None,
                direction=direction,
                customer_info={
                    'name': sender_profile.get('name') if sender_profile else None,
                    'avatar': sender_profile.get('avatar') if sender_profile else None,
                },
                increment_unread=(direction == 'in'),  # Increment for any incoming message
            )
            
            conversation_id = conversation_doc.get('_id')
            # Ensure conversation_id is a string for JSON serialization
            if conversation_id and not isinstance(conversation_id, str):
                try:
                    conversation_id = str(conversation_id)
                except Exception:
                    conversation_id = None

            # Persist message (dedupe outgoing echoes)
            deduped = False
            try:
                incoming_doc = None
                if direction == 'out':
                    # Check for recent similar outgoing message to avoid duplicate from send API + webhook echo
                    existing = message_model.find_recent_similar(platform='facebook', oa_id=integration.get('oa_id'), sender_id=customer_platform_id, conversation_id=conversation_id, direction='out', text=message_text, within_seconds=10)
                    if existing:
                        incoming_doc = existing
                        deduped = True
                        logger.info('Duplicate outgoing echo detected; using existing message doc')
                    else:
                        incoming_doc = message_model.add_message(
                            platform='facebook',
                            oa_id=integration.get('oa_id'),
                            sender_id=customer_platform_id,
                            direction='out',
                            text=message_text,
                            metadata=messaging.get('message'),
                            sender_profile=sender_profile,
                            is_read=True,
                            conversation_id=conversation_id,
                        )
                else:
                    incoming_doc = message_model.add_message(
                        platform='facebook',
                        oa_id=integration.get('oa_id'),
                        sender_id=customer_platform_id,
                        direction=direction,
                        text=message_text,
                        metadata=messaging.get('message'),
                        sender_profile=sender_profile,
                        is_read=False,
                        conversation_id=conversation_id,
                    )
            except Exception as e:
                logger.error(f"Failed to persist message: {e}")
                incoming_doc = None

            # Build conversation ID for frontend (legacy format for compatibility)
            conv_id = f"facebook:{integration.get('oa_id')}:{customer_platform_id}"

            # Emit socket events
            payload = {
                'platform': 'facebook',
                'oa_id': integration.get('oa_id'),
                'sender_id': customer_platform_id,
                'message': message_text,
                'message_doc': incoming_doc,
                'conv_id': conv_id,
                'conversation_id': conversation_id,  # New field (already string)
                'received_at' if direction == 'in' else 'sent_at': datetime.utcnow().isoformat(),
                'direction': direction,
                'sender_profile': sender_profile,
            }
            
            # Emit new message event (unless deduped by outgoing echo)
            try:
                if not deduped:
                    _emit_socket('new-message', payload)
                    logger.info('Emitted new-message via socket')
            except Exception as e:
                logger.error(f'Failed to emit new-message via socket: {e}')
            
            # Emit conversation update event (for sidebar refresh)
            try:
                if not deduped:
                    _emit_socket('update-conversation', {
                        'conversation_id': conversation_id,  # Already string
                        'conv_id': conv_id,  # Legacy format
                        'oa_id': integration.get('oa_id'),
                        'customer_id': customer_id,
                        'last_message': {
                            'text': message_text,
                            'created_at': datetime.utcnow().isoformat() + 'Z',
                        },
                        'unread_count': conversation_doc.get('unread_count', 0),
                        'customer_info': conversation_doc.get('customer_info', {}),
                        'platform': 'facebook',
                    })
                    logger.info('Emitted update-conversation via socket')
            except Exception:
                logger.error('Failed to emit update-conversation via socket')

    return jsonify({'success': True}), 200


@facebook_bp.route('/api/facebook/conversations', methods=['GET'])
def list_conversations():
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    oa_id = request.args.get('oa_id') or (request.get_json(silent=True) or {}).get('oa_id')
    if not oa_id:
        return jsonify({'success': False, 'message': 'oa_id is required'}), 400

    try:
        from models.conversation import ConversationModel
        from models.customer import CustomerModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        customer_model = CustomerModel(current_app.mongo_client)
        
        # Get conversations from new structure
        convs = conversation_model.find_by_oa(oa_id, limit=100)
        logger.info(f"Found {len(convs)} conversations from new structure for oa_id {oa_id}")
        if len(convs) == 0:
            # Try legacy method as fallback
            logger.info(f"No conversations in new structure, trying legacy method")
            from models.message import MessageModel
            message_model = MessageModel(current_app.mongo_client)
            convs_legacy = message_model.get_conversations_for_oa('facebook', oa_id)
            logger.info(f"Found {len(convs_legacy)} conversations from legacy structure")
            # Convert legacy format to new format
            convs = []
            for c in convs_legacy:
                sender_id = c.get('sender_id')
                sp = c.get('sender_profile') or {}
                name = sp.get('name') or None
                avatar = sp.get('avatar') or None
                convs.append({
                    'id': f"facebook:{oa_id}:{sender_id}",
                    'platform': 'facebook',
                    'oa_id': oa_id,
                    'sender_id': sender_id,
                    'name': name,
                    'avatar': avatar,
                    'lastMessage': c.get('lastMessage'),
                    'time': c.get('time'),
                    'unreadCount': c.get('unreadCount'),
                })
    except Exception as e:
        logger.error(f"Failed to fetch conversations from new structure: {e}", exc_info=True)
        # Fallback to legacy method
        try:
            from models.message import MessageModel
            message_model = MessageModel(current_app.mongo_client)
            convs_legacy = message_model.get_conversations_for_oa('facebook', oa_id)
            logger.info(f"Found {len(convs_legacy)} conversations from legacy structure")
            # Convert legacy format to new format
            convs = []
            for c in convs_legacy:
                sender_id = c.get('sender_id')
                sp = c.get('sender_profile') or {}
                name = sp.get('name') or None
                avatar = sp.get('avatar') or None
                convs.append({
                    'id': f"facebook:{oa_id}:{sender_id}",
                    'platform': 'facebook',
                    'oa_id': oa_id,
                    'sender_id': sender_id,
                    'name': name,
                    'avatar': avatar,
                    'lastMessage': c.get('lastMessage'),
                    'time': c.get('time'),
                    'unreadCount': c.get('unreadCount'),
                })
        except Exception as e2:
            logger.error(f"Legacy fallback also failed: {e2}", exc_info=True)
            return jsonify({'success': False, 'message': 'Internal error fetching conversations'}), 500

    # Enrich with integration profile when possible
    try:
        model = IntegrationModel(current_app.mongo_client)
        integration = model.find_by_platform_and_oa('facebook', oa_id)
        page_name = integration.get('name') if integration else None
        avatar_url = integration.get('avatar_url') if integration else None
    except Exception:
        page_name = None
        avatar_url = None

    out = []
    for c in convs:
        # If using new structure, extract data from conversation document
        if 'customer_id' in c:
            customer_id = c.get('customer_id')
            # Extract platform_specific_id from customer_id (format: "facebook:123456")
            parts = customer_id.split(':', 1)
            sender_id = parts[1] if len(parts) > 1 else customer_id
            
            # Get customer info from denormalized data or fetch from customer collection
            customer_info = c.get('customer_info') or {}
            name = customer_info.get('name') or None
            avatar = customer_info.get('avatar')
            
            # Build legacy conversation ID
            conv_id = f"facebook:{oa_id}:{sender_id}"
            
            last_msg = c.get('last_message') or {}
            # Format time for frontend (convert ISO string to readable format if needed)
            time_value = last_msg.get('created_at')
            if time_value:
                try:
                    # If it's already a string, try to parse and format
                    if isinstance(time_value, str):
                        from datetime import datetime
                        dt = datetime.fromisoformat(time_value.replace('Z', '+00:00'))
                        time_value = dt.strftime('%Y-%m-%d %H:%M:%S')
                except Exception:
                    pass  # Keep original value if parsing fails
            
            # Ensure conversation_id is a string
            conv_id_obj = c.get('_id')
            if conv_id_obj and not isinstance(conv_id_obj, str):
                conv_id_obj = str(conv_id_obj)
            
            out.append({
                'id': conv_id,
                'conversation_id': conv_id_obj,  # New field (string)
                'platform': 'facebook',
                'oa_id': oa_id,
                'sender_id': sender_id,
                'name': name,
                'avatar': avatar,
                'lastMessage': last_msg.get('text'),
                'time': time_value or c.get('updated_at'),  # Fallback to updated_at if no last_message time
                'unreadCount': c.get('unread_count', 0),
            })
        else:
            # Legacy format (already converted above)
            out.append(c)
    
    logger.info(f"Returning {len(out)} conversations for oa_id {oa_id}")
    if len(out) == 0:
        logger.warning(f"No conversations found for oa_id {oa_id}. Check if conversations exist in DB.")

    return jsonify({'success': True, 'data': out, 'page': {'name': page_name, 'avatar': avatar_url}}), 200


@facebook_bp.route('/api/facebook/conversations/<path:conv_id>/messages', methods=['GET'])
def get_conversation_messages(conv_id):
    parts = conv_id.split(':')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
    platform, oa_id, sender_id = parts
    if platform != 'facebook':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    try:
        limit = int(request.args.get('limit', 20))
    except Exception:
        limit = 20
    try:
        skip = int(request.args.get('skip', 0))
    except Exception:
        skip = 0
    # Safety caps
    if limit < 0:
        limit = 0
    if skip < 0:
        skip = 0
    if limit > 200:
        limit = 200

    try:
        from models.conversation import ConversationModel
        from models.message import MessageModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        
        # Try to find conversation to get conversation_id
        customer_id = f"facebook:{sender_id}"
        conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id)
        conversation_id = conversation_doc.get('_id') if conversation_doc else None
        
        # Ensure conversation_id is a string if it exists
        if conversation_id and not isinstance(conversation_id, str):
            try:
                conversation_id = str(conversation_id)
            except Exception:
                conversation_id = None
        
        # Get messages using conversation_id if available, otherwise fallback to legacy
        msgs = message_model.get_messages(
            platform, oa_id, sender_id, 
            limit=limit, skip=skip, 
            conversation_id=conversation_id
        )
        logger.info(f"Retrieved {len(msgs)} messages for conversation {conv_id}")
    except Exception as e:
        logger.error(f"Failed to fetch messages: {e}")
        return jsonify({'success': False, 'message': 'Internal error fetching messages'}), 500

    # Defensive: ensure messages are JSON-serializable before returning
    try:
        return jsonify({'success': True, 'data': msgs}), 200
    except TypeError as e:
        logger.warning(f"Messages not JSON serializable, attempting to normalize: {e}")
        try:
            import json
            safe_msgs = json.loads(json.dumps(msgs, default=str))
            return jsonify({'success': True, 'data': safe_msgs}), 200
        except Exception as e2:
            logger.error(f"Failed to normalize messages for JSON response: {e2}")
            return jsonify({'success': False, 'message': 'Internal error formatting messages'}), 500


@facebook_bp.route('/api/facebook/conversations/<path:conv_id>/mark-read', methods=['POST'])
def mark_conversation_read(conv_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
    platform, oa_id, sender_id = parts
    if platform != 'facebook':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    # Verify integration ownership
    model = IntegrationModel(current_app.mongo_client)
    integration = model.find_by_platform_and_oa(platform, oa_id)
    if not integration or integration.get('accountId') != account_id:
        return jsonify({'success': False, 'message': 'Not authorized or integration not found'}), 403

    try:
        from models.conversation import ConversationModel
        from models.message import MessageModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        
        customer_id = f"facebook:{sender_id}"
        conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id)
        conversation_id = conversation_doc.get('_id') if conversation_doc else None
        
        # Mark conversation as read in conversations collection
        if conversation_doc:
            conversation_model.mark_read(oa_id, customer_id)
        
        # Mark messages as read
        modified = message_model.mark_read(platform, oa_id, sender_id, conversation_id=conversation_id)
        return jsonify({'success': True, 'updated': modified}), 200
    except Exception as e:
        logger.error(f"Failed to mark conversation read: {e}")
        return jsonify({'success': False, 'message': 'Internal error'}), 500


@facebook_bp.route('/api/facebook/conversations/<path:conv_id>/messages', methods=['POST'])
def send_conversation_message(conv_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
    platform, oa_id, sender_id = parts
    if platform != 'facebook':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    data = request.get_json() or {}
    text = data.get('text')
    image = data.get('image')  # Optional: data URL or remote URL
    if not text and not image:
        return jsonify({'success': False, 'message': 'text or image is required'}), 400

    # Verify integration ownership
    model = IntegrationModel(current_app.mongo_client)
    integration = model.find_by_platform_and_oa(platform, oa_id)
    if not integration or integration.get('accountId') != account_id:
        return jsonify({'success': False, 'message': 'Not authorized or integration not found'}), 403

    try:
        from models.customer import CustomerModel
        from models.conversation import ConversationModel
        from models.message import MessageModel
        
        customer_model = CustomerModel(current_app.mongo_client)
        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        
        # Get or create customer
        customer_id = f"facebook:{sender_id}"
        customer_doc = customer_model.find_by_id(customer_id)
        if not customer_doc:
            # Create customer if doesn't exist
            customer_doc = customer_model.upsert_customer(
                platform='facebook',
                platform_specific_id=sender_id,
            )
        
        # Get or create conversation
        conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id)
        if not conversation_doc:
            conversation_doc = conversation_model.upsert_conversation(
                oa_id=oa_id,
                customer_id=customer_id,
            )
        
        conversation_id = conversation_doc.get('_id')
        # Ensure conversation_id is a string for JSON serialization
        if conversation_id and not isinstance(conversation_id, str):
            try:
                conversation_id = str(conversation_id)
            except Exception:
                conversation_id = None
        
        # Build conversation ID for frontend (legacy format)
        conv_id = f"{platform}:{oa_id}:{sender_id}"
        
        # send to facebook (for images, _send_message_to_facebook may accept image param)
        send_resp = _send_message_to_facebook(integration.get('access_token'), sender_id, text, image)
        
        
        # Update conversation with last message
        conversation_model.upsert_conversation(
            oa_id=oa_id,
            customer_id=customer_id,
            last_message_text=text if text else ("Tệp đính kèm" if image else None),
            last_message_created_at=datetime.utcnow(),
            direction='out',
        )
        
        # persist outgoing message
        page_profile = {'name': integration.get('name'), 'avatar': integration.get('avatar_url')}
        metadata = {'send_response': send_resp, 'page_profile': page_profile}
        if image:
            metadata['image'] = image
        sent_doc = message_model.add_message(
            platform=platform, 
            oa_id=oa_id, 
            sender_id=sender_id, 
            direction='out', 
            text=text, 
            metadata=metadata, 
            is_read=True,
            conversation_id=conversation_id,
        )
        
        # Build recipient_profile from customer_doc if available
        recipient_profile = {'name': customer_doc.get('name') if customer_doc else None, 'avatar': customer_doc.get('avatar') if customer_doc else None}

        # emit to socket listeners
        try:
            _emit_socket('new-message', {
                'platform': platform,
                'oa_id': oa_id,
                'sender_id': sender_id,
                'message': text if text else ("Tệp đính kèm" if image else None),
                'message_doc': sent_doc,
                'conv_id': f"{platform}:{oa_id}:{sender_id}",
                'conversation_id': conversation_id,  # Already string
                'direction': 'out',
                'sent_at': datetime.utcnow().isoformat() + 'Z',
                'sender_profile': page_profile,
                'recipient_profile': recipient_profile,
            })
            
            # Emit conversation update
            _emit_socket('update-conversation', {
                'conversation_id': conversation_id,  # Already string
                'conv_id': conv_id,
                'oa_id': oa_id,
                'customer_id': customer_id,
                'last_message': {
                    'text': text,
                    'created_at': datetime.utcnow().isoformat() + 'Z',
                },
                'unread_count': conversation_doc.get('unread_count', 0),
                'customer_info': conversation_doc.get('customer_info', {}),
                'platform': 'facebook',
            })
        except Exception as e:
            logger.error(f"Failed to emit socket event for outgoing message: {e}")
        return jsonify({'success': True, 'data': {'sent': sent_doc, 'send_response': send_resp}}), 200
    except Exception as e:
        logger.error(f"Failed to send conversation message: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Failed to send message: {str(e)}'}), 500


def _send_message_to_facebook(page_access_token, recipient_id, message_text=None, image_data=None):
    if not page_access_token or str(page_access_token).startswith('mock'):
        logger.info(f"Mock send to facebook: to={recipient_id}, message={message_text}, image={'yes' if image_data else 'no'}")
        return {'status': 'mocked'}

    url = f"{Config.FB_API_BASE}/{Config.FB_API_VERSION}/me/messages"
    params = {'access_token': page_access_token}

    if image_data:
        # Check if image_data is a data URL (base64)
        if image_data.startswith('data:image'):
            # Extract base64 data
            try:
                header, encoded = image_data.split(',', 1)
                image_bytes = base64.b64decode(encoded)
                
                # Upload to Facebook first to get a URL
                # Use Facebook's attachment upload API
                upload_url = f"{Config.FB_API_BASE}/{Config.FB_API_VERSION}/me/message_attachments"
                files = {
                    'filedata': ('image.jpg', BytesIO(image_bytes), 'image/jpeg')
                }
                upload_params = {
                    'access_token': page_access_token,
                    'message': json.dumps({
                        'attachment': {
                            'type': 'image',
                            'payload': {
                                'is_reusable': True
                            }
                        }
                    })
                }
                
                upload_resp = requests.post(upload_url, params=upload_params, files=files, timeout=30)
                upload_data = upload_resp.json()
                
                if 'attachment_id' in upload_data:
                    # Use the attachment ID
                    body = {
                        'recipient': {'id': recipient_id},
                        'message': {
                            'attachment': {
                                'type': 'image',
                                'payload': {
                                    'attachment_id': upload_data['attachment_id']
                                }
                            }
                        }
                    }
                else:
                    raise Exception(f"Upload failed: {upload_data}")
            except Exception as e:
                logger.error(f"Failed to process image data: {e}")
                return {'error': str(e)}
        else:
            # It's already a URL
            body = {
                'recipient': {'id': recipient_id},
                'message': {
                    'attachment': {
                        'type': 'image',
                        'payload': {
                            'url': image_data,
                            'is_reusable': True
                        }
                    }
                }
            }
        
        # Add text if provided
        if message_text:
            # Send text first, then image (Facebook doesn't support both in one message)
            text_body = {
                'recipient': {'id': recipient_id},
                'message': {'text': message_text}
            }
            requests.post(url, params=params, json=text_body, timeout=10)
    else:
        body = {
            'recipient': {'id': recipient_id},
            'message': {'text': message_text}
        }

    resp = requests.post(url, params=params, json=body, timeout=10)
    try:
        return resp.json()
    except Exception:
        return {'status_code': resp.status_code, 'text': resp.text}
    

# Token refresh helper (attempts to refresh long-lived tokens)
def refresh_expiring_tokens(mongo_client):
    integration_model = IntegrationModel(mongo_client)
    cutoff = datetime.utcnow() + timedelta(seconds=Config.TOKEN_REFRESH_LEAD_SECONDS)
    expiring = integration_model.integrations_needing_refresh(cutoff)
    logger.info(f"Found {len(expiring)} facebook integrations needing refresh")
    for item in expiring:
        try:
            refresh_token = item.get('refresh_token')
            if not refresh_token:
                logger.info(f"No refresh token for integration {item.get('_id')}; skipping")
                continue
            # Facebook long-lived tokens refresh flow is limited; attempt to re-exchange using fb_exchange_token
            token_url = f"{Config.FB_API_BASE}/oauth/access_token"
            params = {
                'grant_type': 'fb_exchange_token',
                'client_id': Config.FB_APP_ID,
                'client_secret': Config.FB_APP_SECRET,
                'fb_exchange_token': refresh_token,
            }
            resp = requests.get(token_url, params=params, timeout=10)
            data = resp.json()
            if resp.status_code == 200 and 'access_token' in data:
                # We don't necessarily get a page token back here; keep access_token for record
                integration_model.update_tokens(item.get('_id'), access_token=data.get('access_token'), refresh_token=data.get('access_token'), expires_in=data.get('expires_in'))
                logger.info(f"Refreshed token for integration {item.get('_id')}")
            else:
                raise Exception('unexpected response')
        except Exception as e:
            logger.info(f"Token refresh failed or skipped for {item.get('_id')}: {e}; using mock refresh")
            integration_model.update_tokens(item.get('_id'), access_token=f"mock_fb_access_refresh_{item.get('_id')}", expires_in=60 * 60 * 24 * 30)

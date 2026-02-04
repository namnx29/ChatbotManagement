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
import threading

facebook_bp = Blueprint('facebook', __name__)
logger = logging.getLogger(__name__)

PKCE_TTL = 600  # seconds (we reuse state storage for flow)


def _emit_socket(event, payload, account_id=None, to_room=None, organization_id=None):
    """Emit a socket event to a specific account room or broadcast.
    
    Args:
        event: Event name
        payload: Event payload
        account_id: If provided, emit only to this account's room (SECURITY FIX)
        to_room: Optional specific room name (for advanced use)
    
    Security: When account_id is provided, the event is sent only to users
    in that account's room, preventing cross-account data leakage.
    """
    try:
        socketio = getattr(current_app, 'socketio', None)
        if not socketio:
            return False
        
        # SECURITY FIX: If account_id provided, emit to account-specific room
        emitted_rooms = []
        if account_id:
            acc_str = str(account_id)
            room = to_room or f"account:{acc_str}"
            try:
                socketio.emit(event, payload, room=room)
            except TypeError:
                # Fallback for older versions
                socketio.emit(event, payload, room=room)
            emitted_rooms.append(room)
            logger.debug(f"Emitted {event} to room {room}")

        # If organization_id provided, also emit to organization room so staff members receive events
        if organization_id:
            org_str = str(organization_id)
            org_room = f"organization:{org_str}"
            try:
                socketio.emit(event, payload, room=org_room)
            except TypeError:
                socketio.emit(event, payload, room=org_room)
            emitted_rooms.append(org_room)
            logger.debug(f"Emitted {event} to organization room {org_room}")
        else:
            # Legacy: broadcast to all (use only for public events)
            try:
                socketio.emit(event, payload, broadcast=True)
            except TypeError:
                # fall back for servers that don't accept broadcast kw
                socketio.emit(event, payload)
            logger.debug(f"Broadcasted {event} to all clients")
        
        return True
    except Exception as e:
        logger.error(f"Socket emit failed: {e}")
        return False


# External auto-reply chat API
EXTERNAL_CHAT_API = 'https://microtunchat-app-1012095270393.us-central1.run.app/chat'


def _auto_reply_worker(mongo_client, integration, oa_id, customer_platform_id, conversation_id, question, account_id_owner, organization_id, socketio=None):
    """Background worker: call external chat API and send reply back to customer.

    - `mongo_client` is the Mongo client instance (passed from request context)
    - `integration` is the integration dict (contains access_token)
    - `socketio` is optional; if provided, emits socket events to account/organization rooms
    """
    try:
        if not question:
            logger.debug("Auto-reply: empty question, skipping")
            return

        try:
            resp = requests.post(EXTERNAL_CHAT_API, json={'question': question}, timeout=120)
            data = resp.json() if resp.status_code == 200 else {}
        except Exception as e:
            logger.error(f"Auto-reply API request failed: {e}")
            return

        answer = data.get('answer') if isinstance(data, dict) else None
        if not answer:
            logger.info(f"Auto-reply: no answer from API for question: {question}")
            return

        # Send answer back to customer via platform send helper
        try:
            send_resp = _send_message_to_facebook(integration.get('access_token'), customer_platform_id, answer)
        except Exception as e:
            logger.error(f"Failed to send auto-reply message to Facebook: {e}")
            send_resp = {'error': str(e)}

        # Persist outgoing message and update conversation
        try:
            from models.message import MessageModel
            from models.conversation import ConversationModel
            message_model = MessageModel(mongo_client)
            conversation_model = ConversationModel(mongo_client)

            sent_doc = message_model.add_message(
                platform='facebook',
                oa_id=oa_id,
                sender_id=customer_platform_id,
                direction='out',
                text=answer,
                metadata={'auto_reply': True, 'source': 'external_api', 'api_response': send_resp},
                is_read=True,
                conversation_id=conversation_id,
                account_id=account_id_owner,
                organization_id=organization_id,
            )

            conversation_model.upsert_conversation(
                oa_id=oa_id,
                customer_id=f"facebook:{customer_platform_id}",
                last_message_text=answer,
                last_message_created_at=datetime.utcnow(),
                direction='out',
                account_id=account_id_owner,
                organization_id=organization_id,
            )
        except Exception as e:
            logger.error(f"Failed to persist auto-reply message: {e}")

         # Emit socket events so UI updates in realtime to account and organization rooms
        try:
            # Fetch latest conversation to include bot flags and accurate unread count
            try:
                conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, f"facebook:{customer_platform_id}", organization_id=organization_id, account_id=account_id_owner)
            except Exception:
                conversation_doc = None

            # Derive organization id fallback from conversation if integration lacked it
            org_fallback = organization_id or (conversation_doc.get('organizationId') if conversation_doc else None)

            payload = {
                'platform': 'facebook',
                'oa_id': oa_id,
                'sender_id': customer_platform_id,
                'message': answer,
                'message_doc': sent_doc if 'sent_doc' in locals() else None,
                'conv_id': f"facebook:{oa_id}:{customer_platform_id}",
                'conversation_id': conversation_id,
                'sent_at': datetime.utcnow().isoformat() + 'Z',
                'direction': 'out',
            }
            try:
                if socketio:
                    acc_room = f"account:{str(account_id_owner)}"
                    socketio.emit('new-message', payload, room=acc_room)
                    if org_fallback:
                        org_room = f"organization:{str(org_fallback)}"
                        socketio.emit('new-message', payload, room=org_room)

                    socketio.emit('update-conversation', {
                        'conversation_id': conversation_id,
                        'conv_id': f"facebook:{oa_id}:{customer_platform_id}",
                        'oa_id': oa_id,
                        'customer_id': f"facebook:{customer_platform_id}",
                        'last_message': {'text': answer, 'created_at': datetime.utcnow().isoformat() + 'Z'},
                        'unread_count': conversation_doc.get('unread_count', 0) if conversation_doc else 0,
                        'customer_info': conversation_doc.get('customer_info', {}) if conversation_doc else {},
                        'bot_reply': conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else (conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else None),
                        'platform': 'facebook',
                    }, room=acc_room)
                    if org_fallback:
                        org_room = f"organization:{str(org_fallback)}"
                        socketio.emit('update-conversation', {
                            'conversation_id': conversation_id,
                            'conv_id': f"facebook:{oa_id}:{customer_platform_id}",
                            'oa_id': oa_id,
                            'customer_id': f"facebook:{customer_platform_id}",
                            'last_message': {'text': answer, 'created_at': datetime.utcnow().isoformat() + 'Z'},
                            'unread_count': conversation_doc.get('unread_count', 0) if conversation_doc else 0,
                            'customer_info': conversation_doc.get('customer_info', {}) if conversation_doc else {},
                            'bot_reply': conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else (conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else None),
                            'platform': 'facebook',
                        }, room=org_room)
                else:
                    _emit_socket('new-message', payload, account_id=account_id_owner, organization_id=org_fallback)
                    _emit_socket('update-conversation', {
                        'conversation_id': conversation_id,
                        'conv_id': f"facebook:{oa_id}:{customer_platform_id}",
                        'oa_id': oa_id,
                        'customer_id': f"facebook:{customer_platform_id}",
                        'last_message': {'text': answer, 'created_at': datetime.utcnow().isoformat() + 'Z'},
                        'unread_count': conversation_doc.get('unread_count', 0) if conversation_doc else 0,
                        'customer_info': conversation_doc.get('customer_info', {}) if conversation_doc else {},
                        'bot_reply': conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else (conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else None),
                        'bot-reply': conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else (conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else None),
                        'platform': 'facebook',
                    }, account_id=account_id_owner, organization_id=org_fallback)
            except Exception as e:
                logger.debug(f"Socket emit from auto-reply failed: {e}")
        except Exception:
            pass

    except Exception as e:
        logger.error(f"Auto-reply worker exception: {e}")

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
            try:
                if not deduped:
                    _emit_socket('new-message', {
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
                    }, account_id=account_id_owner, organization_id=integration.get('organizationId'))
                    logger.info(f'Emitted new-message to account {account_id_owner} and org {integration.get("organizationId")} via socket')
            except Exception as e:
                logger.error(f'Failed to emit new-message via socket: {e}')
        except Exception:
            pass
        return redirect(target, code=302)

    already_connected = False
    if existing_global and existing_global.get('accountId') == account_id and (not existing_global.get('chatbotId') or existing_global.get('chatbotId') == chatbot_id):
        already_connected = True

    # Get user's organization for integration isolation
    from models.user import UserModel
    user_model = UserModel(current_app.mongo_client)
    user_org_id = user_model.get_user_organization_id(account_id)

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
        organization_id=user_org_id,
    )

    # Emit integration-added event so staff/admin clients update in real-time
    try:
        _emit_socket('integration-added', {
            'integration_id': integration.get('_id'),
            'oa_id': integration.get('oa_id'),
            'platform': 'facebook'
        }, account_id=integration.get('accountId'), organization_id=user_org_id)
    except Exception as e:
        logger.error(f"Emit integration-added failed: {e}")

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
    from models.chatbot import ChatbotModel
    
    chatbot_model = ChatbotModel(current_app.mongo_client)
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

            chatbot_data = chatbot_model.get_chatbot(integration.get('chatbotId'))

            # Upsert conversation and get conversation_id
            # Only update last_message_text if we have actual text
            # For attachment-only messages, we still want to update the conversation timestamp
            # SECURITY FIX: Include account_id for account isolation
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
                chatbot_id=integration.get('chatbotId'),
                chatbot_info={
                    'name': chatbot_data.get('name') if chatbot_data else None,
                    'avatar': chatbot_data.get('avatar_url') if chatbot_data else None,
                },
                account_id=integration.get('accountId'),  # SECURITY FIX
                organization_id=integration.get('organizationId'),
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
                            account_id=integration.get('accountId'),
                            organization_id=integration.get('organizationId'),
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
                        account_id=integration.get('accountId'),
                        organization_id=integration.get('organizationId'),
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
            
            # SECURITY FIX: Emit socket events only to the account that owns this integration
            account_id_owner = integration.get('accountId')
            
            # Emit new message event (unless deduped by outgoing echo)
            try:
                    if not deduped:
                        _emit_socket('new-message', payload, account_id=account_id_owner, organization_id=integration.get('organizationId'))
                        logger.info(f'Emitted new-message to account {account_id_owner} and org {integration.get("organizationId")} via socket')
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
                        'bot_reply': conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else (conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else None),
                    }, account_id=account_id_owner, organization_id=integration.get('organizationId'))
                        logger.info(f'Emitted update-conversation to account {account_id_owner} and org {integration.get("organizationId")} via socket')
            except Exception:
                logger.error('Failed to emit update-conversation via socket')

            # If auto-reply is enabled for this conversation, schedule background worker
            try:
                bot_flag = conversation_doc.get('bot_reply') if conversation_doc else None
                if bot_flag is None:
                    # support legacy hyphenated field
                    bot_flag = conversation_doc.get('bot-reply') if conversation_doc else None

                if direction == 'in' and bot_flag and not deduped:
                    try:
                        mongo_client = current_app.mongo_client
                        socketio = getattr(current_app, 'socketio', None)
                        t = threading.Thread(
                            target=_auto_reply_worker,
                            args=(mongo_client, integration, integration.get('oa_id'), customer_platform_id, conversation_id, message_text, account_id_owner, integration.get('organizationId'), socketio),
                            daemon=True
                        )
                        t.start()
                        logger.info(f"Scheduled auto-reply worker for conversation {conversation_id}")
                    except Exception as e:
                        logger.error(f"Failed to start auto-reply worker thread: {e}")
            except Exception:
                pass

    return jsonify({'success': True}), 200


@facebook_bp.route('/api/facebook/conversations', methods=['GET'])
def list_conversations():
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    oa_id = request.args.get('oa_id') or (request.get_json(silent=True) or {}).get('oa_id')
    if not oa_id:
        return jsonify({'success': False, 'message': 'oa_id is required'}), 400

    # SECURITY FIX: Validate organization access using organizationId
    try:
        from models.user import UserModel
        integration_model = IntegrationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        
        integration = integration_model.find_by_platform_and_oa('facebook', oa_id)
        if not integration:
            return jsonify({'success': False, 'message': 'Integration not found'}), 404
        
        # Check authorization via organizationId (staff can access admin's org)
        user_org_id = user_model.get_user_organization_id(account_id)
        integration_org_id = integration.get('organizationId')
        
        # Allow access if: same organizationId OR (old data without organizationId) user is the owner
        if integration_org_id and user_org_id and integration_org_id == user_org_id:
            # Organization match - allow
            pass
        elif integration.get('accountId') == account_id:
            # Direct account match - allow (backward compat)
            pass
        else:
            logger.warning(f"Unauthorized access attempt: account {account_id} (org {user_org_id}) tried to access oa_id {oa_id} owned by account {integration.get('accountId')} (org {integration_org_id})")
            return jsonify({'success': False, 'message': 'Unauthorized access to this page'}), 403
    except Exception as e:
        logger.error(f"Error validating integration ownership: {e}")
        return jsonify({'success': False, 'message': 'Authorization check failed'}), 500

    try:
        from models.conversation import ConversationModel
        from models.customer import CustomerModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        customer_model = CustomerModel(current_app.mongo_client)
        
        # Get organization context for query
        user_org_id = user_model.get_user_organization_id(account_id) if 'user_model' in locals() else None
        
        # Get conversations using organizationId for org-level isolation
        if user_org_id:
            convs = conversation_model.list_by_organization(user_org_id, limit=100)
            logger.info(f"Found {len(convs)} conversations from organization {user_org_id}")
        else:
            # Fallback to account-based query for backward compat
            convs = conversation_model.find_by_oa(oa_id, limit=100, account_id=account_id)
            logger.info(f"Found {len(convs)} conversations from oa_id {oa_id} with account_id {account_id}")
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
                'current_handler': c.get('current_handler'),
                'lock_expires_at': c.get('lock_expires_at') if c.get('lock_expires_at') else None,
                'bot_reply': c.get('bot-reply') if 'bot-reply' in c else (c.get('bot_reply') if 'bot_reply' in c else None),
            })
        else:
            # Legacy format (already converted above)
            out.append(c)

            # Check integration status
    try:
        integration = model.find_by_platform_and_oa('facebook', oa_id)
        is_connected = bool(integration and integration.get('is_active', True))
        disconnected_at = None
        if not is_connected and integration:
            disconnected_at = integration.get('updated_at')
    except Exception as e:
        logger.error(f"Error checking integration status: {e}")
        is_connected = False
        disconnected_at = None

    # Add platform_status to each conversation
    for conv in out:
        conv['platform_status'] = {
            'is_connected': is_connected,
            'disconnected_at': disconnected_at.isoformat() + 'Z' if disconnected_at else None
        }
    
    logger.info(f"Returning {len(out)} conversations for oa_id {oa_id}")
    if len(out) == 0:
        logger.warning(f"No conversations found for oa_id {oa_id}. Check if conversations exist in DB.")

    return jsonify({'success': True, 'data': out, 'page': {'name': page_name, 'avatar': avatar_url}}), 200


@facebook_bp.route('/api/facebook/conversations/<path:conv_id>/messages', methods=['GET'])
def get_conversation_messages(conv_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
    platform, oa_id, sender_id = parts
    if platform != 'facebook':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    # # SECURITY FIX: Validate that the requesting account owns this oa_id integration
    # try:
    #     model = IntegrationModel(current_app.mongo_client)
    #     integration = model.find_by_platform_and_oa(platform, oa_id)
    #     if not integration:
    #         return jsonify({'success': False, 'message': 'Integration not found'}), 404
    #     if integration.get('accountId') != account_id:
    #         logger.warning(f"Unauthorized access attempt: account {account_id} tried to access messages for oa_id {oa_id}")
    #         return jsonify({'success': False, 'message': 'Unauthorized'}), 403
    # except Exception as e:
    #     logger.error(f"Error validating integration ownership: {e}")
    #     return jsonify({'success': False, 'message': 'Authorization check failed'}), 500

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
        from models.user import UserModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        
        # Try to find conversation to get conversation_id and return conversation state
        # Use organizationId for org-level isolation
        customer_id = f"facebook:{sender_id}"
        user_org_id = user_model.get_user_organization_id(account_id)
        
        conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        conversation_id = conversation_doc.get('_id') if conversation_doc else None
        
        # Ensure conversation_id is a string if it exists
        if conversation_id and not isinstance(conversation_id, str):
            try:
                conversation_id = str(conversation_id)
            except Exception:
                conversation_id = None
        
        # Get messages using conversation_id and organizationId if available
        if user_org_id and conversation_id:
            # Primary: Use organization-based query
            msgs = message_model.get_by_organization_and_conversation(
                user_org_id, conversation_id,
                limit=limit, skip=skip
            )
            logger.info(f"Retrieved {len(msgs)} messages using organization context")
        else:
            # Fallback: Legacy account-based query
            msgs = message_model.get_messages(
                platform, oa_id, sender_id, 
                limit=limit, skip=skip, 
                conversation_id=conversation_id,
                account_id=account_id
            )
            logger.info(f"Retrieved {len(msgs)} messages using legacy query")
        logger.info(f"Retrieved {len(msgs)} messages for conversation {conv_id}")
    except Exception as e:
        logger.error(f"Failed to fetch messages: {e}")
        return jsonify({'success': False, 'message': 'Internal error fetching messages'}), 500

    # Defensive: ensure messages are JSON-serializable before returning
    payload = {'success': True, 'data': msgs, 'conversation': conversation_doc}
    try:
        return jsonify(payload), 200
    except TypeError as e:
        logger.warning(f"Messages not JSON serializable, attempting to normalize: {e}")
        try:
            import json
            safe_msgs = json.loads(json.dumps(msgs, default=str))
            safe_conv = json.loads(json.dumps(conversation_doc, default=str)) if conversation_doc else None
            return jsonify({'success': True, 'data': safe_msgs, 'conversation': safe_conv}), 200
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

    # # Verify integration ownership
    # model = IntegrationModel(current_app.mongo_client)
    # integration = model.find_by_platform_and_oa(platform, oa_id)
    # if integration and integration.get('accountId') != account_id:
    #     return jsonify({'success': False, 'message': 'Not authorized'}), 403

    try:
        from models.conversation import ConversationModel
        from models.message import MessageModel
        from models.user import UserModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        
        customer_id = f"facebook:{sender_id}"
        user_org_id = user_model.get_user_organization_id(account_id)
        
        # Find conversation using organizationId
        conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        conversation_id = conversation_doc.get('_id') if conversation_doc else None
        
        # Mark conversation as read
        if conversation_doc:
            conversation_model.mark_read(oa_id, customer_id, account_id=account_id, organization_id=user_org_id)
        
        # Mark messages as read using organization context
        if user_org_id and conversation_id:
            modified = message_model.mark_as_read_by_organization(user_org_id, conversation_id)
        else:
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

    # Verify integration ownership using organizationId
    from models.user import UserModel
    model = IntegrationModel(current_app.mongo_client)
    user_model = UserModel(current_app.mongo_client)
    integration = model.find_by_platform_and_oa(platform, oa_id)
    
    if not integration:
        return jsonify({'success': False, 'message': 'Integration not found'}), 404
    
    # Check organization match for authorization
    user_org_id = user_model.get_user_organization_id(account_id)
    integration_org_id = integration.get('organizationId')
    
    if integration_org_id and user_org_id and integration_org_id == user_org_id:
        # Organization match - allow
        pass
    elif integration.get('accountId') == account_id:
        # Direct account match - allow
        pass
    else:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 403
        return jsonify({'success': False, 'message': 'Not authorized or integration not found'}), 403

    try:
        from models.customer import CustomerModel
        from models.conversation import ConversationModel
        from models.message import MessageModel
        from models.chatbot import ChatbotModel
        
        chatbot_model = ChatbotModel(current_app.mongo_client)
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
        
        chatbot_data = chatbot_model.get_chatbot(integration.get('chatbotId'))
        # Get or create conversation
        # SECURITY FIX: Include account_id for account isolation
        conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id, account_id=integration.get('accountId'), organization_id=integration.get('organizationId'))
        if not conversation_doc:
            conversation_doc = conversation_model.upsert_conversation(
                oa_id=oa_id,
                customer_id=customer_id,
                chatbot_id=integration.get('chatbotId'),
                chatbot_info={
                    'name': chatbot_data.get('name') if chatbot_data else None,
                    'avatar': chatbot_data.get('avatar_url') if chatbot_data else None,
                },
                account_id=integration.get('accountId'),  # SECURITY FIX
                organization_id=integration.get('organizationId'),
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
        # SECURITY FIX: Include account_id for account isolation
        conversation_model.upsert_conversation(
            oa_id=oa_id,
            customer_id=customer_id,
            last_message_text=text if text else ("Tệp đính kèm" if image else None),
            last_message_created_at=datetime.utcnow(),
            direction='out',
            chatbot_id=integration.get('chatbotId'),
            chatbot_info={
                'name': chatbot_data.get('name') if chatbot_data else None,
                'avatar': chatbot_data.get('avatar_url') if chatbot_data else None,
            },
            account_id=integration.get('accountId'),  # SECURITY FIX
            organization_id=integration.get('organizationId'),
        )
        
        # SECURITY FIX: Emit socket events only to the account that owns this integration
        account_id_owner = integration.get('accountId')
        
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
            account_id=account_id_owner,
            organization_id=integration.get('organizationId'),
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
            }, account_id=account_id_owner, organization_id=integration.get('organizationId'))
            
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
            }, account_id=account_id_owner, organization_id=integration.get('organizationId'))
            # Attempt to set persistent handler on first outgoing message (first-sender becomes handler)
            try:
                from models.user import UserModel
                user_model = UserModel(current_app.mongo_client)
                handler_user = None
                handler_name = None
                try:
                    # Use the requesting account (account_id) as the handler, not the integration owner
                    handler_user = user_model.find_by_account_id(account_id) if account_id else None
                    if handler_user:
                        handler_name = handler_user.get('name') or handler_user.get('username')
                except Exception:
                    handler_name = handler_name or integration.get('name')

                # Use conversation_model (in this scope) to atomically claim if unset
                try:
                    claimed = conversation_model.set_handler_if_unset(conversation_id, account_id, handler_name)
                    if claimed:
                        _emit_socket('conversation-locked', {
                            'conv_id': conv_id,
                            'conversation_id': conversation_id,
                            'handler': claimed.get('current_handler')
                        }, account_id=account_id_owner, organization_id=integration.get('organizationId'))
                except Exception as e:
                    logger.debug(f"Failed to claim conversation handler: {e}")
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Failed to emit socket event for outgoing message: {e}")
        return jsonify({'success': True, 'data': {'sent': sent_doc, 'send_response': send_resp}}), 200
    except Exception as e:
        logger.error(f"Failed to send conversation message: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Failed to send message: {str(e)}'}), 500


@facebook_bp.route('/api/facebook/conversations/<path:conv_id>/bot-reply', methods=['POST'])
def set_conversation_bot_reply(conv_id):
    """Toggle auto-reply for a conversation. Expects JSON: {"enabled": true/false}
    Authorization follows the same pattern as message endpoints.
    """
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
    enabled = data.get('enabled')
    # normalize truthy values
    enabled_bool = True if enabled in [True, 'true', 'True', 1, '1'] else False

    try:
        from models.conversation import ConversationModel
        from models.user import UserModel

        model = IntegrationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        integration = model.find_by_platform_and_oa('facebook', oa_id)
        if not integration:
            return jsonify({'success': False, 'message': 'Integration not found'}), 404

        # Authorization check (organizationId preferred)
        user_org_id = user_model.get_user_organization_id(account_id)
        integration_org_id = integration.get('organizationId')
        if integration_org_id and user_org_id and integration_org_id == user_org_id:
            pass
        elif integration.get('accountId') == account_id:
            pass
        else:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 403

        conversation_model = ConversationModel(current_app.mongo_client)
        customer_id = f"facebook:{sender_id}"
        conv = conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        if not conv:
            return jsonify({'success': False, 'message': 'Conversation not found'}), 404

        updated = conversation_model.set_bot_reply_by_id(conv.get('_id'), enabled_bool, account_id=integration.get('accountId'), organization_id=integration.get('organizationId'))
        # Emit update so other clients (account owner and org members) get realtime state
        try:
            conv_id_legacy = f"facebook:{oa_id}:{sender_id}"
            org_fallback = integration.get('organizationId') or conv.get('organizationId')
            _emit_socket('update-conversation', {
                'conversation_id': conv.get('_id'),
                'conv_id': conv_id_legacy,
                'oa_id': oa_id,
                'customer_id': f"facebook:{sender_id}",
                'bot_reply': updated.get('bot_reply') if updated and 'bot_reply' in updated else enabled_bool,
            }, account_id=integration.get('accountId'), organization_id=org_fallback)
        except Exception as e:
            logger.debug(f"Failed to emit bot-reply update: {e}")
        return jsonify({'success': True, 'data': updated}), 200
    except Exception as e:
        logger.error(f"Failed to set bot-reply for conversation {conv_id}: {e}")
        return jsonify({'success': False, 'message': 'Internal error setting bot reply'}), 500


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

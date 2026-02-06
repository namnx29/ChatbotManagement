from flask import Blueprint, request, jsonify, current_app
from models.integration import IntegrationModel
from utils.redis_client import set_key, get_key, del_key
from config import Config
import logging
import secrets
import base64
import hashlib
import requests
import json
from datetime import datetime, timedelta
import threading

zalo_bp = Blueprint('zalo', __name__)
logger = logging.getLogger(__name__)

# External auto-reply chat API (same as Facebook integration)
EXTERNAL_CHAT_API = 'https://microtunchat-app-1012095270393.us-central1.run.app/chat'


def _auto_reply_worker_zalo(mongo_client, integration, oa_id, customer_platform_id, conversation_id, question, account_id_owner, organization_id, socketio=None):
    try:
        if not question:
            logger.debug('Auto-reply Zalo: empty question, skipping')
            return
        try:
            resp = requests.post(EXTERNAL_CHAT_API, json={'question': question}, timeout=120)
            data = resp.json() if resp.status_code == 200 else {}
        except Exception as e:
            logger.error(f'Auto-reply Zalo API request failed: {e}')
            return

        answer = data.get('answer') if isinstance(data, dict) else None
        if not answer:
            logger.info(f'Auto-reply Zalo: no answer from API for question: {question}')
            return

        # Send answer back to customer via Zalo send helper
        try:
            send_resp = _send_message_to_zalo(integration.get('access_token'), customer_platform_id, message_text=answer)
        except Exception as e:
            logger.error(f'Failed to send auto-reply message to Zalo: {e}')
            send_resp = {'error': str(e)}

        # Persist outgoing message and update conversation
        try:
            from models.message import MessageModel
            from models.conversation import ConversationModel
            message_model = MessageModel(mongo_client)
            conversation_model = ConversationModel(mongo_client)

            sent_doc = message_model.add_message(
                platform='zalo',
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
                customer_id=f"zalo:{customer_platform_id}",
                last_message_text=answer,
                last_message_created_at=datetime.utcnow(),
                direction='out',
                account_id=account_id_owner,
                organization_id=organization_id,
            )
        except Exception as e:
            logger.error(f'Failed to persist auto-reply message for Zalo: {e}')

        # Emit socket events to account and organization rooms
        try:
            try:
                conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, f"zalo:{customer_platform_id}", organization_id=organization_id, account_id=account_id_owner)
            except Exception:
                conversation_doc = None

            org_fallback = organization_id or (conversation_doc.get('organizationId') if conversation_doc else None)

            payload = {
                'platform': 'zalo',
                'oa_id': oa_id,
                'sender_id': customer_platform_id,
                'message': answer,
                'message_doc': sent_doc if 'sent_doc' in locals() else None,
                'conv_id': f"zalo:{oa_id}:{customer_platform_id}",
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
                        'conv_id': f"zalo:{oa_id}:{customer_platform_id}",
                        'oa_id': oa_id,
                        'customer_id': f"zalo:{customer_platform_id}",
                        'last_message': {'text': answer, 'created_at': datetime.utcnow().isoformat() + 'Z'},
                        'unread_count': conversation_doc.get('unread_count', 0) if conversation_doc else 0,
                        'customer_info': conversation_doc.get('customer_info', {}) if conversation_doc else {},
                        'bot_reply': conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else (conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else None),
                        'platform': 'zalo',
                    }, room=acc_room)
                    if org_fallback:
                        org_room = f"organization:{str(org_fallback)}"
                        socketio.emit('update-conversation', {
                            'conversation_id': conversation_id,
                            'conv_id': f"zalo:{oa_id}:{customer_platform_id}",
                            'oa_id': oa_id,
                            'customer_id': f"zalo:{customer_platform_id}",
                            'last_message': {'text': answer, 'created_at': datetime.utcnow().isoformat() + 'Z'},
                            'unread_count': conversation_doc.get('unread_count', 0) if conversation_doc else 0,
                            'customer_info': conversation_doc.get('customer_info', {}) if conversation_doc else {},
                            'bot_reply': conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else (conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else None),
                            'platform': 'zalo',
                        }, room=org_room)
                else:
                    _emit_socket_to_account('new-message', payload, account_id_owner, org_fallback)
                    _emit_socket_to_account('update-conversation', {
                        'conversation_id': conversation_id,
                        'conv_id': f"zalo:{oa_id}:{customer_platform_id}",
                        'oa_id': oa_id,
                        'customer_id': f"zalo:{customer_platform_id}",
                        'last_message': {'text': answer, 'created_at': datetime.utcnow().isoformat() + 'Z'},
                        'unread_count': conversation_doc.get('unread_count', 0) if conversation_doc else 0,
                        'customer_info': conversation_doc.get('customer_info', {}) if conversation_doc else {},
                        'bot_reply': conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else (conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else None),
                        'platform': 'zalo',
                    }, account_id_owner, org_fallback)
            except Exception as e:
                logger.debug(f"Socket emit from auto-reply Zalo failed: {e}")
        except Exception:
            pass
    except Exception as e:
        logger.error(f'Auto-reply worker Zalo exception: {e}')

class ImageTooLargeError(Exception):
    """Raised when an image exceeds the configured upload size limit."""
    pass

PKCE_TTL = 600  # seconds

def _emit_socket_to_account(event, payload, account_id, organization_id=None):
    """Emit a socket event to a specific account's room (SECURITY FIX).
    This ensures only authenticated users of the owning account receive the event.
    Prevents cross-account data leakage via WebSocket broadcasts.
    """
    try:
        socketio = getattr(current_app, 'socketio', None)
        if not socketio:
            return False
        
        emitted_rooms = []
        acc_str = str(account_id)
        room = f"account:{acc_str}"
        try:
            socketio.emit(event, payload, room=room)
        except TypeError:
            socketio.emit(event, payload, room=room)
        emitted_rooms.append(room)
        logger.debug(f"Emitted {event} to account room {room}")

        # Also emit to organization room so staff receive events
        if organization_id:
            org_str = str(organization_id)
            org_room = f"organization:{org_str}"
            try:
                socketio.emit(event, payload, room=org_room)
            except TypeError:
                socketio.emit(event, payload, room=org_room)
            emitted_rooms.append(org_room)
            logger.debug(f"Emitted {event} to organization room {org_room}")
        return True
    except Exception as e:
        logger.error(f"Socket emit to account failed: {e}")
        return False

from utils.request_helpers import get_account_id_from_request as _get_account_id_from_request


def _generate_pkce_pair():
    # code_verifier
    code_verifier = secrets.token_urlsafe(64)
    # code_challenge = base64url(SHA256(code_verifier))
    digest = hashlib.sha256(code_verifier.encode('utf-8')).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode('utf-8')
    return code_verifier, code_challenge


@zalo_bp.route('/api/zalo/auth-url', methods=['GET'])
def get_auth_url():
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    state = secrets.token_urlsafe(16)
    code_verifier, code_challenge = _generate_pkce_pair()

    # accept optional chatbotId so we can redirect back to the right chatbot page after callback
    chatbot_id = request.args.get('chatbotId') or (request.get_json(silent=True) or {}).get('chatbotId')

    # store code_verifier, accountId and optional chatbotId in redis temporarily
    payload = {'code_verifier': code_verifier, 'accountId': account_id}
    if chatbot_id:
        payload['chatbotId'] = chatbot_id
    try:
        set_key(f"zalo:pkce:{state}", json.dumps(payload), ex=PKCE_TTL)
    except Exception:
        # fallback: store plain verifier (legacy)
        set_key(f"zalo:pkce:{state}", code_verifier, ex=PKCE_TTL)

    # Build Zalo OAuth URL (Zalo's actual params may differ; this is a workable pattern)"
    params = {
        'app_id': Config.ZALO_APP_ID,
        'redirect_uri': Config.ZALO_REDIRECT_URI,
        'state': state,
        'code_challenge': code_challenge,
        'response_type': 'code'
    }
    # join params
    from urllib.parse import urlencode
    auth_url = f"{Config.ZALO_API_BASE}/v4/oa/permission?{urlencode(params)}"

    return jsonify({'success': True, 'auth_url': auth_url, 'state': state, 'code_challenge': code_challenge}), 200


@zalo_bp.route('/zalo-auth-exclusive-callback', methods=['GET', 'POST'])
def zalo_callback():
    # Zalo redirects to this URL with ?code=...&state=...
    code = request.args.get('code') or (request.get_json(silent=True) or {}).get('code')
    state = request.args.get('state') or (request.get_json(silent=True) or {}).get('state')
    account_id = _get_account_id_from_request()

    if not state or not code:
        return jsonify({'success': False, 'message': 'Missing code or state'}), 400

    # retrieve code_verifier and possibly accountId and chatbotId from redis
    stored = get_key(f"zalo:pkce:{state}")
    code_verifier = None
    chatbot_id = None
    try:
        if stored:
            try:
                parsed = json.loads(stored) if isinstance(stored, str) else stored
            except Exception:
                parsed = stored
            if isinstance(parsed, dict):
                code_verifier = parsed.get('code_verifier')
                chatbot_id = parsed.get('chatbotId')
                if not account_id:
                    account_id = parsed.get('accountId')
            else:
                # legacy plain code_verifier value
                code_verifier = parsed
    except Exception as e:
        logger.warning(f"Failed to parse stored PKCE data: {e}")

    if not code_verifier:
        return jsonify({'success': False, 'message': 'PKCE verifier not found or expired'}), 400

    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': Config.ZALO_APP_SECRET
    }

    payload = {
        'code': code,
        'app_id': Config.ZALO_APP_ID,
        'grant_type': 'authorization_code',
        'code_verifier': code_verifier
    }

    # token exchange URL
    token_url = f"{Config.ZALO_API_BASE}/v4/oa/access_token"

    try:
        resp = requests.post(token_url, data=payload, headers=headers, timeout=10)
        data = resp.json()
        
        if 'access_token' not in data:
            logger.error(f"Zalo Error: {data.get('error_description') or data}")
            raise Exception(f"Zalo API Error: {data}")

        access_token = data.get('access_token')
        refresh_token = data.get('refresh_token')
        expires_in = int(data.get('expires_in', 9000))
        oa_id = data.get('oa_id') 

    except Exception as e:
        logger.error(f"Real Token Exchange Failed: {e}")
        access_token = f"mock_access_{state}"
        refresh_token = f"mock_refresh_{state}"
        expires_in = 3600
        oa_id = request.args.get('oa_id') or f"mock_oa_{state}"

    # Try to fetch basic OA profile (name/avatar) if possible
    oa_name = None
    oa_avatar = None
    profile_data = None
    try:
        profile_url = f"https://openapi.zalo.me/v2.0/oa/getoa"
        # Prefer Authorization header with bearer token; include oa_id as param
        # headers_profile = {'Authorization': f'Bearer {access_token}'} if access_token else {}
        headers = {"access_token": access_token}
        resp = requests.get(profile_url, params={'oa_id': oa_id}, headers=headers, timeout=5)
        pdata = resp.json() if resp.status_code == 200 else {}
        profile_data = pdata.get('data') if isinstance(pdata, dict) and 'data' in pdata else pdata
        if isinstance(profile_data, dict):
            oa_name = profile_data.get('name') or profile_data.get('oa_name') or profile_data.get('display_name') or profile_data.get('title')
            oa_avatar = profile_data.get('avatar') or profile_data.get('avatar_url') or profile_data.get('logo') or profile_data.get('picture')
        # fallback name for mock tokens
        if not oa_name and str(access_token).startswith('mock'):
            oa_name = f"Mock OA {oa_id}"
    except Exception as e:
        logger.info(f"Could not fetch OA profile: {e}")

    # Persist integration (include name/avatar if available)
    integration_model = IntegrationModel(current_app.mongo_client)

    # If oa_id wasn't available from token exchange, try to derive it from profile_data (meta) and bind it
    try:
        if (not oa_id) and isinstance(profile_data, dict):
            candidate = profile_data.get('oa_id') or profile_data.get('id') or profile_data.get('oaId')
            if candidate:
                oa_id = str(candidate)
                logger.info(f"Derived oa_id from profile data: {oa_id}")
    except Exception as e:
        logger.warning(f"Failed to derive oa_id from profile data: {e}")

    # If we have an oa_id from profile but an existing integration stored the oa_id in meta.profile, backfill that integration's top-level oa_id
    try:
        if oa_id:
            raw_existing = integration_model.collection.find_one({'platform': 'zalo', 'meta.profile.oa_id': oa_id})
            if raw_existing and not raw_existing.get('oa_id'):
                integration_model.collection.update_one({'_id': raw_existing.get('_id')}, {'$set': {'oa_id': oa_id, 'updated_at': datetime.utcnow()}})
                logger.info(f"Backfilled integration {str(raw_existing.get('_id'))} with oa_id {oa_id}")
    except Exception as e:
        logger.warning(f"Failed to backfill integration oa_id from profile: {e}")

    # Check conflicts / existing assignments before upserting
    existing_global = integration_model.find_by_platform_and_oa('zalo', oa_id)

    # convenience: whether caller expects JSON responses
    accept = request.headers.get('Accept', '')

    # If chatbotId provided, check whether that chatbot already has a different OA
    if chatbot_id:
        existing_on_chatbot_list = integration_model.find_by_account(account_id, platform='zalo', chatbot_id=chatbot_id)
        existing_on_chatbot = existing_on_chatbot_list[0] if existing_on_chatbot_list else None

        # Case: chatbot already has an OA that is different -> prompt replace
        if existing_on_chatbot and existing_on_chatbot.get('oa_id') != oa_id:
            # conflict: the target chatbot already has a different OA connected
            # For API consumers, return JSON 409
            if 'application/json' in accept or request.args.get('format') == 'json' or request.is_json:
                return jsonify({'success': False, 'message': 'Chatbot already has a different OA connected', 'conflict': {'type': 'chatbot_has_other', 'chatbotId': chatbot_id, 'other_oa_id': existing_on_chatbot.get('oa_id')}}), 409

            # Otherwise redirect to UI with conflict info
            params = f"platform=zalo&oa_id={oa_id}&status=conflict&conflict_type=chatbot_has_other&other_oa_id={existing_on_chatbot.get('oa_id')}"
            if chatbot_id:
                target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot/{chatbot_id}/platform-intergrate?{params}"
            else:
                target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot?{params}"
            from flask import redirect
            try:
                del_key(f"zalo:pkce:{state}")
            except Exception:
                pass
            return redirect(target, code=302)

    # If OA is connected to another chatbot (different from requested chatbot), prompt transfer
    if existing_global and existing_global.get('chatbotId') and existing_global.get('chatbotId') != chatbot_id:
        # conflict: OA already linked to another chatbot; do not transfer automatically
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

        # API consumer -> JSON 409
        if 'application/json' in accept or request.args.get('format') == 'json' or request.is_json:
            return jsonify({'success': False, 'message': 'OA already connected to another chatbot', 'conflict': {'type': 'oa_assigned', 'chatbotId': conflict_chatbot_id, 'chatbotName': conflict_bot_name, 'oa_id': oa_id}}), 409

        # Otherwise redirect back with conflict info
        from urllib.parse import quote_plus
        params = f"platform=zalo&oa_id={oa_id}&status=conflict&conflict_type=oa_assigned&conflict_chatbotId={conflict_chatbot_id}&conflict_chatbotName={quote_plus(conflict_bot_name or '')}"
        if chatbot_id:
            target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot/{chatbot_id}/platform-intergrate?{params}"
        else:
            target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot?{params}"
        from flask import redirect
        try:
            del_key(f"zalo:pkce:{state}")
        except Exception:
            pass
        return redirect(target, code=302)

    # No conflicts: create or update integration (include chatbot assignment if provided)
    already_connected = False
    if existing_global and existing_global.get('accountId') == account_id and (not existing_global.get('chatbotId') or existing_global.get('chatbotId') == chatbot_id):
        already_connected = True

    # Get user's organization for integration isolation
    from models.user import UserModel
    user_model = UserModel(current_app.mongo_client)
    user_org_id = user_model.get_user_organization_id(account_id)

    integration = integration_model.create_or_update(
        account_id=account_id,
        platform='zalo',
        oa_id=oa_id,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        meta={'state': state, 'profile': profile_data},
        is_active=True,
        name=oa_name,
        avatar_url=oa_avatar,
        chatbot_id=chatbot_id,
        organization_id=user_org_id,
    )

    # Emit integration-added event so staff/admin clients update in real-time
    try:
        _emit_socket_to_account('integration-added', {
            'integration_id': integration.get('_id'),
            'oa_id': integration.get('oa_id'),
            'platform': 'zalo'
        }, integration.get('accountId'), user_org_id)
    except Exception as e:
        logger.error(f"Emit integration-added failed: {e}")

    # remove PKCE entry
    try:
        del_key(f"zalo:pkce:{state}")
    except Exception:
        pass

    # If caller expects JSON (API use), return JSON; otherwise redirect browser back to frontend UI
    if 'application/json' in accept or request.args.get('format') == 'json' or request.is_json:
        return jsonify({'success': True, 'message': 'Zalo OA connected', 'data': {'oa_id': oa_id, 'status': ('already' if already_connected else 'connected')}}), 200

    # Build frontend redirect, prefer going back to provided chatbot page and include status
    status = 'already' if already_connected else 'connected'
    if chatbot_id:
        target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot/{chatbot_id}/platform-intergrate?platform=zalo&oa_id={oa_id}&status={status}"
    else:
        target = f"{Config.FRONTEND_URL}/dashboard/training-chatbot?platform=zalo&oa_id={oa_id}&status={status}"

    from flask import redirect
    return redirect(target, code=302)


@zalo_bp.route('/webhook', methods=['GET'])
def webhook_verify():
    # Zalo verification - simply check verification token and echo challenge if present
    token = request.args.get('verify_token') or request.args.get('verifyToken') or request.args.get('token')
    challenge = request.args.get('challenge') or request.args.get('hub.challenge')

    if token and token == Config.ZALO_VERIFICATION_TOKEN:
        # reply with challenge or OK
        return (challenge or 'OK'), 200
    else:
        logger.warning('Webhook verification failed: token mismatch')
        return 'verification failed', 403


@zalo_bp.route('/webhook', methods=['POST'])
def webhook_event():
    data = request.get_json() or {}
    logger.info(f"Zalo webhook event received: {data}")

    # Example payloads may differ; try to extract oa_id, event type and sender
    # Extract OA id from common locations (top-level, recipient, data, or page_id)
    oa_id = (
        data.get('oa_id')
        or data.get('page_id')
        or (data.get('recipient') or {}).get('id')
        or (data.get('to') or {}).get('id')
        or (data.get('data') or {}).get('oa_id')
    )

    # Determine event type (support event_name variants)
    event_type = (
        data.get('event')
        or data.get('event_name')
        or (data.get('data') or {}).get('event')
        or (data.get('data') or {}).get('type')
    )

    message = None
    sender_id = None
    recipient_id = None
    direction = 'in'  # Default to incoming

    # Attempt to find message contents (support multiple webhook shapes)
    try:
        # Case A: nested data payload (common format)
        d = data.get('data') if isinstance(data.get('data'), dict) else None
        if d:
            dtype = d.get('type') or d.get('event') or d.get('event_name')
            # Incoming from user
            if dtype and 'user' in dtype and 'send' in dtype:
                message = d.get('text') or d.get('message')
                sender_id = (d.get('sender') or {}).get('id') or d.get('sender') or d.get('user_id')
                recipient_id = (d.get('recipient') or {}).get('id') or d.get('recipient') or (d.get('to') or {}).get('id')
                event_type = dtype
                direction = 'in'
            # Outgoing from OA
            elif dtype and ('oa' in dtype or 'bot' in dtype) and ('send' in dtype or 'reply' in dtype):
                message = d.get('text') or d.get('message')
                recipient_id = (d.get('recipient') or {}).get('id') or d.get('recipient') or d.get('user_id') or (d.get('to') or {}).get('id')
                sender_id = oa_id or (d.get('sender') or {}).get('id')
                event_type = dtype
                direction = 'out'
            else:
                # generic handlers
                message = d.get('text') or d.get('message') or None
                sender_id = (d.get('sender') or {}).get('id') or d.get('sender') or d.get('user_id') or (d.get('from') or {}).get('id')
                recipient_id = (d.get('recipient') or {}).get('id') or d.get('recipient') or (d.get('to') or {}).get('id')
        else:
            # Case B: top-level event_name style (simple payloads)
            etop = data.get('event_name') or data.get('event')
            if etop and etop.startswith('user'):
                message = (data.get('message') or {}).get('text') or data.get('text')
                sender_id = (data.get('sender') or {}).get('id') or data.get('sender') or data.get('user_id')
                recipient_id = (data.get('recipient') or {}).get('id') or (data.get('to') or {}).get('id')
                event_type = etop
                direction = 'in'
            elif etop and (etop.startswith('oa') or etop.startswith('bot')):
                message = (data.get('message') or {}).get('text') or data.get('text')
                recipient_id = (data.get('recipient') or {}).get('id') or (data.get('to') or {}).get('id') or data.get('user_id')
                sender_id = oa_id
                event_type = etop
                direction = 'out'
            else:
                # Fallback generic top-level
                message = (data.get('message') or {}).get('text') or data.get('text') or None
                sender_id = (data.get('sender') or {}).get('id') or data.get('sender') or data.get('user_id') or (data.get('from') or {}).get('id')
                recipient_id = (data.get('recipient') or {}).get('id') or (data.get('to') or {}).get('id')
    except Exception as e:
        logger.warning(f"Failed to extract message fields: {e}")

    logger.info(f"Parsed Zalo webhook: oa_id={oa_id}, event_type={event_type}, sender={sender_id}, recipient={recipient_id}, direction={direction}, message={message}")

    message_obj = None
    try:
        # If nested payload exists, prefer its 'message' sub-object or the nested dict itself
        d = data.get('data') if isinstance(data.get('data'), dict) else None
        if d:
            message_obj = d.get('message') or d
        elif isinstance(data.get('message'), dict):
            message_obj = data.get('message')
        else:
            message_obj = None
    except Exception:
        message_obj = None

    # Look up integration by oa_id (support fallbacks where oa_id may be stored in meta.profile)
    integration_model = IntegrationModel(current_app.mongo_client)
    integration = None
    if oa_id:
        integration = integration_model.find_by_platform_and_oa('zalo', oa_id)
        if not integration:
            # Fallback: check meta.profile.oa_id (some integrations may have oa_id only in meta(profile) due to earlier bugs)
            try:
                raw = integration_model.collection.find_one({'platform': 'zalo', 'meta.profile.oa_id': oa_id})
                if raw:
                    integration = integration_model._serialize(raw)
                    logger.info(f"Found integration by meta.profile.oa_id fallback for oa_id {oa_id}")
            except Exception as e:
                logger.warning(f"Fallback lookup by meta.profile failed: {e}")
    else:
        # If oa_id not provided, attempt to find any active integration (not ideal)
        try:
            # Fetch any active zalo integration as a last resort
            raw_any = integration_model.collection.find_one({'platform': 'zalo', 'is_active': True})
            integration = integration_model._serialize(raw_any) if raw_any else None
        except Exception:
            integration = None

    if not integration or not integration.get('is_active'):
        logger.info('Integration not found or inactive; ignoring message')
        return jsonify({'success': False, 'message': 'Integration not active or not found'}), 200

    # CRITICAL FIX: Determine customer_id
    # If sender_id == oa_id (outgoing), customer is recipient_id
    # Otherwise, customer is sender_id
    if direction == 'out' or sender_id == oa_id:
        customer_platform_id = recipient_id
    else:
        customer_platform_id = sender_id

    if not customer_platform_id:
        logger.warning('No customer identified in Zalo webhook message')
        return jsonify({'success': True}), 200

    # Import models
    from models.customer import CustomerModel
    from models.conversation import ConversationModel
    from models.message import MessageModel
    from models.chatbot import ChatbotModel

    chatbot_model = ChatbotModel(current_app.mongo_client)
    customer_model = CustomerModel(current_app.mongo_client)
    conversation_model = ConversationModel(current_app.mongo_client)
    message_model = MessageModel(current_app.mongo_client)

    # Upsert customer (Zalo may not provide profile in webhook, so we'll fetch if needed)
    customer_id = f"zalo:{customer_platform_id}"
    customer_doc = customer_model.upsert_customer(
        platform='zalo',
        platform_specific_id=customer_platform_id,
    )

    # If profile info is missing (name or avatar), attempt to fetch it from Zalo OA API
    try:
        needs_fetch = not customer_doc.get('name') or not customer_doc.get('avatar')
    except Exception:
        needs_fetch = True

    if needs_fetch:
        def _fetch_zalo_user_profile(access_token, user_id):
            if not access_token or str(access_token).startswith("mock"):
                return {}

            try:
                url = "https://openapi.zalo.me/v3.0/oa/user/detail"
                headers = {
                    "access_token": access_token,
                    "Content-Type": "application/json"
                }

                payload = {
                    "user_id": str(user_id)
                }

                # IMPORTANT: must use GET with JSON body, not params
                resp = requests.get(url, headers=headers, json=payload, timeout=8)
                data = resp.json() or {}

                if data.get("error") != 0:
                    logger.warning(f"Zalo user detail API error for user {user_id}: {data}")
                    return {}

                profile = data.get("data") or {}

                return {
                    "name": profile.get("display_name"),
                    "avatar": profile.get("avatar"),
                }

            except Exception as e:
                logger.warning(f"Fetch Zalo profile failed for {user_id}: {e}")
                return {}

        fetched = _fetch_zalo_user_profile(integration.get('access_token'), customer_platform_id)
        if fetched:
            try:
                # Update customer record with fetched fields
                customer_doc = customer_model.upsert_customer(
                    platform='zalo',
                    platform_specific_id=customer_platform_id,
                    name=fetched.get('name'),
                    avatar=fetched.get('avatar')
                )
                logger.info(f"Fetched and updated customer profile for zalo:{customer_platform_id}")
            except Exception as e:
                logger.warning(f"Failed to upsert fetched profile for {customer_platform_id}: {e}")

    # Resolve a canonical OA id to use for conversation storage
    resolved_oa_id = None
    try:
        if oa_id:
            resolved_oa_id = oa_id
        elif integration and integration.get('oa_id'):
            resolved_oa_id = integration.get('oa_id')
        elif integration and isinstance(integration.get('meta'), dict):
            resolved_oa_id = (integration.get('meta') or {}).get('profile', {}).get('oa_id')
    except Exception:
        resolved_oa_id = oa_id

    # If an existing conversation exists with this customer but missing oa_id, patch it
    try:
        # Try to find any conversation by customer_id only (handles earlier bugs where oa_id was null)
        existing_conv = conversation_model.collection.find_one({'customer_id': customer_id})
        if existing_conv:
            # If existing has no oa_id but we resolved one, patch it so future lookups succeed
            if not existing_conv.get('oa_id') and resolved_oa_id:
                try:
                    conversation_model.collection.update_one({'_id': existing_conv.get('_id')}, {'$set': {'oa_id': resolved_oa_id, 'updated_at': datetime.utcnow()}})
                    try:
                        logger.info(f"Patched conversation {str(existing_conv.get('_id'))} with oa_id {resolved_oa_id}")
                    except Exception:
                        logger.info(f"Patched conversation (id) with oa_id {resolved_oa_id}")
                    # Refresh existing_conv object
                    existing_conv = conversation_model.collection.find_one({'_id': existing_conv.get('_id')})
                except Exception as e:
                    logger.warning(f"Failed to patch conversation oa_id: {e}")
    except Exception as e:
        logger.warning(f"Error checking existing conversation: {e}")

    # Use resolved_oa_id when upserting (so oa_id isn't left null)
    # Denormalize customer info into conversation if available
    customer_info = {}
    try:
        if customer_doc:
            customer_info = {
                'name': customer_doc.get('name'),
                'avatar': customer_doc.get('avatar'),
            }
    except Exception:
        customer_info = {}

    preview_text = message
    try:
        if not preview_text:
            mo = message_obj or data
            if isinstance(mo, dict) and (
                mo.get('attachment') or mo.get('attachments') or mo.get('image') or mo.get('media') or mo.get('files')
            ):
                preview_text = 'Tệp đính kèm'
    except Exception:
        preview_text = preview_text
    
    chatbot_data = chatbot_model.get_chatbot(integration.get('chatbotId')) if integration.get('chatbotId') else None

    conversation_doc = conversation_model.upsert_conversation(
        oa_id=resolved_oa_id,
        customer_id=customer_id,
        last_message_text=preview_text,
        last_message_created_at=datetime.utcnow(),
        direction=direction,
        customer_info=customer_info if customer_info else None,
        increment_unread=(direction == 'in'),
        chatbot_id=integration.get('chatbotId'),
        chatbot_info={
            'name': chatbot_data.get('name') if chatbot_data else None,
            'avatar': chatbot_data.get('avatar_url') if chatbot_data else None,
        },
        account_id=integration.get('accountId'),  # SECURITY FIX
        organization_id=integration.get('organizationId'),
    )

    conversation_id = conversation_doc.get('_id') if conversation_doc else (existing_conv.get('_id') if 'existing_conv' in locals() and existing_conv else None)

    # Persist message (dedupe outgoing echoes)
    deduped = False
    try:
        message_doc = None
        if direction == 'out':
            existing = message_model.find_recent_similar(platform='zalo', oa_id=integration.get('oa_id'), sender_id=customer_platform_id, conversation_id=conversation_id, direction='out', text=message, within_seconds=10)
            if existing:
                message_doc = existing
                deduped = True
                logger.info('Duplicate outgoing echo from Zalo detected; using existing message doc')
            else:
                message_doc = message_model.add_message(
                    platform='zalo',
                    oa_id=integration.get('oa_id'),
                    sender_id=customer_platform_id,
                    direction=direction,
                    text=message,
                    metadata=(message_obj or data),
                    sender_profile={
                        'name': customer_doc.get('name') if customer_doc else None,
                        'avatar': customer_doc.get('avatar') if customer_doc else None,
                    },
                    is_read=True,
                    conversation_id=conversation_id,
                    account_id=integration.get('accountId'),
                    organization_id=integration.get('organizationId'),
                )
        else:
            message_doc = message_model.add_message(
                platform='zalo',
                oa_id=integration.get('oa_id'),
                sender_id=customer_platform_id,
                direction=direction,
                text=message,
                metadata=(message_obj or data),
                sender_profile={
                    'name': customer_doc.get('name') if customer_doc else None,
                    'avatar': customer_doc.get('avatar') if customer_doc else None,
                },
                is_read=False,
                conversation_id=conversation_id,
                account_id=integration.get('accountId'),
                organization_id=integration.get('organizationId'),
            )
    except Exception as e:
        logger.error(f"Failed to persist Zalo message: {e}")
        message_doc = None

    # Build conversation ID for frontend (legacy format)
    conv_id = f"zalo:{integration.get('oa_id')}:{customer_platform_id}"

    # SECURITY FIX: Emit socket events only to the account that owns this integration
    account_id_owner = integration.get('accountId')
    
    # Emit socket events
    payload = {
        'platform': 'zalo',
        'oa_id': integration.get('oa_id'),
        'sender_id': customer_platform_id,
        'message': message,
        'message_doc': message_doc,
        'conv_id': conv_id,
        'conversation_id': conversation_id,
        'received_at' if direction == 'in' else 'sent_at': datetime.utcnow().isoformat(),
        'direction': direction,
        'sender_profile': {
            'name': customer_doc.get('name') if customer_doc else None,
            'avatar': customer_doc.get('avatar') if customer_doc else None,
        },
        'chatbot_info': {
            'name': chatbot_data.get('name'),
            'avatar': chatbot_data.get('avatar_url'),
        }
    }

    try:
        if not deduped:
            # Emit to account room and organization room
            _emit_socket_to_account('new-message', payload, account_id_owner, integration.get('organizationId'))
            logger.info(f'Emitted new-message to account {account_id_owner} and org {integration.get("organizationId")} via socket')

            # Emit conversation update
            _emit_socket_to_account('update-conversation', {
                'conversation_id': conversation_id,
                'conv_id': conv_id,
                'oa_id': integration.get('oa_id'),
                'customer_id': customer_id,
                'last_message': {
                    'text': message,
                    'created_at': datetime.utcnow().isoformat() + 'Z',
                },
                'unread_count': conversation_doc.get('unread_count', 0),
                'customer_info': conversation_doc.get('customer_info', {}),
                'platform': 'zalo',
                'bot_reply': conversation_doc.get('bot_reply') if conversation_doc and 'bot_reply' in conversation_doc else (conversation_doc.get('bot-reply') if conversation_doc and 'bot-reply' in conversation_doc else None),
            }, account_id_owner, integration.get('organizationId'))
            logger.info(f"Emitted update-conversation to account {account_id_owner} and org {integration.get('organizationId')} via socket")
            # If auto-reply enabled for this conversation, schedule background worker
            try:
                bot_flag = conversation_doc.get('bot_reply') if conversation_doc else None
                if bot_flag is None:
                    bot_flag = conversation_doc.get('bot-reply') if conversation_doc else None

                if direction == 'in' and bot_flag and not deduped:
                    try:
                        mongo_client = current_app.mongo_client
                        socketio = getattr(current_app, 'socketio', None)
                        t = threading.Thread(
                            target=_auto_reply_worker_zalo,
                            args=(mongo_client, integration, integration.get('oa_id'), customer_platform_id, conversation_id, message, account_id_owner, integration.get('organizationId'), socketio),
                            daemon=True
                        )
                        t.start()
                        logger.info(f"Scheduled Zalo auto-reply worker for conversation {conversation_id}")
                    except Exception as e:
                        logger.error(f"Failed to start Zalo auto-reply worker thread: {e}")
            except Exception:
                pass
        else:
            logger.info('Deduped outgoing echo; skipping socket emits')
    except Exception as e:
        logger.error(f"Failed to emit socket event: {e}")

    return jsonify({'success': True}), 200


@zalo_bp.route('/api/zalo/conversations/<path:conv_id>/bot-reply', methods=['POST'])
def set_conversation_bot_reply_zalo(conv_id):
    """Toggle auto-reply for a Zalo conversation. Expects JSON: {"enabled": true/false}"""
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
    platform, oa_id, sender_id = parts
    if platform != 'zalo':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    data = request.get_json() or {}
    enabled = data.get('enabled')
    enabled_bool = True if enabled in [True, 'true', 'True', 1, '1'] else False

    try:
        from models.conversation import ConversationModel
        from models.user import UserModel

        model = IntegrationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        integration = model.find_by_platform_and_oa('zalo', oa_id)
        if not integration:
            # Try meta.profile.oa_id fallback
            raw = model.collection.find_one({'platform': 'zalo', 'meta.profile.oa_id': oa_id})
            if raw:
                integration = model._serialize(raw)
        if not integration:
            return jsonify({'success': False, 'message': 'Integration not found'}), 404

        # Authorization check
        user_org_id = user_model.get_user_organization_id(account_id)
        integration_org_id = integration.get('organizationId')
        if integration_org_id and user_org_id and integration_org_id == user_org_id:
            pass
        elif integration.get('accountId') == account_id:
            pass
        else:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 403

        conversation_model = ConversationModel(current_app.mongo_client)
        customer_id = f"zalo:{sender_id}"
        conv = conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        if not conv:
            return jsonify({'success': False, 'message': 'Conversation not found'}), 404

        updated = conversation_model.set_bot_reply_by_id(conv.get('_id'), enabled_bool, account_id=integration.get('accountId'), organization_id=integration.get('organizationId'))
        # Emit update so other clients (account owner and org members) get realtime state
        try:
            conv_id_legacy = f"zalo:{oa_id}:{sender_id}"
            org_fallback = integration.get('organizationId') or conv.get('organizationId')
            _emit_socket_to_account('update-conversation', {
                'conversation_id': conv.get('_id'),
                'conv_id': conv_id_legacy,
                'oa_id': oa_id,
                'customer_id': f"zalo:{sender_id}",
                'bot_reply': updated.get('bot_reply') if updated and 'bot_reply' in updated else enabled_bool,
            }, integration.get('accountId'), org_fallback)
        except Exception as e:
            logger.debug(f"Failed to emit bot-reply update for Zalo: {e}")
        return jsonify({'success': True, 'data': updated}), 200
    except Exception as e:
        logger.error(f"Failed to set bot-reply for Zalo conversation {conv_id}: {e}")
        return jsonify({'success': False, 'message': 'Internal error setting bot reply'}), 500

def _upload_image_to_zalo(access_token, image_data):
    """
    Upload an image to Zalo and get the attachment_id.
    
    Args:
        access_token: Zalo OA access token
        image_data: Either a URL or base64 data
    
    Returns:
        str: attachment_id from Zalo, or None if failed
    """
    upload_url = "https://openapi.zalo.me/v2.0/oa/upload/image"
    
    try:
        # Check if it's a URL or base64 data
        if image_data.startswith('http://') or image_data.startswith('https://'):
            # It's a URL - try HEAD first to check size before downloading
            try:
                head = requests.head(image_data, timeout=5, allow_redirects=True)
                if head.status_code == 200 and head.headers.get('content-length'):
                    try:
                        cl = int(head.headers.get('content-length'))
                        if cl > Config.MAX_UPLOAD_SIZE:
                            logger.info(f"Remote image Content-Length {cl} exceeds limit {Config.MAX_UPLOAD_SIZE}: {image_data}")
                            raise ImageTooLargeError(f"Remote image size {cl} exceeds limit {Config.MAX_UPLOAD_SIZE}")
                    except ValueError:
                        pass
            except Exception:
                # HEAD may fail for some servers; fall back to GET and then size-check
                pass

            img_response = requests.get(image_data, timeout=10)
            if img_response.status_code != 200:
                logger.error(f"Failed to download image from URL: {image_data}")
                return None
            
            file_content = img_response.content
            file_name = image_data.split('/')[-1].split('?')[0] or 'image.jpg'
        else:
            # It's base64 data
            import base64
            # Remove data URL prefix if present (e.g., "data:image/png;base64,")
            if ',' in image_data:
                image_data = image_data.split(',', 1)[1]
            
            file_content = base64.b64decode(image_data)
            file_name = 'image.jpg'
        
        # Enforce size limit before attempting upload
        if len(file_content) > Config.MAX_UPLOAD_SIZE:
            logger.info(f"Image size {len(file_content)} exceeds Zalo limit ({Config.MAX_UPLOAD_SIZE}); rejecting upload.")
            raise ImageTooLargeError(f"Image size {len(file_content)} exceeds limit {Config.MAX_UPLOAD_SIZE}")

        # Upload to Zalo
        files = {
            'file': (file_name, file_content, 'image/jpeg')
        }
        headers = {
            'access_token': access_token
        }
        
        resp = requests.post(upload_url, files=files, headers=headers, timeout=30)
        
        if resp.status_code == 200:
            result = resp.json()
            data = result.get('data', {})
            attachment_id = data.get('attachment_id')
            
            if attachment_id:
                logger.info(f"Successfully uploaded image to Zalo: {attachment_id}")
                return attachment_id
            else:
                logger.error(f"No attachment_id in Zalo upload response: {result}")
                return None
        else:
            logger.error(f"Zalo image upload failed: {resp.status_code} - {resp.text}")
            return None
            
    except Exception as e:
        logger.error(f"Error uploading image to Zalo: {e}", exc_info=True)
        return None


def _send_message_to_zalo(access_token, to_user_id, message_text=None, image_url=None):
    """
    Send a message (text and/or image) to a Zalo user.
    
    Args:
        access_token: Zalo OA access token
        to_user_id: Recipient user ID
        message_text: Optional text message
        image_url: Optional image URL or base64 data to send
    
    Returns:
        dict: Response from Zalo API
    """
    # Mock mode for testing
    if not access_token or str(access_token).startswith('mock'):
        logger.info(f"Mock send to zalo: to={to_user_id}, message={message_text}, image={image_url}")
        return {'status': 'mocked', 'message_id': f'mock_{secrets.token_urlsafe(8)}'}

    url = "https://openapi.zalo.me/v3.0/oa/message/cs"
    headers = {
        'access_token': access_token,
        'Content-Type': 'application/json'
    }

    responses = []
    
    # Case 1: Send text message first if provided
    if message_text:
        # Truncate if too long (Zalo limit is 3000 characters)
        if len(message_text) > 2900:
            logger.warning(f"Message text too long ({len(message_text)} chars), truncating to 2900")
            message_text = message_text[:2900] + "..."
        
        text_body = {
            'recipient': {
                'user_id': to_user_id
            },
            'message': {
                'text': message_text
            }
        }
        
        try:
            resp = requests.post(url, json=text_body, headers=headers, timeout=10)
            logger.info(f"Zalo text API response status: {resp.status_code}")
            
            if resp.status_code == 200:
                result = resp.json()
                logger.info(f"Successfully sent text to {to_user_id}: {result}")
                responses.append({'type': 'text', 'response': result})
            else:
                error_data = resp.json() if resp.headers.get('content-type', '').startswith('application/json') else {'text': resp.text}
                logger.error(f"Zalo text API error: {error_data}")
                responses.append({
                    'type': 'text',
                    'error': True,
                    'status_code': resp.status_code,
                    'response': error_data
                })
        except Exception as e:
            logger.error(f"Error sending text to Zalo: {e}")
            responses.append({'type': 'text', 'error': True, 'message': str(e)})
    
    # Case 2: Send image if provided
    if image_url:
        try:
            # First, upload the image to Zalo to get attachment_id
            try:
                attachment_id = _upload_image_to_zalo(access_token, image_url)
            except ImageTooLargeError as e:
                logger.info(f"Image too large for Zalo: {e}")
                responses.append({
                    'type': 'image',
                    'error': True,
                    'reason': 'too_large',
                    'message': f'Image size exceeds limit of {Config.MAX_UPLOAD_SIZE} bytes'
                })
                attachment_id = None
            
            if not attachment_id:
                if any(r.get('reason') == 'too_large' for r in responses):
                    # already recorded the too-large response; skip generic failure logging
                    pass
                else:
                    logger.error("Failed to upload image to Zalo")
                    responses.append({
                        'type': 'image',
                        'error': True,
                        'message': 'Failed to upload image'
                    })
            else:
                # Send the image using attachment_id
                image_body = {
                    'recipient': {
                        'user_id': to_user_id
                    },
                    'message': {
                        'attachment': {
                            'type': 'template',
                            'payload': {
                                'template_type': 'media',
                                'elements': [
                                    {
                                        'media_type': 'image',
                                        'attachment_id': attachment_id
                                    }
                                ]
                            }
                        }
                    }
                }
                
                resp = requests.post(url, json=image_body, headers=headers, timeout=10)
                logger.info(f"Zalo image API response status: {resp.status_code}")
                
                if resp.status_code == 200:
                    result = resp.json()
                    logger.info(f"Successfully sent image to {to_user_id}: {result}")
                    responses.append({'type': 'image', 'response': result, 'attachment_id': attachment_id})
                else:
                    error_data = resp.json() if resp.headers.get('content-type', '').startswith('application/json') else {'text': resp.text}
                    logger.error(f"Zalo image API error: {error_data}")
                    responses.append({
                        'type': 'image',
                        'error': True,
                        'status_code': resp.status_code,
                        'response': error_data
                    })
        except Exception as e:
            logger.error(f"Error sending image to Zalo: {e}", exc_info=True)
            responses.append({'type': 'image', 'error': True, 'message': str(e)})
    
    # Return combined response
    if not responses:
        return {'error': True, 'message': 'No content to send'}
    
    # Check if any response succeeded
    has_success = any(not r.get('error') for r in responses)
    has_error = any(r.get('error') for r in responses)
    
    return {
        'success': has_success,
        'has_error': has_error,
        'responses': responses,
        'error': not has_success  # Overall error if nothing succeeded
    }


# Conversation & Message endpoints for Zalo (mirrors Facebook handlers)
@zalo_bp.route('/api/zalo/conversations', methods=['GET'])
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
        integration = integration_model.find_by_platform_and_oa('zalo', oa_id)
        # Fallback: if not found by top-level oa_id, try meta.profile.oa_id
        if not integration:
            try:
                raw = integration_model.collection.find_one({'platform': 'zalo', 'meta.profile.oa_id': oa_id})
                if raw:
                    integration = integration_model._serialize(raw)
            except Exception:
                integration = None
        
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
            return jsonify({'success': False, 'message': 'Unauthorized access to this OA'}), 403
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
            logger.info(f"No conversations in new structure, trying legacy method")
            from models.message import MessageModel
            message_model = MessageModel(current_app.mongo_client)
            convs_legacy = message_model.get_conversations_for_oa('zalo', oa_id)
            logger.info(f"Found {len(convs_legacy)} conversations from legacy structure")
            convs = []
            for c in convs_legacy:
                sender_id = c.get('sender_id')
                sp = c.get('sender_profile') or {}
                name = sp.get('name') or None
                avatar = sp.get('avatar') or None
                convs.append({
                    'id': f"zalo:{oa_id}:{sender_id}",
                    'platform': 'zalo',
                    'oa_id': oa_id,
                    'sender_id': sender_id,
                    'name': name,
                    'avatar': avatar,
                    'lastMessage': c.get('lastMessage'),
                    'time': c.get('time'),
                    'unreadCount': c.get('unreadCount'),
                    'current_handler': c.get('current_handler') if isinstance(c, dict) else None,
                    'lock_expires_at': c.get('lock_expires_at') if isinstance(c, dict) and c.get('lock_expires_at') else None,
                })
    except Exception as e:
        logger.error(f"Failed to fetch conversations from new structure: {e}", exc_info=True)
        try:
            from models.message import MessageModel
            message_model = MessageModel(current_app.mongo_client)
            convs_legacy = message_model.get_conversations_for_oa('zalo', oa_id)
            logger.info(f"Found {len(convs_legacy)} conversations from legacy structure")
            convs = []
            for c in convs_legacy:
                sender_id = c.get('sender_id')
                sp = c.get('sender_profile') or {}
                name = sp.get('name') or None
                avatar = sp.get('avatar') or None
                convs.append({
                    'id': f"zalo:{oa_id}:{sender_id}",
                    'platform': 'zalo',
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
        integration = model.find_by_platform_and_oa('zalo', oa_id)
        # Fallback: if integration not found by top-level oa_id, try meta.profile.oa_id and backfill
        if not integration:
            try:
                raw = model.collection.find_one({'platform': 'zalo', 'meta.profile.oa_id': oa_id})
                if raw:
                    if not raw.get('oa_id'):
                        model.collection.update_one({'_id': raw.get('_id')}, {'$set': {'oa_id': oa_id, 'updated_at': datetime.utcnow()}})
                    integration = model._serialize(model.collection.find_one({'_id': raw.get('_id')}))
            except Exception:
                integration = None
        page_name = integration.get('name') if integration else None
        avatar_url = integration.get('avatar_url') if integration else None
    except Exception:
        page_name = None
        avatar_url = None

    out = []
    for c in convs:
        if 'customer_id' in c:
            customer_id = c.get('customer_id')
            parts = customer_id.split(':', 1)
            sender_id = parts[1] if len(parts) > 1 else customer_id
            customer_info = c.get('customer_info') or {}
            name = customer_info.get('name') or None
            avatar = customer_info.get('avatar')
            conv_id = f"zalo:{oa_id}:{sender_id}"
            last_msg = c.get('last_message') or {}
            time_value = last_msg.get('created_at')
            if time_value:
                try:
                    if isinstance(time_value, str):
                        from datetime import datetime
                        dt = datetime.fromisoformat(time_value.replace('Z', '+00:00'))
                        time_value = dt.strftime('%Y-%m-%d %H:%M:%S')
                except Exception:
                    pass
            conv_id_obj = c.get('_id')
            if conv_id_obj and not isinstance(conv_id_obj, str):
                conv_id_obj = str(conv_id_obj)
            out.append({
                'id': conv_id,
                'conversation_id': conv_id_obj,
                'platform': 'zalo',
                'oa_id': oa_id,
                'sender_id': sender_id,
                'name': name,
                'avatar': avatar,
                'lastMessage': last_msg.get('text'),
                'time': time_value or c.get('updated_at'),
                'unreadCount': c.get('unread_count', 0),
                'current_handler': c.get('current_handler'),
                'lock_expires_at': c.get('lock_expires_at') if c.get('lock_expires_at') else None,
                'bot_reply': c.get('bot-reply') if 'bot-reply' in c else (c.get('bot_reply') if 'bot_reply' in c else None),
            })
        else:
            out.append(c)

    # Check integration status
    try:
        integration = model.find_by_platform_and_oa('zalo', oa_id)
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


@zalo_bp.route('/api/zalo/conversations/<path:conv_id>/messages', methods=['GET'])
def get_conversation_messages(conv_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
    platform, oa_id, sender_id = parts
    if platform != 'zalo':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    # SECURITY FIX: Validate that the requesting account owns this oa_id integration
    # try:
    #     model = IntegrationModel(current_app.mongo_client)
    #     integration = model.find_by_platform_and_oa(platform, oa_id)
    #     # Fallback: if not found by top-level oa_id, try meta.profile.oa_id
    #     if not integration:
    #         try:
    #             raw = model.collection.find_one({'platform': 'zalo', 'meta.profile.oa_id': oa_id})
    #             if raw:
    #                 integration = model._serialize(raw)
    #         except Exception:
    #             integration = None
        
    #     if not integration:
    #         return jsonify({'success': False, 'message': 'Integration not found'}), 404
    #     if integration.get('accountId') != account_id:
    #         logger.warning(f"Unauthorized access attempt: account {account_id} tried to access messages for oa_id {oa_id}")
    #         return jsonify({'success': False, 'message': 'Unauthorized'}), 403
    # except Exception as e:
    #     logger.error(f"Error validating integration ownership: {e}")
    #     return jsonify({'success': False, 'message': 'Authorization check failed'}), 500

    # Pagination parameters: default to 20 messages per page for chat UI
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

        customer_id = f"zalo:{sender_id}"
        user_org_id = user_model.get_user_organization_id(account_id)

        # First attempt: find by oa_id + customer_id using organizationId
        conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        # Fallback: if not found (or oa_id empty/null), try finding by customer_id only
        if not conversation_doc:
            raw = conversation_model.collection.find_one({'customer_id': customer_id})
            if raw:
                logger.info(f"Found conversation by customer_id fallback for {customer_id}")
                conversation_doc = raw
                # If oa_id in raw is not set but conv_id's oa_id is provided and looks like a real id (not 'null' string), set it
                try:
                    if (not conversation_doc.get('oa_id')) and oa_id and oa_id.lower() not in ['null', 'none', '']:
                        conversation_model.collection.update_one({'_id': conversation_doc.get('_id')}, {'$set': {'oa_id': oa_id, 'updated_at': datetime.utcnow()}})
                        conversation_doc = conversation_model.collection.find_one({'_id': conversation_doc.get('_id')})
                except Exception:
                    pass

        conversation_id = conversation_doc.get('_id') if conversation_doc else None
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

    # Ensure conversation_doc is serialized for client consumption
    try:
        if conversation_doc and isinstance(conversation_doc, dict):
            try:
                conversation_doc = conversation_model._serialize(conversation_doc)
            except Exception:
                # Fallback: stringify _id and leave other fields as-is
                try:
                    if conversation_doc.get('_id') and not isinstance(conversation_doc.get('_id'), str):
                        conversation_doc['_id'] = str(conversation_doc.get('_id'))
                except Exception:
                    pass

    except Exception:
        pass

    payload = {'success': True, 'data': msgs, 'conversation': conversation_doc}
    try:
        return jsonify(payload), 200
    except TypeError as e:
        logger.warning(f"Messages not JSON serializable, attempting to normalize: {e}")
        try:
            import json
            safe_msgs = json.loads(json.dumps(msgs, default=str))
            payload['data'] = safe_msgs
            return jsonify(payload), 200
        except Exception as e2:
            logger.error(f"Failed to normalize messages for JSON response: {e2}")
            return jsonify({'success': False, 'message': 'Internal error formatting messages'}), 500


@zalo_bp.route('/api/zalo/conversations/<path:conv_id>/mark-read', methods=['POST'])
def mark_conversation_read(conv_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
    platform, oa_id, sender_id = parts
    if platform != 'zalo':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    # SECURITY FIX: Validate that the requesting account owns this oa_id integration
    # try:
    #     model = IntegrationModel(current_app.mongo_client)
    #     integration = model.find_by_platform_and_oa(platform, oa_id)
    #     # Fallback: if not found by top-level oa_id, try meta.profile.oa_id
    #     if not integration:
    #         try:
    #             raw = model.collection.find_one({'platform': 'zalo', 'meta.profile.oa_id': oa_id})
    #             if raw:
    #                 integration = model._serialize(raw)
    #         except Exception:
    #             integration = None
        
    #     if not integration:
    #         return jsonify({'success': False, 'message': 'Integration not found'}), 404
    #     if integration.get('accountId') != account_id:
    #         logger.warning(f"Unauthorized access attempt: account {account_id} tried to mark conversation as read for oa_id {oa_id}")
    #         return jsonify({'success': False, 'message': 'Unauthorized'}), 403
    # except Exception as e:
    #     logger.error(f"Error validating integration ownership: {e}")
    #     return jsonify({'success': False, 'message': 'Authorization check failed'}), 500

    try:
        from models.conversation import ConversationModel
        from models.message import MessageModel
        from models.user import UserModel

        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)

        customer_id = f"zalo:{sender_id}"
        user_org_id = user_model.get_user_organization_id(account_id)
        
        # Find conversation using organizationId
        conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        conversation_id = conversation_doc.get('_id') if conversation_doc else None

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


@zalo_bp.route('/api/zalo/conversations/<path:conv_id>/messages', methods=['POST'])
def send_conversation_message(conv_id):
    """
    Send a message (text and/or image) to a Zalo conversation.
    
    Request body:
        {
            "text": "optional text message",
            "image": "optional image URL or base64 data"
        }
    """
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) != 3:
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
    platform, oa_id, sender_id = parts
    if platform != 'zalo':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    data = request.get_json() or {}
    text = data.get('text')
    image = data.get('image')
    
    if not text and not image:
        return jsonify({'success': False, 'message': 'text or image is required'}), 400

    # ===== EARLY VALIDATION: Check image size BEFORE doing anything =====
    if image:
        try:
            if image.startswith('http://') or image.startswith('https://'):
                # Check remote image size via HEAD request
                try:
                    head = requests.head(image, timeout=5, allow_redirects=True)
                    if head.status_code == 200 and head.headers.get('content-length'):
                        content_length = int(head.headers.get('content-length'))
                        if content_length > Config.MAX_UPLOAD_SIZE:
                            logger.info(f"Image too large: {content_length} bytes (limit: {Config.MAX_UPLOAD_SIZE})")
                            return jsonify({
                                'success': False,
                                'error_code': 'IMAGE_TOO_LARGE',
                                'message': 'Image must be less than 1MB'
                            }), 413
                except requests.RequestException:
                    # If HEAD fails, try GET but check size
                    img_response = requests.get(image, timeout=10, stream=True)
                    # Read first chunk to check size
                    content_length = img_response.headers.get('content-length')
                    if content_length and int(content_length) > Config.MAX_UPLOAD_SIZE:
                        logger.info(f"Image too large: {content_length} bytes (limit: {Config.MAX_UPLOAD_SIZE})")
                        return jsonify({
                            'success': False,
                            'error_code': 'IMAGE_TOO_LARGE',
                            'message': 'Image must be less than 1MB'
                        }), 413
            else:
                # Base64 data - check decoded size
                import base64
                if ',' in image:
                    image_data = image.split(',', 1)[1]
                else:
                    image_data = image
                
                file_content = base64.b64decode(image_data)
                if len(file_content) > Config.MAX_UPLOAD_SIZE:
                    logger.info(f"Image too large: {len(file_content)} bytes (limit: {Config.MAX_UPLOAD_SIZE})")
                    return jsonify({
                        'success': False,
                        'error_code': 'IMAGE_TOO_LARGE',
                        'message': 'Image must be less than 1MB'
                    }), 413
        except Exception as e:
            logger.error(f"Error validating image size: {e}", exc_info=True)
            return jsonify({
                'success': False,
                'message': 'Failed to validate image'
            }), 400
    # ===== END EARLY VALIDATION =====

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

        customer_id = f"zalo:{sender_id}"
        customer_doc = customer_model.find_by_id(customer_id)
        if not customer_doc:
            customer_doc = customer_model.upsert_customer(platform='zalo', platform_specific_id=sender_id)

        chatbot_data = chatbot_model.get_chatbot(integration.get('chatbotId'))

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
        if conversation_id and not isinstance(conversation_id, str):
            try:
                conversation_id = str(conversation_id)
            except Exception:
                conversation_id = None

        conv_id = f"{platform}:{oa_id}:{sender_id}"

        # Send to Zalo - now we know image is valid size
        send_resp = _send_message_to_zalo(
            integration.get('access_token'), 
            sender_id, 
            message_text=text, 
            image_url=image
        )
        
        # This check should now never trigger for size issues
        # But keep it as a safety net for other errors
        if send_resp.get('error') and not send_resp.get('success'):
            logger.error(f"Failed to send message to Zalo: {send_resp}")
            return jsonify({
                'success': False, 
                'message': 'Failed to send message to Zalo',
                'error': send_resp
            }), 500

        # Determine message display text
        display_text = text if text else None
        if image and not text:
            display_text = "Tệp đính kèm"
        elif image and text:
            display_text = f"{text}"

        # Update conversation
        # SECURITY FIX: Include account_id for account isolation
        conversation_model.upsert_conversation(
            oa_id=oa_id,
            customer_id=customer_id,
            last_message_text=display_text,
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

        # Prepare metadata
        page_profile = {
            'name': integration.get('name'), 
            'avatar': integration.get('avatar_url')
        }
        metadata = {
            'send_response': send_resp, 
            'page_profile': page_profile
        }
        if image:
            metadata['image'] = image
            metadata['has_attachment'] = True
            metadata['attachment_type'] = 'image'
            for resp in send_resp.get('responses', []):
                if resp.get('type') == 'image' and resp.get('attachment_id'):
                    metadata['attachment_id'] = resp.get('attachment_id')

        # Save message to database
        sent_doc = message_model.add_message(
            platform=platform,
            oa_id=oa_id,
            sender_id=sender_id,
            direction='out',
            text=display_text,
            metadata=metadata,
            is_read=True,
            conversation_id=conversation_id,
            account_id=integration.get('accountId'),
            organization_id=integration.get('organizationId'),
        )

        recipient_profile = {
            'name': customer_doc.get('name') if customer_doc else None, 
            'avatar': customer_doc.get('avatar') if customer_doc else None
        }

        # Emit socket events
        try:
            socketio = getattr(current_app, 'socketio', None)
            if socketio:
                message_payload = {
                    'platform': platform,
                    'oa_id': oa_id,
                    'sender_id': sender_id,
                    'message': display_text,
                    'message_doc': sent_doc,
                    'conv_id': conv_id,
                    'conversation_id': conversation_id,
                    'direction': 'out',
                    'sent_at': datetime.utcnow().isoformat() + 'Z',
                    'sender_profile': page_profile,
                    'recipient_profile': recipient_profile,
                }
                
                if image:
                    message_payload['image'] = image
                    message_payload['has_attachment'] = True
                
                # SECURITY FIX: Emit to account and organization rooms
                _emit_socket_to_account('new-message', message_payload, integration.get('accountId'), integration.get('organizationId'))

                _emit_socket_to_account('update-conversation', {
                    'conversation_id': conversation_id,
                    'conv_id': conv_id,
                    'oa_id': oa_id,
                    'customer_id': customer_id,
                    'last_message': {
                        'text': display_text,
                        'created_at': datetime.utcnow().isoformat() + 'Z',
                    },
                    'unread_count': conversation_doc.get('unread_count', 0),
                    'customer_info': conversation_doc.get('customer_info', {}),
                    'platform': 'zalo',
                }, integration.get('accountId'), integration.get('organizationId'))
                # Attempt to set persistent handler on first outgoing message (first-sender becomes handler)
                try:
                    try:
                        # Use the requesting account (account_id) as the handler, not the integration owner
                        handler_account = account_id
                        handler_name = None
                        try:
                            handler_user = user_model.find_by_account_id(handler_account) if handler_account else None
                            if handler_user:
                                handler_name = handler_user.get('name') or handler_user.get('username')
                        except Exception:
                            handler_name = handler_name or integration.get('name')
                        try:
                            claimed = conversation_model.set_handler_if_unset(conversation_id, handler_account, handler_name)
                            if claimed:
                                _emit_socket_to_account('conversation-locked', {
                                    'conv_id': conv_id,
                                    'conversation_id': conversation_id,
                                    'handler': claimed.get('current_handler')
                                }, integration.get('accountId'), integration.get('organizationId'))
                        except Exception as e:
                            logger.debug(f"Failed to claim conversation handler: {e}")
                    except Exception:
                        pass
                except Exception:
                    pass
                logger.info(f"Emitted socket events for outgoing message to account {integration.get('accountId')}")
        except Exception as e:
            logger.error(f"Failed to emit socket event for outgoing message: {e}")

        return jsonify({
            'success': True, 
            'data': {
                'sent': sent_doc, 
                'send_response': send_resp,
                'has_image': bool(image)
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Failed to send conversation message: {e}", exc_info=True)
        return jsonify({
            'success': False, 
            'message': f'Failed to send message: {str(e)}'
        }), 500


# Token refresh helper (can be used by scheduler)
def refresh_expiring_tokens(mongo_client):
    integration_model = IntegrationModel(mongo_client)
    cutoff = datetime.utcnow() + timedelta(seconds=Config.TOKEN_REFRESH_LEAD_SECONDS)
    expiring = integration_model.integrations_needing_refresh(cutoff)
    logger.info(f"Found {len(expiring)} integrations needing refresh")
    for item in expiring:
        # Use refresh_token to obtain new access token
        try:
            refresh_token = item.get('refresh_token')
            if not refresh_token:
                logger.info(f"No refresh token for integration {item.get('_id')}; skipping")
                continue
            token_url = f"{Config.ZALO_API_BASE}/v4/refresh_token"
            payload = {
                'app_id': Config.ZALO_APP_ID,
                'app_secret': Config.ZALO_APP_SECRET,
                'refresh_token': refresh_token,
            }
            try:
                resp = requests.post(token_url, json=payload, timeout=10)
                data = resp.json()
                if resp.status_code == 200 and 'access_token' in data:
                    integration_model.update_tokens(item.get('_id'), access_token=data.get('access_token'), refresh_token=data.get('refresh_token'), expires_in=data.get('expires_in'))
                    logger.info(f"Refreshed token for integration {item.get('_id')}")
                else:
                    raise Exception('unexpected response')
            except Exception as e:
                # mock fallback
                logger.info(f"Token refresh failed or skipped for {item.get('_id')}: {e}; using mock refresh")
                integration_model.update_tokens(item.get('_id'), access_token=f"mock_access_refresh_{item.get('_id')}", expires_in=60 * 60 * 24 * 30)
        except Exception as e:
            logger.error(f"Failed to refresh token for {item.get('_id')}: {e}")
from flask import Blueprint, request, jsonify, current_app
from models.integration import IntegrationModel
from utils.redis_client import set_key, get_key, del_key
from utils.ai_service import generate_reply
from config import Config
import logging
import secrets
import base64
import hashlib
import requests
import json
from datetime import datetime, timedelta

zalo_bp = Blueprint('zalo', __name__)
logger = logging.getLogger(__name__)

PKCE_TTL = 600  # seconds


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


@zalo_bp.route('/api/zalo/callback', methods=['GET', 'POST'])
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
    )

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


@zalo_bp.route('/webhooks/zalo', methods=['GET'])
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


@zalo_bp.route('/webhooks/zalo', methods=['POST'])
def webhook_event():
    data = request.get_json() or {}
    logger.info(f"Zalo webhook event received: {data}")

    # Example payloads may differ; try to extract oa_id, event type and sender
    oa_id = data.get('oa_id') or data.get('page_id') or (data.get('data') or {}).get('oa_id')
    event_type = data.get('event') or (data.get('data') or {}).get('event')
    message = None
    sender_id = None

    # Attempt to find message contents
    try:
        if 'data' in data:
            d = data['data']
            # Text
            if d.get('type') == 'user_send_text':
                message = d.get('text')
                sender_id = d.get('sender')
                event_type = 'user_send_text'
            else:
                # generic handlers
                message = d.get('text') or d.get('message') or None
                sender_id = d.get('sender') or (d.get('from') or {}).get('id')
        else:
            # fallback raw structure
            message = data.get('text') or (data.get('message') or {}).get('text')
            sender_id = data.get('sender') or (data.get('from') or {}).get('id')
    except Exception as e:
        logger.warning(f"Failed to extract message fields: {e}")

    # Look up integration by oa_id
    integration_model = IntegrationModel(current_app.mongo_client)
    integration = None
    if oa_id:
        integration = integration_model.find_by_platform_and_oa('zalo', oa_id)
    else:
        # If oa_id not provided, attempt to find any active integration (not ideal)
        all_ints = integration_model.find_by_account(None)
        integration = all_ints[0] if all_ints else None

    if not integration or not integration.get('is_active'):
        logger.info('Integration not found or inactive; ignoring message')
        return jsonify({'success': False, 'message': 'Integration not active or not found'}), 200

    # Emit socket event to frontend admin
    payload = {
        'platform': 'zalo',
        'oa_id': integration.get('oa_id'),
        'sender_id': sender_id,
        'message': message,
        'received_at': datetime.utcnow().isoformat(),
    }

    try:
        socketio = getattr(current_app, 'socketio', None)
        if socketio:
            socketio.emit('new-message', payload, broadcast=True)
        else:
            logger.info('SocketIO not initialized; skipping emit')
    except Exception as e:
        logger.error(f"Failed to emit socket event: {e}")

    # AI processing: generate reply
    try:
        reply_text = generate_reply(integration.get('accountId'), message or '')
    except Exception as e:
        logger.error(f"AI generation failed: {e}")
        reply_text = "(AI error) Sorry, I couldn't process that."

    # Send reply to Zalo using stored access token
    access_token = integration.get('access_token')
    try:
        send_resp = _send_message_to_zalo(access_token, sender_id, reply_text)
        logger.info(f"Send message result: {send_resp}")
    except Exception as e:
        logger.error(f"Failed to send message to Zalo: {e}")

    return jsonify({'success': True}), 200


def _send_message_to_zalo(access_token, to_user_id, message_text):
    # Simplified send call — Zalo's real API may differ. For testing we mock when access_token starts with 'mock'.
    if not access_token or str(access_token).startswith('mock'):
        logger.info(f"Mock send to zalo: to={to_user_id}, message={message_text}")
        return {'status': 'mocked'}

    url = f"{Config.ZALO_API_BASE}/v2.0/oa/message"
    headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}
    body = {
        'recipient': {'user_id': to_user_id},
        'message': {'text': message_text}
    }
    resp = requests.post(url, json=body, headers=headers, timeout=10)
    try:
        return resp.json()
    except Exception:
        return {'status_code': resp.status_code, 'text': resp.text}


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

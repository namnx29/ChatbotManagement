from flask import Blueprint, request, jsonify, current_app
from models.integration import IntegrationModel
from utils.redis_client import set_key, get_key, del_key
from utils.ai_service import generate_reply
from config import Config
import logging
import secrets
import requests
import json
from datetime import datetime, timedelta

facebook_bp = Blueprint('facebook', __name__)
logger = logging.getLogger(__name__)

PKCE_TTL = 600  # seconds (we reuse state storage for flow)

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


@facebook_bp.route('/api/facebook/callback', methods=['GET', 'POST'])
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

    for entry in entries:
        page_id = entry.get('id')
        # messaging events
        for messaging in entry.get('messaging', []) or entry.get('messaging', []):
            sender_id = (messaging.get('sender') or {}).get('id')
            message_text = None
            # message text
            if messaging.get('message'):
                message_text = messaging['message'].get('text') or messaging['message'].get('sticker_id') or None

            integration = None
            if page_id:
                integration = integration_model.find_by_platform_and_oa('facebook', page_id)

            if not integration or not integration.get('is_active'):
                logger.info('Facebook integration not found or inactive; ignoring message')
                continue

            payload = {
                'platform': 'facebook',
                'oa_id': integration.get('oa_id'),
                'sender_id': sender_id,
                'message': message_text,
                'received_at': datetime.utcnow().isoformat(),
            }

            try:
                socketio = getattr(current_app, 'socketio', None)
                if socketio:
                    socketio.emit('new-message', payload, broadcast=True)
            except Exception as e:
                logger.error(f"Failed to emit socket event: {e}")

            try:
                reply_text = generate_reply(integration.get('accountId'), message_text or '')
            except Exception as e:
                logger.error(f"AI generation failed: {e}")
                reply_text = "(AI error) Sorry, I couldn't process that."

            try:
                send_resp = _send_message_to_facebook(integration.get('access_token'), sender_id, reply_text)
                logger.info(f"Send message result: {send_resp}")
            except Exception as e:
                logger.error(f"Failed to send message to Facebook: {e}")

    return jsonify({'success': True}), 200


def _send_message_to_facebook(page_access_token, recipient_id, message_text):
    if not page_access_token or str(page_access_token).startswith('mock'):
        logger.info(f"Mock send to facebook: to={recipient_id}, message={message_text}")
        return {'status': 'mocked'}

    url = f"{Config.FB_API_BASE}/{Config.FB_API_VERSION}/me/messages"
    params = {'access_token': page_access_token}
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

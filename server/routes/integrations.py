from flask import Blueprint, request, jsonify, current_app
from models.integration import IntegrationModel
import logging

integrations_bp = Blueprint('integrations', __name__, url_prefix='/api/integrations')
logger = logging.getLogger(__name__)


from utils.request_helpers import get_account_id_from_request as _get_account_id_from_request


@integrations_bp.route('', methods=['GET'])
def list_integrations():
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400
    platform = request.args.get('platform')
    chatbot_id = request.args.get('chatbotId') or request.args.get('chatbot_id')
    model = IntegrationModel(current_app.mongo_client)
    from models.user import UserModel
    user_model = UserModel(current_app.mongo_client)
    
    # Get integrations by organization if user is staff, otherwise by account
    user_org_id = user_model.get_user_organization_id(account_id)
    if user_org_id:
        # Staff: get all integrations in the organization
        items = model.find_by_organization(user_org_id, platform=platform, chatbot_id=chatbot_id)
        # Fallback to account-based query if no org documents found (migration period)
        if not items:
            items = model.find_by_account(account_id, platform=platform, chatbot_id=chatbot_id)
    else:
        # Admin: get own account integrations
        items = model.find_by_account(account_id, platform=platform, chatbot_id=chatbot_id)
    
    return jsonify({'success': True, 'data': items}), 200

@integrations_bp.route('/<integration_id>/activate', methods=['POST'])
def activate_integration(integration_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400
    model = IntegrationModel(current_app.mongo_client)
    from models.user import UserModel
    user_model = UserModel(current_app.mongo_client)
    
    # Check authorization
    existing = model.find_by_id(integration_id)
    if not existing:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    
    user_org_id = user_model.get_user_organization_id(account_id)
    if user_org_id and existing.get('organizationId') == user_org_id:
        # Staff in same organization - allowed
        pass
    elif existing.get('accountId') != account_id:
        # Not admin's integration
        return jsonify({'success': False, 'message': 'Not authorized'}), 403
    
    updated = model.set_active(integration_id, True)
    if not updated:
        return jsonify({'success': False, 'message': 'Not found or not authorized'}), 404
    
    # Emit integration-added to notify staff/admin
    try:
        socketio = getattr(current_app, 'socketio', None)
        if socketio:
            payload = {
                'integration_id': integration_id,
                'oa_id': updated.get('oa_id'),
                'platform': updated.get('platform')
            }
            org_id = updated.get('organizationId') or user_model.get_user_organization_id(account_id)
            if org_id:
                socketio.emit('integration-added', payload, room=f"organization:{org_id}")
            owner_account = updated.get('accountId')
            if owner_account:
                socketio.emit('integration-added', payload, room=f"account:{owner_account}")
    except Exception as e:
        logger.error(f"Emit integration-added failed: {str(e)}")

    return jsonify({'success': True, 'data': updated}), 200


@integrations_bp.route('/<integration_id>/deactivate', methods=['POST'])
def deactivate_integration(integration_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400
    model = IntegrationModel(current_app.mongo_client)
    from models.user import UserModel
    user_model = UserModel(current_app.mongo_client)
    
    # Check authorization
    existing = model.find_by_id(integration_id)
    if not existing:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    
    user_org_id = user_model.get_user_organization_id(account_id)
    if user_org_id and existing.get('organizationId') == user_org_id:
        # Staff in same organization - allowed
        pass
    elif existing.get('accountId') != account_id:
        # Not admin's integration
        return jsonify({'success': False, 'message': 'Not authorized'}), 403
    
    updated = model.set_active(integration_id, False)
    if not updated:
        return jsonify({'success': False, 'message': 'Not found or not authorized'}), 404
    
    
    # Emit integration-removed to notify staff/admin
    try:
        socketio = getattr(current_app, 'socketio', None)
        if socketio:
            payload = {
                'integration_id': integration_id,
                'oa_id': updated.get('oa_id'),
                'platform': updated.get('platform')
            }
            org_id = updated.get('organizationId') or user_model.get_user_organization_id(account_id)
            if org_id:
                socketio.emit('integration-removed', payload, room=f"organization:{org_id}")
            owner_account = updated.get('accountId')
            if owner_account:
                socketio.emit('integration-removed', payload, room=f"account:{owner_account}")
    except Exception as e:
        logger.error(f"Emit integration-removed failed: {str(e)}")
        
    return jsonify({'success': True, 'data': updated}), 200


@integrations_bp.route('/<integration_id>', methods=['DELETE'])
def delete_integration(integration_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400
    model = IntegrationModel(current_app.mongo_client)
    from models.user import UserModel
    user_model = UserModel(current_app.mongo_client)

    # ensure the integration exists and belongs to requester's organization
    existing = model.find_by_id(integration_id)
    if not existing:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    
    # Check organization access or account access as fallback
    user_org_id = user_model.get_user_organization_id(account_id)
    if user_org_id and existing.get('organizationId') == user_org_id:
        # Staff can delete if in same organization
        pass
    elif existing.get('accountId') != account_id:
        # Admin's own integration
        return jsonify({'success': False, 'message': 'Not authorized'}), 403

    deleted = model.delete_integration(integration_id)
    if not deleted:
        return jsonify({'success': False, 'message': 'Delete failed'}), 500
    
    
    # Notify organization members and owner account that this integration was removed
    try:
        socketio = getattr(current_app, 'socketio', None)
        if socketio:
            payload = {
                'integration_id': integration_id,
                'oa_id': existing.get('oa_id'),
                'platform': existing.get('platform')
            }
            # Prefer integration.organizationId if present, else derive from requester's organization
            org_id = existing.get('organizationId') or user_model.get_user_organization_id(account_id)
            if org_id:
                socketio.emit('integration-removed', payload, room=f"organization:{org_id}")
            owner_account = existing.get('accountId')
            if owner_account:
                socketio.emit('integration-removed', payload, room=f"account:{owner_account}")
    except Exception as e:
        logger.error(f"Emit integration-removed failed: {str(e)}")

    return jsonify({'success': True, 'data': deleted}), 200

def update_profile(self, integration_id, name=None, avatar_url=None, meta=None):
        """Update the profile fields (name, avatar, meta) for an integration."""
        update = {'updated_at': datetime.utcnow()}
        if name is not None:
            update['name'] = name
            update['oa_name'] = name
        if avatar_url is not None:
            update['avatar_url'] = avatar_url
        if meta is not None:
            update['meta'] = meta
        res = self.collection.find_one_and_update({'_id': ObjectId(integration_id)}, {'$set': update}, return_document=True)
        return self._serialize(res)

@integrations_bp.route('/conversations/all', methods=['GET'])
def get_all_conversations():
    """
    Get all conversations for the account's chatbots.
    Filtered by chatbot_id to ensure account isolation.
    """
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400

    try:
        from models.conversation import ConversationModel
        from models.chatbot import ChatbotModel
        from models.integration import IntegrationModel
        from models.user import UserModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        chatbot_model = ChatbotModel(current_app.mongo_client)
        integration_model = IntegrationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        
        # Get organization context for staff access to admin's chatbots
        user_org_id = user_model.get_user_organization_id(account_id)
        
        # Get all chatbots for organization (or account as fallback)
        if user_org_id:
            account_chatbots = chatbot_model.list_chatbots_by_organization(user_org_id)
            logger.info(f"Found {len(account_chatbots)} chatbots for organization {user_org_id}")
            # Fallback to account-based query if no org chatbots found (migration period)
            if not account_chatbots:
                account_chatbots = chatbot_model.list_chatbots_by_account(account_id)
                logger.info(f"Fallback: Found {len(account_chatbots)} chatbots for account {account_id}")
        else:
            account_chatbots = chatbot_model.list_chatbots_by_account(account_id)
            logger.info(f"Found {len(account_chatbots)} chatbots for account {account_id}")
        
        chatbot_ids = [bot.get('id') for bot in account_chatbots if bot.get('id')]
        
        if not chatbot_ids:
            return jsonify({'success': True, 'data': []}), 200
        
        # Get conversations for this organization's chatbots
        enriched_conversations = []
        for chatbot in account_chatbots:
            chatbot_id = chatbot.get('id')
            # Get conversations using organizationId for org-level isolation
            if user_org_id:
                conversations = conversation_model.find_by_chatbot_id(chatbot_id, limit=2000, organization_id=user_org_id)
                # Fallback to account-based query if no org conversations found (migration period)
                if not conversations:
                    conversations = conversation_model.find_by_chatbot_id(chatbot_id, limit=2000, account_id=account_id)
            else:
                conversations = conversation_model.find_by_chatbot_id(chatbot_id, limit=2000, account_id=account_id)

            for conv in conversations:
                oa_id = conv.get('oa_id')
                customer_id = conv.get('customer_id', '')
                
                if oa_id == 'widget':
                    continue

                # Extract platform from customer_id (format: "platform:sender_id")
                if ':' in customer_id:
                    platform, sender_id = customer_id.split(':', 1)
                else:
                    platform = 'unknown'
                    sender_id = customer_id
                
                # Check integration status to determine if connected
                # Try to find the integration for this platform and oa_id
                integration = None
                for p in ['facebook', 'zalo', 'instagram']:
                    potential_integration = integration_model.find_by_platform_and_oa(p, oa_id)
                    
                    if potential_integration:
                        # Validate that this integration is accessible to the requester:
                        # - Admin (account owner) can access integrations with matching accountId
                        # - Staff can access integrations that belong to the same organization
                        is_owner = (str(potential_integration.get('accountId')) == str(account_id))
                        is_org_member = False
                        if user_org_id and potential_integration.get('organizationId'):
                            try:
                                is_org_member = str(potential_integration.get('organizationId')) == str(user_org_id)
                            except Exception:
                                is_org_member = False
                        is_active = potential_integration.get('is_active', True)

                        # Allow if requester is account owner or org member, and integration is active
                        if (is_owner or is_org_member) and is_active:
                            integration = potential_integration
                            platform = p  # Correct platform if needed
                            break
                
                is_connected = bool(integration)
                disconnected_at = integration.get('updated_at') if integration and not is_connected else None
                
                # Construct conversation ID in the format expected by message endpoints
                conversation_id = f"{platform}:{oa_id}:{sender_id}"
                
                enriched_conv = {
                    'id': conversation_id,
                    'oa_id': oa_id,
                    'customer_id': conv.get('customer_id'),
                    'chatbot_id': conv.get('chatbot_id'),
                    'chatbot_info': conv.get('chatbot_info', {}),
                    'platform': platform,
                    'name': conv.get('display_name') or 'Khách hàng',
                    'avatar': conv.get('customer_info', {}).get('avatar') or None,
                    'lastMessage': conv.get('last_message', {}).get('text') if conv.get('last_message') else None,
                    'time': conv.get('last_message', {}).get('created_at') if conv.get('last_message') else conv.get('updated_at'),
                    'unreadCount': conv.get('unread_count', 0),
                    'bot_reply': conv.get('bot-reply') if 'bot-reply' in conv else (conv.get('bot_reply') if 'bot_reply' in conv else None),
                    'platform_status': {
                        'is_connected': is_connected,
                        'disconnected_at': disconnected_at.isoformat() + 'Z' if disconnected_at else None
                    }
                }
                enriched_conversations.append(enriched_conv)
        
        # NEW: Also fetch widget conversations (which don't have chatbot_id)
        # Widget conversations are scoped by oa_id='widget' and organization_id
        try:
            widget_conversations = []
            if user_org_id:
                widget_conversations = conversation_model.find_by_oa(oa_id='widget', limit=2000, skip=0, account_id=None)
                # Filter by organizationId to only get conversations for this organization
                widget_conversations = [c for c in widget_conversations if c.get('organizationId') == str(user_org_id) or c.get('organizationId') == user_org_id]
            else:
                widget_conversations = conversation_model.find_by_oa(oa_id='widget', limit=2000, skip=0, account_id=account_id)
            
            logger.info(f"Found {len(widget_conversations)} widget conversations for organization {user_org_id}")
            
            for conv in widget_conversations:
                oa_id = 'widget'
                customer_id = conv.get('customer_id', '')
                platform = 'widget'
                
                # Extract sender_id from customer_id (format: "widget:uuid")
                if ':' in customer_id:
                    _, sender_id = customer_id.split(':', 1)
                else:
                    sender_id = customer_id
                
                # Construct conversation ID
                conversation_id = f"{platform}:{oa_id}:{sender_id}"
                
                enriched_conv = {
                    'id': conversation_id,
                    'oa_id': oa_id,
                    'customer_id': conv.get('customer_id'),
                    'chatbot_id': None,
                    'chatbot_info': conv.get('chatbot_info', {}),
                    'platform': platform,
                    'name': conv.get('display_name') or 'Khách hàng',
                    'avatar': conv.get('customer_info', {}).get('avatar') or None,
                    'lastMessage': conv.get('last_message', {}).get('text') if conv.get('last_message') else None,
                    'time': conv.get('last_message', {}).get('created_at') if conv.get('last_message') else conv.get('updated_at'),
                    'unreadCount': conv.get('unread_count', 0),
                    # Respect stored bot_reply flag for widget conversations as well
                    'bot_reply': conv.get('bot-reply') if 'bot-reply' in conv else (conv.get('bot_reply') if 'bot_reply' in conv else None),
                    'platform_status': {
                        'is_connected': True,  # Widget is always "connected"
                        'disconnected_at': None
                    }
                }
                enriched_conversations.append(enriched_conv)
        except Exception as e:
            logger.warning(f"Failed to fetch widget conversations: {e}")
        
        # Sort by time descending (most recent first)
        enriched_conversations.sort(key=lambda x: x.get('time') or '', reverse=True)
        
        logger.info(f"Returning {len(enriched_conversations)} conversations for account {account_id}")
        return jsonify({'success': True, 'data': enriched_conversations}), 200
        
    except Exception as e:
        logger.error(f"Error getting all conversations: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500
    
@integrations_bp.route('/conversations/nickname', methods=['POST'])
def update_conversation_nickname():
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400

    data = request.json
    oa_id = data.get('oa_id')
    customer_id = data.get('customer_id')
    nick_name = data.get('nick_name')

    if not oa_id or not customer_id:
        return jsonify({'success': False, 'message': 'Missing required fields'}), 400

    try:
        from models.conversation import ConversationModel
        from models.user import UserModel
        conv_model = ConversationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        
        # Get organization context
        user_org_id = user_model.get_user_organization_id(account_id)
        
        # Update nickname with organization context for staff access
        updated_conv = conv_model.update_nickname(
            oa_id=oa_id, 
            customer_id=customer_id, 
            user_id=account_id, 
            nick_name=nick_name,
            account_id=account_id,
            organization_id=user_org_id  # Allow staff to update in shared organization
        )

        if not updated_conv:
            return jsonify({'success': False, 'message': 'Conversation not found'}), 404

        return jsonify({
            'success': True, 
            'data': conv_model._serialize(updated_conv)
        }), 200

    except Exception as e:
        logger.error(f"Error updating nickname: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
    
# Conversation Locking Endpoints
@integrations_bp.route('/conversations/<path:conv_id>/lock', methods=['POST'])
def lock_conversation(conv_id):
    """Acquire a lock for a conversation so others in the org are notified."""
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400

    try:
        from models.conversation import ConversationModel
        from models.user import UserModel
        conv_model = ConversationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)

        parts = conv_id.split(':')
        if len(parts) != 3:
            return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
        platform, oa_id, sender_id = parts
        customer_id = f"{platform}:{sender_id}"

        user_doc = user_model.find_by_account_id(account_id)
        if not user_doc:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        role = user_doc.get('role', 'staff')
        if role not in ('admin', 'staff'):
            return jsonify({'success': False, 'message': 'Unauthorized role for locking'}), 403

        user_org_id = user_model.get_user_organization_id(account_id)

        # Find conversation in org context
        conv = conv_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        if not conv:
            return jsonify({'success': False, 'message': 'Conversation not found'}), 404

        # Check existing lock
        current = conv.get('current_handler')
        if current and current.get('accountId') != account_id:
            return jsonify({'success': False, 'message': 'Conversation already locked', 'current_handler': current}), 409

        ttl = (request.json or {}).get('ttl_seconds', 300)
        handler_name = user_doc.get('name') or user_doc.get('username') or ''
        updated = conv_model.lock_by_id(conv.get('_id'), account_id, handler_name, ttl_seconds=ttl)
        if not updated:
            return jsonify({'success': False, 'message': 'Failed to lock conversation'}), 500

        # Notify org members via socket
        try:
            socketio = getattr(current_app, 'socketio', None)
            if socketio and user_org_id:
                payload = {
                    'conv_id': conv_id,
                    'conversation_id': updated.get('_id'),
                    'handler': updated.get('current_handler'),
                    'lock_expires_at': updated.get('lock_expires_at')
                }
                room = f"organization:{user_org_id}"
                socketio.emit('conversation-locked', payload, room=room)
        except Exception as e:
            logger.error(f"Failed to emit lock event: {e}")

        return jsonify({'success': True, 'data': updated}), 200
    except Exception as e:
        logger.error(f"Failed to lock conversation: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Internal error'}), 500


@integrations_bp.route('/conversations/<path:conv_id>/unlock', methods=['POST'])
def unlock_conversation(conv_id):
    """Release a lock (by handler or admin)."""
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400

    try:
        from models.conversation import ConversationModel
        from models.user import UserModel
        conv_model = ConversationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)

        parts = conv_id.split(':')
        if len(parts) != 3:
            return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
        platform, oa_id, sender_id = parts
        customer_id = f"{platform}:{sender_id}"

        user_doc = user_model.find_by_account_id(account_id)
        if not user_doc:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        user_org_id = user_model.get_user_organization_id(account_id)
        conv = conv_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        if not conv:
            return jsonify({'success': False, 'message': 'Conversation not found'}), 404

        # If requester is admin, allow force unlock via param
        force = bool((request.json or {}).get('force', False)) and user_doc.get('role') == 'admin'

        updated = conv_model.unlock_by_id(conv.get('_id'), requester_account_id=account_id, force=force)
        if not updated:
            return jsonify({'success': False, 'message': 'Unlock not permitted or failed'}), 403

        # Notify org members
        try:
            socketio = getattr(current_app, 'socketio', None)
            if socketio and user_org_id:
                payload = {
                    'conv_id': conv_id,
                    'conversation_id': updated.get('_id')
                }
                room = f"organization:{user_org_id}"
                socketio.emit('conversation-unlocked', payload, room=room)
        except Exception as e:
            logger.error(f"Failed to emit unlock event: {e}")

        return jsonify({'success': True, 'data': updated}), 200
    except Exception as e:
        logger.error(f"Failed to unlock conversation: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Internal error'}), 500


@integrations_bp.route('/conversations/<path:conv_id>/request-access', methods=['POST'])
def request_access(conv_id):
    """Ask current handler for access — sends a socket event to the handler's account room."""
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400

    try:
        from models.conversation import ConversationModel
        from models.user import UserModel
        conv_model = ConversationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)

        parts = conv_id.split(':')
        if len(parts) != 3:
            return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400
        platform, oa_id, sender_id = parts
        customer_id = f"{platform}:{sender_id}"

        user_org_id = user_model.get_user_organization_id(account_id)
        conv = conv_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=user_org_id, account_id=account_id)
        if not conv:
            return jsonify({'success': False, 'message': 'Conversation not found'}), 404

        current = conv.get('current_handler')
        if not current:
            return jsonify({'success': False, 'message': 'Conversation is not currently locked'}), 400

        handler_account = current.get('accountId')
        # Emit a request-access event to the handler's account room
        try:
            socketio = getattr(current_app, 'socketio', None)
            if socketio and handler_account:
                payload = {
                    'conv_id': conv_id,
                    'conversation_id': conv.get('_id'),
                    'requester': account_id
                }
                socketio.emit('request-access', payload, room=f"account:{handler_account}")
        except Exception as e:
            logger.error(f"Failed to emit request-access event: {e}")

        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Failed to request access: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Internal error'}), 500
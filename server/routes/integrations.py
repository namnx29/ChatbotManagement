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
    items = model.find_by_account(account_id, platform=platform, chatbot_id=chatbot_id)
    return jsonify({'success': True, 'data': items}), 200

    enriched_items = []
    for item in items:
        enriched = dict(item)
        # Ensure oa_id is present
        if 'oa_id' not in enriched:
            enriched['oa_id'] = enriched.get('_id') or None
        # Ensure name is present (use oa_name as fallback)
        if not enriched.get('name') and enriched.get('oa_name'):
            enriched['name'] = enriched.get('oa_name')
        # Ensure avatar_url is present (use avatar as fallback)
        if not enriched.get('avatar_url') and enriched.get('avatar'):
            enriched['avatar_url'] = enriched.get('avatar')
        enriched_items.append(enriched)
    
    return jsonify({'success': True, 'data': enriched_items}), 200


@integrations_bp.route('/<integration_id>/activate', methods=['POST'])
def activate_integration(integration_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400
    model = IntegrationModel(current_app.mongo_client)
    updated = model.set_active(integration_id, True)
    if not updated:
        return jsonify({'success': False, 'message': 'Not found or not authorized'}), 404
    return jsonify({'success': True, 'data': updated}), 200


@integrations_bp.route('/<integration_id>/deactivate', methods=['POST'])
def deactivate_integration(integration_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400
    model = IntegrationModel(current_app.mongo_client)
    updated = model.set_active(integration_id, False)
    if not updated:
        return jsonify({'success': False, 'message': 'Not found or not authorized'}), 404
    return jsonify({'success': True, 'data': updated}), 200


@integrations_bp.route('/<integration_id>', methods=['DELETE'])
def delete_integration(integration_id):
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400
    model = IntegrationModel(current_app.mongo_client)

    # ensure the integration exists and belongs to requester
    existing = model.find_by_id(integration_id)
    if not existing:
        return jsonify({'success': False, 'message': 'Not found'}), 404
    if existing.get('accountId') != account_id:
        return jsonify({'success': False, 'message': 'Not authorized'}), 403

    deleted = model.delete_integration(integration_id)
    if not deleted:
        return jsonify({'success': False, 'message': 'Delete failed'}), 500
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
    Get all conversations for the account from all OA IDs (including deleted integrations).
    This queries the conversations collection directly to support conversation persistence.
    """
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required'}), 400

    try:
        from models.conversation import ConversationModel
        from models.integration import IntegrationModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        integration_model = IntegrationModel(current_app.mongo_client)
        
        # Get all OA IDs in conversations collection
        all_oa_ids = conversation_model.get_all_oa_ids()
        logger.info(f"Found {len(all_oa_ids)} distinct oa_ids in conversations collection")
        
        if not all_oa_ids:
            return jsonify({'success': True, 'data': []}), 200
        
        # Get conversations for all OA IDs
        conversations = conversation_model.find_all_by_oa_ids(all_oa_ids, limit=2000)
        
        # Enrich with platform info and integration status
        enriched_conversations = []
        for conv in conversations:
            oa_id = conv.get('oa_id')
            customer_info = conv.get('customer_info', {})
            customer_id = conv.get('customer_id', '')
            
            # Extract platform from customer_id (format: "platform:sender_id")
            # This allows us to show messages even if integration is deleted
            if ':' in customer_id:
                platform, sender_id = customer_id.split(':', 1)
            else:
                # Fallback: try to find integration to determine platform
                platform = 'unknown'
                sender_id = customer_id
                for p in ['facebook', 'zalo', 'instagram']:
                    integration = integration_model.find_by_platform_and_oa(p, oa_id)
                    if integration:
                        platform = p
                        break
            
            # Check integration status to determine if connected
            integration = None
            for p in ['facebook', 'zalo', 'instagram']:
                integration = integration_model.find_by_platform_and_oa(p, oa_id)
                if integration:
                    break
            
            is_connected = bool(integration and integration.get('is_active', True)) if integration else False
            disconnected_at = integration.get('updated_at') if integration and not is_connected else None
            
            # Construct conversation ID in the format expected by message endpoints: platform:oa_id:sender_id
            conversation_id = f"{platform}:{oa_id}:{sender_id}"
            
            enriched_conv = {
                'id': conversation_id,
                'oa_id': oa_id,
                'customer_id': conv.get('customer_id'),
                'platform': platform,
                'name': customer_info.get('name') or 'Khách hàng',
                'avatar': customer_info.get('avatar'),
                'lastMessage': conv.get('last_message', {}).get('text') if conv.get('last_message') else None,
                'time': conv.get('last_message', {}).get('created_at') if conv.get('last_message') else conv.get('updated_at'),
                'unreadCount': conv.get('unread_count', 0),
                'platform_status': {
                    'is_connected': is_connected,
                    'disconnected_at': disconnected_at.isoformat() + 'Z' if disconnected_at else None
                }
            }
            enriched_conversations.append(enriched_conv)
        
        # Sort by time descending (most recent first)
        enriched_conversations.sort(key=lambda x: x.get('time') or '', reverse=True)
        
        logger.info(f"Returning {len(enriched_conversations)} conversations for account {account_id}")
        return jsonify({'success': True, 'data': enriched_conversations}), 200
        
    except Exception as e:
        logger.error(f"Error getting all conversations: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500
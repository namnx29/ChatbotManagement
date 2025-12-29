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

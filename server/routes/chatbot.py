from flask import Blueprint, request, jsonify
from models.chatbot import ChatbotModel
from models.training import TrainingModel
from config import Config
import logging
import os
from werkzeug.utils import secure_filename
from datetime import datetime
import uuid

chatbot_bp = Blueprint('chatbot', __name__, url_prefix='/api/chatbots')
logger = logging.getLogger(__name__)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS


def get_account_id_from_request():
    # Prefer current_user if authenticated
    try:
        from flask_login import current_user
        if current_user and getattr(current_user, 'is_authenticated', False):
            return current_user.get_id()
    except Exception:
        pass

    account_id = request.headers.get('X-Account-Id')
    if not account_id:
        data = request.get_json() or {}
        account_id = data.get('accountId')
    return account_id

def get_organization_id_from_request(user_model):
    """Get organization_id from user model using account_id"""
    account_id = get_account_id_from_request()
    if account_id and user_model:
        return user_model.get_user_organization_id(account_id)
    return None


def init_chatbot_routes(mongo_client):
    chatbot_model = ChatbotModel(mongo_client)
    training_model = TrainingModel(mongo_client)
    from models.user import UserModel
    user_model = UserModel(mongo_client)

    # Ensure upload folder exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    @chatbot_bp.route('', methods=['GET'])
    def list_chatbots():
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            bots = chatbot_model.list_chatbots_by_account(account_id)
            return jsonify({'success': True, 'data': bots}), 200
        except Exception as e:
            logger.error(f"List chatbots error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to list chatbots'}), 500

    @chatbot_bp.route('', methods=['POST'])
    def create_chatbot():
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            data = request.get_json() or {}
            name = data.get('name')
            purpose = data.get('purpose')
            greeting = data.get('greeting')
            fields = data.get('fields')
            avatar_url = data.get('avatar_url')

            if not name:
                return jsonify({'success': False, 'message': 'Chatbot name is required'}), 400

            organization_id = get_organization_id_from_request(user_model)
            
            bot = chatbot_model.create_chatbot(account_id, name, purpose, greeting, fields, avatar_url, organization_id=organization_id)
            # Format response
            bot_resp = {
                'id': str(bot.get('_id')),
                'name': bot.get('name'),
                'avatar_url': bot.get('avatar_url'),
                'purpose': bot.get('purpose'),
                'greeting': bot.get('greeting'),
                'fields': bot.get('fields', []),
                'created_at': bot.get('created_at'),
                'updated_at': bot.get('updated_at'),
            }

            return jsonify({'success': True, 'data': bot_resp}), 201
        except Exception as e:
            logger.error(f"Create chatbot error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to create chatbot'}), 500

    @chatbot_bp.route('/avatar', methods=['POST'])
    def upload_chatbot_avatar():
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            # Check for file
            if 'avatar' not in request.files:
                return jsonify({'success': False, 'message': 'No file provided'}), 400

            file = request.files['avatar']
            if file.filename == '':
                return jsonify({'success': False, 'message': 'No file selected'}), 400

            if not allowed_file(file.filename):
                return jsonify({'success': False, 'message': f'File type not allowed. Allowed types: {", ".join(Config.ALLOWED_EXTENSIONS)}'}), 400

            # Check size
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)
            if file_size > Config.MAX_UPLOAD_SIZE:
                return jsonify({'success': False, 'message': f'File size exceeds {Config.MAX_UPLOAD_SIZE / (1024*1024):.1f}MB limit'}), 400

            file_ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
            unique_filename = f"{uuid.uuid4().hex}_{datetime.utcnow().timestamp()}.{file_ext}"
            file_path = os.path.join(Config.UPLOAD_FOLDER, unique_filename)
            file.save(file_path)

            avatar_url = f"/uploads/avatars/{unique_filename}"

            # Optionally accept chatbotId to update existing bot's avatar
            bot_id = request.form.get('chatbotId') or request.args.get('chatbotId')
            if bot_id:
                updated = chatbot_model.update_chatbot_avatar(account_id, bot_id, avatar_url)
                if not updated:
                    # If update fails, remove file
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    return jsonify({'success': False, 'message': 'Chatbot not found or not authorized'}), 404

            return jsonify({'success': True, 'message': 'Avatar uploaded successfully', 'data': {'avatar_url': avatar_url}}), 200
        except Exception as e:
            logger.error(f"Chatbot avatar upload error: {str(e)}")
            return jsonify({'success': False, 'message': 'Avatar upload failed'}), 500

    @chatbot_bp.route('/<bot_id>', methods=['DELETE'])
    def delete_chatbot(bot_id):
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            ok = chatbot_model.delete_chatbot(account_id, bot_id)
            if not ok:
                return jsonify({'success': False, 'message': 'Chatbot not found or not authorized'}), 404

            return jsonify({'success': True, 'message': 'Chatbot deleted'}), 200
            @chatbot_bp.route('/<bot_id>', methods=['GET'])
            def get_chatbot(bot_id):
                try:
                    account_id = get_account_id_from_request()
                    if not account_id:
                        return jsonify({'success': False, 'message': 'Account ID is required'}), 400

                    bot = chatbot_model.get_chatbot(bot_id)
                    # ensure that bot belongs to account
                    if not bot or bot.get('accountId') != account_id:
                        return jsonify({'success': False, 'message': 'Chatbot not found or not authorized'}), 404
                    # Prepare response
                    bot_resp = {
                        'id': bot.get('id'),
                        'name': bot.get('name'),
                        'avatar_url': bot.get('avatar_url'),
                        'purpose': bot.get('purpose'),
                        'greeting': bot.get('greeting'),
                        'fields': bot.get('fields', []),
                        'created_at': bot.get('created_at'),
                        'updated_at': bot.get('updated_at'),
                    }
                    return jsonify({'success': True, 'data': bot_resp}), 200
                except Exception as e:
                    logger.error(f"Get chatbot error: {str(e)}")
                    return jsonify({'success': False, 'message': 'Failed to get chatbot'}), 500

            @chatbot_bp.route('/<bot_id>', methods=['PUT'])
            def update_chatbot(bot_id):
                try:
                    account_id = get_account_id_from_request()
                    if not account_id:
                        return jsonify({'success': False, 'message': 'Account ID is required'}), 400

                    data = request.get_json() or {}
                    updates = {}
                    # Accept only these fields for update
                    for field in ('name', 'purpose', 'greeting', 'fields', 'avatar_url'):
                        if field in data:
                            updates[field] = data.get(field)

                    if not updates:
                        return jsonify({'success': False, 'message': 'No updatable fields provided'}), 400

                    updated_bot = chatbot_model.update_chatbot(account_id, bot_id, updates)
                    if not updated_bot:
                        return jsonify({'success': False, 'message': 'Chatbot not found or not authorized'}), 404

                    bot_resp = {
                        'id': str(updated_bot.get('_id') if updated_bot.get('_id') else updated_bot.get('id')),
                        'name': updated_bot.get('name'),
                        'avatar_url': updated_bot.get('avatar_url'),
                        'purpose': updated_bot.get('purpose'),
                        'greeting': updated_bot.get('greeting'),
                        'fields': updated_bot.get('fields', []),
                        'created_at': updated_bot.get('created_at'),
                        'updated_at': updated_bot.get('updated_at'),
                    }
                    return jsonify({'success': True, 'data': bot_resp}), 200
                except Exception as e:
                    logger.error(f"Update chatbot error: {str(e)}")
                    return jsonify({'success': False, 'message': 'Failed to update chatbot'}), 500

        except Exception as e:
            logger.error(f"Delete chatbot error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to delete chatbot'}), 500

    # Training data routes
    @chatbot_bp.route('/<bot_id>/training', methods=['GET'])
    def list_training(bot_id):
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            limit = request.args.get('limit')
            skip = request.args.get('skip')
            q = request.args.get('q')
            order = request.args.get('order') or 'newest'
            items = training_model.list_training_by_bot(account_id, bot_id, limit=limit, skip=skip, sort=order)
            total = training_model.count_training_by_bot(account_id, bot_id)
            return jsonify({'success': True, 'data': items, 'total': total}), 200
        except Exception as e:
            logger.error(f"List training error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to list training data'}), 500

    @chatbot_bp.route('/<bot_id>/training', methods=['POST'])
    def create_training(bot_id):
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            data = request.get_json() or {}
            status = data.get('status')
            question = data.get('question')
            answer = data.get('answer')

            if not question or not answer:
                return jsonify({'success': False, 'message': 'Question and answer are required'}), 400

            item = training_model.create_training(account_id, bot_id, status, question, answer)
            return jsonify({'success': True, 'data': item}), 201
        except Exception as e:
            logger.error(f"Create training error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to create training data'}), 500

    @chatbot_bp.route('/<bot_id>/training/<training_id>', methods=['PUT'])
    def update_training(bot_id, training_id):
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            data = request.get_json() or {}
            updated = training_model.update_training(account_id, training_id, data)
            if not updated:
                return jsonify({'success': False, 'message': 'Training not found or not authorized'}), 404
            return jsonify({'success': True, 'data': updated}), 200
        except Exception as e:
            logger.error(f"Update training error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to update training data'}), 500

    @chatbot_bp.route('/<bot_id>/training/<training_id>', methods=['DELETE'])
    def delete_training(bot_id, training_id):
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            ok = training_model.delete_training(account_id, training_id)
            if not ok:
                return jsonify({'success': False, 'message': 'Training not found or not authorized'}), 404
            return jsonify({'success': True, 'message': 'Training deleted'}), 200
        except Exception as e:
            logger.error(f"Delete training error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to delete training data'}), 500

    @chatbot_bp.route('/<bot_id>/training/bulk-delete', methods=['POST'])
    def delete_training_bulk(bot_id):
        try:
            account_id = get_account_id_from_request()
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400

            data = request.get_json() or {}
            ids = data.get('ids') or []
            if not isinstance(ids, list) or not ids:
                return jsonify({'success': False, 'message': 'ids is required and must be a non-empty list'}), 400

            deleted_count = training_model.delete_training_bulk(account_id, bot_id, ids)
            return jsonify({'success': True, 'deleted': deleted_count}), 200
        except Exception as e:
            logger.error(f"Bulk delete training error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to bulk delete training data'}), 500

    return chatbot_bp

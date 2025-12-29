from flask import Blueprint, request, jsonify
from models.user import UserModel
from config import Config
import logging
import os
from werkzeug.utils import secure_filename
from datetime import datetime
import uuid

user_bp = Blueprint('user', __name__, url_prefix='/api/user')
logger = logging.getLogger(__name__)

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

def get_account_id_from_request():
    """Extract accountId from request headers, body, or flask-login current_user"""
    # Prefer current_user if authenticated
    try:
        from flask_login import current_user
        if current_user and getattr(current_user, 'is_authenticated', False):
            return current_user.get_id()
    except Exception:
        pass

    # Try to get from headers first (recommended for security)
    account_id = request.headers.get('X-Account-Id')
    
    # Fallback to body if not in headers
    if not account_id:
        data = request.get_json() or {}
        account_id = data.get('accountId')
    
    return account_id

def init_user_routes(mongo_client):
    """Initialize user routes with mongo client"""
    user_model = UserModel(mongo_client)
    
    # Ensure upload folder exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    
    @user_bp.route('/profile', methods=['GET'])
    def get_profile():
        """Get user profile data"""
        try:
            account_id = get_account_id_from_request()
            
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            # Get profile from database
            profile = user_model.get_profile(account_id)
            
            if not profile:
                return jsonify({'success': False, 'message': 'User not found'}), 404
            
            return jsonify({
                'success': True,
                'data': profile
            }), 200
        
        except Exception as e:
            logger.error(f"Get profile error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to get profile'}), 500
    
    @user_bp.route('/avatar', methods=['POST'])
    def upload_avatar():
        """Upload user avatar"""
        try:
            account_id = get_account_id_from_request()
            
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            # Check if file is in request
            if 'avatar' not in request.files:
                return jsonify({'success': False, 'message': 'No file provided'}), 400
            
            file = request.files['avatar']
            
            if file.filename == '':
                return jsonify({'success': False, 'message': 'No file selected'}), 400
            
            if not allowed_file(file.filename):
                return jsonify({
                    'success': False,
                    'message': f'File type not allowed. Allowed types: {", ".join(Config.ALLOWED_EXTENSIONS)}'
                }), 400
            
            # Check file size
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)
            
            if file_size > Config.MAX_UPLOAD_SIZE:
                return jsonify({
                    'success': False,
                    'message': f'File size exceeds {Config.MAX_UPLOAD_SIZE / (1024*1024):.1f}MB limit'
                }), 400
            
            # Generate secure filename with unique identifier
            file_ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
            unique_filename = f"{uuid.uuid4().hex}_{datetime.utcnow().timestamp()}.{file_ext}"
            
            # Save file
            file_path = os.path.join(Config.UPLOAD_FOLDER, unique_filename)
            file.save(file_path)
            
            # Store relative URL for serving
            avatar_url = f"/uploads/avatars/{unique_filename}"
            
            # Update user avatar in database
            updated_user = user_model.update_avatar_url(account_id, avatar_url)
            
            if not updated_user:
                # Clean up file if update failed
                if os.path.exists(file_path):
                    os.remove(file_path)
                return jsonify({'success': False, 'message': 'User not found'}), 404
            
            return jsonify({
                'success': True,
                'message': 'Avatar uploaded successfully',
                'data': {
                    'avatar_url': avatar_url
                }
            }), 200
        
        except Exception as e:
            logger.error(f"Avatar upload error: {str(e)}")
            return jsonify({'success': False, 'message': 'Avatar upload failed'}), 500
    
    @user_bp.route('/change-password', methods=['POST'])
    def change_password():
        """Change user password"""
        try:
            account_id = get_account_id_from_request()
            
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            data = request.get_json()
            
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            current_password = data.get('currentPassword', '')
            new_password = data.get('newPassword', '')
            confirm_new_password = data.get('confirmNewPassword', '')
            
            # Validation
            if not current_password:
                return jsonify({'success': False, 'message': 'Current password is required'}), 400
            
            if not new_password:
                return jsonify({'success': False, 'message': 'New password is required'}), 400
            
            if new_password != confirm_new_password:
                return jsonify({'success': False, 'message': 'New passwords do not match'}), 400
            
            if len(new_password) < 6:
                return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
            
            if current_password == new_password:
                return jsonify({
                    'success': False,
                    'message': 'New password must be different from current password'
                }), 400
            
            # Change password
            result = user_model.change_password(account_id, current_password, new_password)
            
            # Check if there was an error
            if isinstance(result, dict) and 'error' in result:
                if 'incorrect' in result['error']:
                    return jsonify({'success': False, 'message': result['error']}), 401
                else:
                    return jsonify({'success': False, 'message': result['error']}), 404
            
            return jsonify({
                'success': True,
                'message': 'Password changed successfully'
            }), 200
        
        except Exception as e:
            logger.error(f"Change password error: {str(e)}")
            return jsonify({'success': False, 'message': 'Password change failed'}), 500
    
    @user_bp.route('/change-name', methods=['POST'])
    def change_name():
        """Change user display name"""
        try:
            account_id = get_account_id_from_request()
            
            if not account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            data = request.get_json()
            
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            new_name = data.get('newName', '')
            
            # Validation
            if not new_name:
                return jsonify({'success': False, 'message': 'New name is required'}), 400
            
            if len(new_name) < 2 or len(new_name) > 50:
                return jsonify({'success': False, 'message': 'Name must be between 2 and 50 characters'}), 400
            
            # Change name
            updated_user = user_model.update_name(account_id, new_name)
            
            if not updated_user:
                return jsonify({'success': False, 'message': 'User not found'}), 404
            
            return jsonify({
                'success': True,
                'message': 'Name changed successfully',
                'data': {
                    'newName': new_name
                }
            }), 200
        
        except Exception as e:
            logger.error(f"Change name error: {str(e)}")
            return jsonify({'success': False, 'message': 'Name change failed'}), 500

    return user_bp

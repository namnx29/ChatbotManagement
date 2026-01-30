from flask import Blueprint, request, jsonify, current_app
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

    # ==================== STAFF MANAGEMENT ROUTES ====================

    @user_bp.route('/staff', methods=['POST'])
    def create_staff():
        """Create a new staff account"""
        try:
            admin_account_id = get_account_id_from_request()
            
            if not admin_account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            data = request.get_json()
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            # Extract fields
            username = data.get('username', '').strip()
            name = data.get('name', '').strip()
            phone_number = data.get('phoneNumber', '').strip()
            password = data.get('password', '')
            
            # Validation
            if not username:
                return jsonify({'success': False, 'message': 'Username is required'}), 400
            if not name:
                return jsonify({'success': False, 'message': 'Name is required'}), 400
            if not password:
                return jsonify({'success': False, 'message': 'Password is required'}), 400
            
            if len(username) < 3:
                return jsonify({'success': False, 'message': 'Username must be at least 3 characters'}), 400
            if len(name) < 2 or len(name) > 50:
                return jsonify({'success': False, 'message': 'Name must be between 2 and 50 characters'}), 400
            if len(password) < 6:
                return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
            
            # Create staff
            staff = user_model.create_staff(
                parent_account_id=admin_account_id,
                username=username,
                name=name,
                phone_number=phone_number if phone_number else None,
                password=password
            )
            
            return jsonify({
                'success': True,
                'message': 'Staff account created successfully',
                'data': {
                    'accountId': staff['accountId'],
                    'username': staff['username'],
                    'name': staff['name'],
                    'phoneNumber': staff['phone_number']
                }
            }), 201
        
        except ValueError as e:
            return jsonify({'success': False, 'message': str(e)}), 400
        except Exception as e:
            logger.error(f"Create staff error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to create staff'}), 500

    @user_bp.route('/staff', methods=['GET'])
    def list_staff():
        """List staff accounts for the authenticated admin"""
        try:
            admin_account_id = get_account_id_from_request()
            
            if not admin_account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            # Get pagination parameters
            skip = request.args.get('skip', 0, type=int)
            limit = request.args.get('limit', 50, type=int)
            search = request.args.get('search', None, type=str)
            
            # Validate pagination
            if skip < 0:
                skip = 0
            if limit < 1 or limit > 100:
                limit = 50
            
            # List staff
            staff_list, total = user_model.list_staff_accounts(
                parent_account_id=admin_account_id,
                skip=skip,
                limit=limit,
                search=search
            )
            
            # Format response
            formatted_staff = []
            for staff in staff_list:
                formatted_staff.append({
                    'accountId': staff['accountId'],
                    'username': staff['username'],
                    'name': staff['name'],
                    'phoneNumber': staff['phone_number'],
                    'createdAt': staff['created_at'].isoformat() if staff.get('created_at') else None
                })
            
            return jsonify({
                'success': True,
                'data': {
                    'staff': formatted_staff,
                    'total': total,
                    'skip': skip,
                    'limit': limit
                }
            }), 200
        
        except Exception as e:
            logger.error(f"List staff error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to list staff'}), 500

    @user_bp.route('/staff/<staff_account_id>', methods=['PUT'])
    def update_staff(staff_account_id):
        """Update staff account"""
        try:
            admin_account_id = get_account_id_from_request()
            
            if not admin_account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            data = request.get_json()
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            # Extract fields
            updates = {}
            
            if 'name' in data:
                name = data['name'].strip()
                if name and (len(name) < 2 or len(name) > 50):
                    return jsonify({'success': False, 'message': 'Name must be between 2 and 50 characters'}), 400
                updates['name'] = name
            
            if 'username' in data:
                username = data['username'].strip()
                if username and len(username) < 3:
                    return jsonify({'success': False, 'message': 'Username must be at least 3 characters'}), 400
                updates['username'] = username
            
            if 'phoneNumber' in data:
                updates['phone_number'] = data['phoneNumber']
            
            if 'newPassword' in data:
                password = data['newPassword']
                if password and len(password) < 6:
                    return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
                updates['new_password'] = password
            
            # Update staff
            updated_staff = user_model.update_staff(
                staff_account_id=staff_account_id,
                parent_account_id=admin_account_id,
                **updates
            )
            
            return jsonify({
                'success': True,
                'message': 'Staff account updated successfully',
                'data': {
                    'accountId': updated_staff['accountId'],
                    'username': updated_staff['username'],
                    'name': updated_staff['name'],
                    'phoneNumber': updated_staff['phone_number']
                }
            }), 200
        
        except ValueError as e:
            return jsonify({'success': False, 'message': str(e)}), 400
        except Exception as e:
            logger.error(f"Update staff error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to update staff'}), 500

    @user_bp.route('/staff/<staff_account_id>', methods=['DELETE'])
    def delete_staff(staff_account_id):
        """Delete a staff account"""
        try:
            admin_account_id = get_account_id_from_request()
            
            if not admin_account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            # Delete staff
            user_model.delete_staff(
                staff_account_id=staff_account_id,
                parent_account_id=admin_account_id
            )

            # Notify any active session for this staff to force logout in real-time
            try:
                socketio = getattr(current_app, 'socketio', None)
                if socketio:
                    socketio.emit('force-logout', {'reason': 'account_deleted'}, room=f"account:{staff_account_id}")
            except Exception as e:
                logger.error(f"Emit force-logout failed: {str(e)}")
            
            return jsonify({
                'success': True,
                'message': 'Staff account deleted successfully'
            }), 200
        
        except ValueError as e:
            return jsonify({'success': False, 'message': str(e)}), 400
        except Exception as e:
            logger.error(f"Delete staff error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to delete staff'}), 500

    @user_bp.route('/staff/<staff_account_id>/password', methods=['GET'])
    def get_staff_password(staff_account_id):
        """Get staff password with verification token"""
        try:
            admin_account_id = get_account_id_from_request()
            
            if not admin_account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            verification_token = request.args.get('token', '')
            
            if not verification_token:
                return jsonify({'success': False, 'message': 'Verification token is required'}), 400
            
            # Get password
            password_data = user_model.get_staff_password(
                staff_account_id=staff_account_id,
                parent_account_id=admin_account_id,
                verification_token=verification_token
            )
            
            return jsonify({
                'success': True,
                'data': password_data
            }), 200
        
        except ValueError as e:
            return jsonify({'success': False, 'message': str(e)}), 401
        except Exception as e:
            logger.error(f"Get staff password error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to retrieve password'}), 500

    @user_bp.route('/verify-password', methods=['POST'])
    def verify_admin_password():
        """Verify admin password and get session token"""
        try:
            admin_account_id = get_account_id_from_request()
            
            if not admin_account_id:
                return jsonify({'success': False, 'message': 'Account ID is required'}), 400
            
            data = request.get_json()
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            password = data.get('password', '')
            
            if not password:
                return jsonify({'success': False, 'message': 'Password is required'}), 400
            
            # Verify password
            session_data = user_model.verify_admin_password(
                admin_account_id=admin_account_id,
                password=password
            )
            
            return jsonify({
                'success': True,
                'message': 'Password verified successfully',
                'data': session_data
            }), 200
        
        except ValueError as e:
            return jsonify({'success': False, 'message': str(e)}), 401
        except Exception as e:
            logger.error(f"Verify password error: {str(e)}")
            return jsonify({'success': False, 'message': 'Verification failed'}), 500

    return user_bp
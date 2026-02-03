from flask import Blueprint, request, jsonify
from models.user import UserModel
from models.chatbot import ChatbotModel
from utils.email_service import EmailService
from config import Config
import logging

auth_bp = Blueprint('auth', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)

def init_auth_routes(mongo_client):
    """Initialize auth routes with mongo client"""
    user_model = UserModel(mongo_client)
    chatbot_model = ChatbotModel(mongo_client)
    
    @auth_bp.route('/register', methods=['POST'])
    def register():
        """Register a new user"""
        try:
            data = request.get_json()
            
            # Validate input
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            email = data.get('email', '').strip()
            password = data.get('password', '')
            confirm_password = data.get('confirmPassword', '')
            name = data.get('fullName', '').strip()
            phone = data.get('phone', '').strip() or None
            
            # Validation
            if not email:
                return jsonify({'success': False, 'message': 'Email is required'}), 400
            
            if not password:
                return jsonify({'success': False, 'message': 'Password is required'}), 400
            
            if password != confirm_password:
                return jsonify({'success': False, 'message': 'Passwords do not match'}), 400
            
            if len(password) < 6:
                return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
            
            # Basic email validation
            if '@' not in email or '.' not in email.split('@')[-1]:
                return jsonify({'success': False, 'message': 'Invalid email format'}), 400
            
            # Create user with name and phone
            user = user_model.create_user(email, password, name, phone, role='admin')
            
            # Create default test chatbot for this user
            try:
                chatbot_model.create_chatbot(
                    account_id=user['accountId'],
                    name='test',
                    purpose='message',
                    greeting='',
                    fields=[],
                    avatar_url=None
                )
            except Exception as e:
                logger.warning(f"Failed to create default chatbot for user {email}: {str(e)}")
            
            # Generate verification link
            verification_link = f"{Config.FRONTEND_URL}/verify-email?token={user['verification_token']}&email={email}&accountId={user['accountId']}"
            
            # Send verification email
            email_sent = EmailService.send_verification_email(email, verification_link)
            
            if not email_sent:
                logger.warning(f"Email not sent for user {email}, but account created")
            
            return jsonify({
                'success': True,
                'message': 'Registration successful. Please check your email to verify your account.'
            }), 201
        
        except ValueError as e:
            return jsonify({'success': False, 'message': str(e)}), 400
        except Exception as e:
            logger.error(f"Registration error: {str(e)}")
            return jsonify({'success': False, 'message': 'Registration failed'}), 500
    
    @auth_bp.route('/login', methods=['POST'])
    def login():
        """Login user (supports both email for admins and username for staff)"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            # Accept either email or username
            email_or_username = data.get('email', '').strip() or data.get('username', '').strip()
            password = data.get('password', '')
            
            if not email_or_username or not password:
                return jsonify({'success': False, 'message': 'Email/username and password are required'}), 400
            
            # Try to find user by email first (admin users)
            user = user_model.find_by_email(email_or_username)
            
            # If not found by email, try to find by username (staff users)
            if not user:
                # For username, we need parent_account_id from the request
                # parent_account_id = data.get('parentAccountId', '')
                # if parent_account_id:
                user = user_model.find_by_username(email_or_username)
            
            if not user:
                return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
            
            role = user.get('role', 'admin')
            # Verify password
            if not user_model.verify_password(user, password, role):
                return jsonify({'success': False, 'message': 'Password is incorrect'}), 401
            
            # Check if email is verified (for admin users only)
            if user.get('role') == 'admin' and not user.get('is_verified', False):
                return jsonify({
                    'success': False,
                    'email': user.get('email'),
                    'code': 'UNVERIFIED',
                }), 403

            # Check if account is active
            if not user.get('is_active', True):
                return jsonify({'success': False, 'message': 'Account is disabled'}), 403

            # Login the user using Flask-Login session management
            from flask_login import login_user
            from models.user import FlaskUser
            login_user(FlaskUser(user))
            # Set session permanent so it uses PERMANENT_SESSION_LIFETIME
            from flask import session
            session.permanent = True

            # Compute session expiry time to return to client (optional)
            from datetime import datetime, timedelta
            session_expires_at = (datetime.utcnow() + timedelta(seconds=Config.LOGIN_SESSION_EXPIRY)).isoformat()

            return jsonify({
                'success': True,
                'message': 'Login successful',
                'user': {
                    'email': user.get('email'),
                    'username': user.get('username'),
                    'accountId': user['accountId'],
                    'name': user.get('name', user.get('email', '').split('@')[0] if user.get('email') else ''),
                    'role': user.get('role', 'admin'),
                    'parentAccountId': user.get('parent_account_id')
                },
                'session_expires_at': session_expires_at
            }), 200
        
        except Exception as e:
            logger.error(f"Login error: {str(e)}")
            return jsonify({'success': False, 'message': 'Login failed'}), 500
    
    @auth_bp.route('/verify-email', methods=['GET'])
    def verify_email():
        """Verify email with token"""
        try:
            token = request.args.get('token', '').strip()
            email = request.args.get('email', '').strip()
            account_id = request.args.get('accountId', '').strip()
            
            if not token or not email or not account_id:
                return jsonify({
                    'success': False,
                    'message': 'Missing required parameters'
                }), 400
            
            # Verify email
            result = user_model.verify_email(email, account_id, token)
            
            if not result:
                return jsonify({
                    'success': False,
                    'message': 'Link outdated or invalid'
                }), 400
            
            return jsonify({
                'success': True,
                'message': 'Email verified successfully'
            }), 200
        
        except Exception as e:
            logger.error(f"Email verification error: {str(e)}")
            return jsonify({'success': False, 'message': 'Verification failed'}), 500
    
    @auth_bp.route('/resend-verification', methods=['POST'])
    def resend_verification():
        """Resend verification email"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            email = data.get('email', '').strip()
            
            if not email:
                return jsonify({'success': False, 'message': 'Email is required'}), 400
            
            # Resend token
            user = user_model.resend_verification_token(email)
            
            if not user:
                return jsonify({'success': False, 'message': 'User not found'}), 404
            
            # Generate verification link
            verification_link = f"{Config.FRONTEND_URL}/verify-email?token={user['verification_token']}&email={email}&accountId={user['accountId']}"
            
            # Send email
            email_sent = EmailService.send_resend_verification_email(email, verification_link)
            
            if not email_sent:
                logger.warning(f"Email not sent for resend to {email}")
            
            return jsonify({
                'success': True,
                'message': 'Verification email resent. Please check your email.'
            }), 200
        
        except Exception as e:
            logger.error(f"Resend verification error: {str(e)}")
            return jsonify({'success': False, 'message': 'Resend failed'}), 500
    
    @auth_bp.route('/logout', methods=['POST'])
    def logout():
        """Logout current user and clear session"""
        try:
            from flask_login import logout_user
            logout_user()
            return jsonify({'success': True, 'message': 'Logged out successfully'}), 200
        except Exception as e:
            logger.error(f"Logout error: {str(e)}")
            return jsonify({'success': False, 'message': 'Logout failed'}), 500

    @auth_bp.route('/user-status', methods=['GET'])
    def user_status():
        """Get user verification status"""
        try:
            email = request.args.get('email', '').strip()
            
            if not email:
                return jsonify({'success': False, 'message': 'Email is required'}), 400
            
            status = user_model.get_user_status(email)
            
            if not status:
                return jsonify({'success': False, 'message': 'User not found'}), 404
            
            return jsonify({
                'success': True,
                'data': status
            }), 200
        
        except Exception as e:
            logger.error(f"User status error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to get user status'}), 500
    
    @auth_bp.route('/forgot-password', methods=['POST'])
    def forgot_password():
        """Send password reset email"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            email = data.get('email', '').strip()
            
            if not email:
                return jsonify({'success': False, 'message': 'Email is required'}), 400
            
            # Find user
            user = user_model.find_by_email(email)
            
            if not user:
                # Don't reveal if email exists (security best practice)
                return jsonify({
                    'success': True,
                    'message': 'If email exists, a password reset link has been sent.'
                }), 200
            
            # Create reset token
            user = user_model.create_reset_token(email)
            
            # Generate reset link
            reset_link = f"{Config.FRONTEND_URL}/reset-password?token={user['reset_password_token']}&email={email}"
            
            # Send reset email
            email_sent = EmailService.send_reset_password_email(email, reset_link)
            
            if not email_sent:
                logger.warning(f"Reset email not sent for user {email}, but token created")
            
            return jsonify({
                'success': True,
                'message': 'If email exists, a password reset link has been sent.'
            }), 200
        
        except Exception as e:
            logger.error(f"Forgot password error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to process request'}), 500
    
    @auth_bp.route('/reset-password', methods=['POST'])
    def reset_password():
        """Reset password with token"""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'success': False, 'message': 'No data provided'}), 400
            
            email = data.get('email', '').strip()
            token = data.get('token', '').strip()
            new_password = data.get('password', '')
            confirm_password = data.get('confirmPassword', '')
            
            if not email or not token:
                return jsonify({'success': False, 'message': 'Email and token are required'}), 400
            
            if not new_password:
                return jsonify({'success': False, 'message': 'Password is required'}), 400
            
            if new_password != confirm_password:
                return jsonify({'success': False, 'message': 'Passwords do not match'}), 400
            
            if len(new_password) < 6:
                return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
            
            # Verify reset token
            user = user_model.verify_reset_token(email, token)
            
            if not user:
                return jsonify({'success': False, 'message': 'Invalid or expired reset link'}), 400
            
            # Update password
            user_model.update_password(email, new_password)
            
            return jsonify({
                'success': True,
                'message': 'Password reset successful. Please login with your new password.'
            }), 200
        
        except Exception as e:
            logger.error(f"Reset password error: {str(e)}")
            return jsonify({'success': False, 'message': 'Password reset failed'}), 500
    
    return auth_bp


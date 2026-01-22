#!/usr/bin/env python3
"""
Test Authentication Backend - Flask Application
"""
import eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_pymongo import PyMongo
from pymongo import MongoClient
from config import Config, config
from routes.auth import init_auth_routes
from routes.user import init_user_routes
from routes.chatbot import init_chatbot_routes
from routes.zalo import zalo_bp, refresh_expiring_tokens
from models.user import UserModel, FlaskUser
from flask_login import LoginManager
from flask_socketio import SocketIO
from flask_apscheduler import APScheduler
from datetime import timedelta
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app(env=None):
    """Application factory"""
    
    if env is None:
        env = os.getenv('FLASK_ENV', 'development')
    
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[env])
    
    # Setup MongoDB connection
    try:
        mongo_client = MongoClient(app.config['MONGO_URI'])
        # Verify connection
        mongo_client.admin.command('ping')
        logger.info(f"Connected to MongoDB: {app.config['MONGO_URI']}")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {str(e)}")
        raise
    
    # Setup CORS (allow credentials for session cookies)
    CORS(app, origins=app.config['CORS_ORIGINS'], supports_credentials=True)

    # Setup Flask-Login
    login_manager = LoginManager()
    login_manager.init_app(app)
    app.permanent_session_lifetime = timedelta(seconds=Config.LOGIN_SESSION_EXPIRY)

    @login_manager.user_loader
    def load_user(account_id):
        try:
            user = UserModel(mongo_client).find_by_account_id(account_id)
            if not user:
                return None
            return FlaskUser(user)
        except Exception:
            return None
    
    # Register blueprints
    auth_bp = init_auth_routes(mongo_client)
    user_bp = init_user_routes(mongo_client)
    chatbot_bp = init_chatbot_routes(mongo_client)
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(chatbot_bp)

    # Register Zalo blueprint (OAuth, Webhooks)
    app.register_blueprint(zalo_bp)

    # Register Facebook blueprint (OAuth, Webhooks)
    try:
        from routes.facebook import facebook_bp, refresh_expiring_tokens as facebook_refresh
        app.register_blueprint(facebook_bp)
    except Exception as e:
        logger.info(f"Facebook routes not available: {e}")

    # Register integrations management
    from routes.integrations import integrations_bp
    app.register_blueprint(integrations_bp)

    # Attach mongo client to app for other modules
    app.mongo_client = mongo_client

    # Initialize Socket.IO
    app.socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet', manage_middleware=False)

    # SECURITY FIX: Register WebSocket connection handler to join account-specific rooms
    @app.socketio.on('connect')
    def handle_connect(auth):
        """Handle WebSocket connection and join account-specific room.
        
        Args:
            auth: Authentication data passed from client (dict with account_id)
        """
        try:
            from flask_socketio import join_room
            from flask import request, session
            
            account_id = None
            
            # Try multiple ways to get account_id
            # 1. From auth parameter passed by client
            if auth and isinstance(auth, dict):
                account_id = auth.get('account_id') or auth.get('accountId')
                logger.debug(f"Got account_id from auth param: {account_id}")
            
            # 2. From query parameters
            if not account_id:
                account_id = request.args.get('account_id') or request.args.get('accountId')
                if account_id:
                    logger.debug(f"Got account_id from query params: {account_id}")
            
            # 3. From session cookie
            if not account_id:
                try:
                    account_id = session.get('account_id') or session.get('accountId')
                    if account_id:
                        logger.debug(f"Got account_id from session: {account_id}")
                except Exception:
                    pass
            
            # 4. Try Flask-Login current_user (backup method)
            if not account_id:
                try:
                    from flask_login import current_user
                    if current_user and current_user.is_authenticated:
                        account_id = current_user.get_id()
                        logger.debug(f"Got account_id from current_user: {account_id}")
                except Exception as e:
                    logger.debug(f"Could not get account_id from current_user: {e}")
            
            # If we have account_id, join the room
            if account_id:
                room = f"account:{account_id}"
                join_room(room)
                logger.info(f"✅ User {account_id} connected and joined room {room}")
                return True  # Allow connection
            else:
                # Cannot identify account - reject connection
                logger.warning(f"❌ WebSocket connection rejected: Could not identify account_id. Auth: {auth}")
                return False  # Reject connection
                
        except Exception as e:
            logger.error(f"Error in WebSocket connect handler: {e}", exc_info=True)
            return False  # Reject connection on error

    # Initialize APScheduler for token refresh jobs
    scheduler = APScheduler()
    app.config['SCHEDULER_API_ENABLED'] = Config.SCHEDULER_API_ENABLED
    scheduler.init_app(app)
    scheduler.start()

    # Schedule Zalo token refresh every 30 minutes
    try:
        scheduler.add_job(id='zalo_token_refresh', func=lambda: refresh_expiring_tokens(app.mongo_client), trigger='interval', minutes=30)
    except Exception:
        # If job exists or cannot be added, ignore
        pass

    # Schedule Facebook token refresh every 30 minutes (if available)
    try:
        scheduler.add_job(id='facebook_token_refresh', func=lambda: facebook_refresh(app.mongo_client), trigger='interval', minutes=30)
    except Exception:
        # If job exists or cannot be added, ignore
        pass
    
    # Serve uploaded files
    @app.route('/uploads/avatars/<filename>')
    def serve_upload(filename):
        """Serve uploaded avatar files"""
        try:
            return send_from_directory(Config.UPLOAD_FOLDER, filename)
        except:
            logger.error(f"Failed to serve file: {filename}")
            return jsonify({'success': False, 'message': 'File not found'}), 404
    
    # Health check endpoint
    @app.route('/api/health', methods=['GET'])
    def health():
        """Health check endpoint"""
        return jsonify({
            'status': 'healthy',
            'environment': env
        }), 200
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'success': False, 'message': 'Not found'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {str(error)}")
        return jsonify({'success': False, 'message': 'Internal server error'}), 500
    
    return app, mongo_client

if __name__ == '__main__':
    app, mongo_client = create_app()
    
    # Print startup info
    logger.info("=" * 50)
    logger.info("Test Authentication Backend")
    logger.info("=" * 50)
    logger.info(f"Environment: {app.config['FLASK_ENV']}")
    logger.info(f"Debug: {app.debug}")
    logger.info(f"API Base URL: http://localhost:5000")
    logger.info(f"Frontend URL: {app.config['FRONTEND_URL']}")
    logger.info("=" * 50)
    
    # Run the application
    # Use SocketIO.run to support real-time features
    socketio = getattr(app, 'socketio', None)
    if socketio:
        socketio.run(app, host='0.0.0.0', port=5000, debug=app.debug)
    else:
        app.run(host='0.0.0.0', port=5000, debug=app.debug)


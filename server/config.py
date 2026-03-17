import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    MONGO_URI = os.getenv('MONGODB_URI')
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    FLASK_ENV = os.getenv('FLASK_ENV')
    
    # Email configuration
    SMTP_SERVER = os.getenv('SMTP_SERVER')
    SMTP_PORT = int(os.getenv('SMTP_PORT'))
    SMTP_EMAIL = os.getenv('SMTP_EMAIL')
    SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')
    
    # Token configuration
    VERIFICATION_TOKEN_EXPIRY = int(os.getenv('VERIFICATION_TOKEN_EXPIRY', 86400))  # 24 hours

    # Session/login expiry (seconds)
    LOGIN_SESSION_EXPIRY = int(os.getenv('LOGIN_SESSION_EXPIRY', 172800))  # 48 hours
    
    # Frontend URL
    FRONTEND_URL = os.getenv('FRONTEND_URL')
    
    # CORS configuration
    CORS_ORIGINS = [
        'http://localhost:3002',
        'http://127.0.0.1:3002',
        'http://103.7.40.236:3002',
        'http://63.250.52.103:3002',
    ]

    # Zalo OA configuration
    ZALO_APP_ID = os.getenv('ZALO_APP_ID')
    ZALO_APP_SECRET = os.getenv('ZALO_APP_SECRET')
    # Backend callback URL that Zalo will redirect to (must match Zalo app configuration)
    ZALO_REDIRECT_URI = os.getenv('ZALO_REDIRECT_URI')
    ZALO_VERIFICATION_TOKEN = os.getenv('ZALO_VERIFICATION_TOKEN')
    ZALO_API_BASE = os.getenv('ZALO_API_BASE')

    # Facebook App/Page configuration
    FB_APP_ID = os.getenv('FB_APP_ID')
    FB_APP_SECRET = os.getenv('FB_APP_SECRET')
    FB_REDIRECT_URI = os.getenv('FB_REDIRECT_URI')
    FB_VERIFICATION_TOKEN = os.getenv('FB_VERIFICATION_TOKEN')
    FB_API_BASE = os.getenv('FB_API_BASE')
    FB_API_VERSION = os.getenv('FB_API_VERSION', 'v17.0')
    FB_SCOPE = os.getenv('FB_SCOPE')

    # Redis for PKCE and short-lived data (use for production)
    REDIS_URL = os.getenv('REDIS_URL')

    # (AI configuration removed) Previously used to configure chatbot providers

    # Scheduler config
    SCHEDULER_API_ENABLED = os.getenv('SCHEDULER_API_ENABLED', 'True').lower() in ('1', 'true', 'yes')
    TOKEN_REFRESH_LEAD_SECONDS = int(os.getenv('TOKEN_REFRESH_LEAD_SECONDS', 10000))  # refresh 12 hrs before expiry by default
    
    # File upload configuration
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'avatars')
    MAX_UPLOAD_SIZE = 1024 * 1024  # 1MB
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

    AI_API_USERNAME = os.getenv('AI_API_USERNAME')
    AI_API_PASSWORD = os.getenv('AI_API_PASSWORD')

    # Global bot auto-reply master switch.
    # When false, inbound messages will not trigger bot auto-replies by default.
    USE_BOT = os.getenv('USE_BOT', 'True').lower() in ('1', 'true', 'yes', 'y', 'on')

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

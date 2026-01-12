import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    MONGO_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/test_db')
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    
    # Email configuration
    SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
    SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
    SMTP_EMAIL = os.getenv('SMTP_EMAIL', 'test@example.com')
    SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', 'test-password')
    
    # Token configuration
    VERIFICATION_TOKEN_EXPIRY = int(os.getenv('VERIFICATION_TOKEN_EXPIRY', 86400))  # 24 hours

    # Session/login expiry (seconds)
    LOGIN_SESSION_EXPIRY = int(os.getenv('LOGIN_SESSION_EXPIRY', 172800))  # 48 hours
    
    # Frontend URL
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
    
    # CORS configuration
    CORS_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://192.168.1.27:3000',
    ]

    # Zalo OA configuration
    ZALO_APP_ID = os.getenv('ZALO_APP_ID', '3162056231232104528')
    ZALO_APP_SECRET = os.getenv('ZALO_APP_SECRET', 'QTKnNMsQV4OriSv12S6K')
    # Backend callback URL that Zalo will redirect to (must match Zalo app configuration)
    ZALO_REDIRECT_URI = os.getenv('ZALO_REDIRECT_URI', 'https://nicola-unstagnant-limpidly.ngrok-free.dev/api/zalo/callback')
    ZALO_VERIFICATION_TOKEN = os.getenv('ZALO_VERIFICATION_TOKEN', 'change-me')
    ZALO_API_BASE = os.getenv('ZALO_API_BASE', 'https://oauth.zaloapp.com')

    # Facebook App/Page configuration
    FB_APP_ID = os.getenv('FB_APP_ID', '790841927348768')
    FB_APP_SECRET = os.getenv('FB_APP_SECRET', '6eff056e7ef1aa7dfd8115d91380c2d1')
    FB_REDIRECT_URI = os.getenv('FB_REDIRECT_URI', 'https://nicola-unstagnant-limpidly.ngrok-free.dev/api/facebook/callback')
    FB_VERIFICATION_TOKEN = os.getenv('FB_VERIFICATION_TOKEN', 'fb-verify-token')
    FB_API_BASE = os.getenv('FB_API_BASE', 'https://graph.facebook.com')
    FB_API_VERSION = os.getenv('FB_API_VERSION', 'v17.0')
    FB_SCOPE = os.getenv('FB_SCOPE', 'pages_show_list,pages_messaging,pages_manage_metadata,public_profile')

    # Redis for PKCE and short-lived data (use for production)
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

    # (AI configuration removed) Previously used to configure chatbot providers

    # Scheduler config
    SCHEDULER_API_ENABLED = os.getenv('SCHEDULER_API_ENABLED', 'True').lower() in ('1', 'true', 'yes')
    TOKEN_REFRESH_LEAD_SECONDS = int(os.getenv('TOKEN_REFRESH_LEAD_SECONDS', 60 * 60 * 12))  # refresh 12 hrs before expiry by default
    
    # File upload configuration
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'avatars')
    MAX_UPLOAD_SIZE = 1024 * 1024  # 1MB
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

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

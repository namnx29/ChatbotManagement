from datetime import datetime, timedelta
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
import bcrypt
import uuid
import secrets
from config import Config
from flask_login import UserMixin


class FlaskUser(UserMixin):
    """Lightweight wrapper around user document for Flask-Login"""
    def __init__(self, user_doc):
        self.user_doc = user_doc

    def get_id(self):
        return self.user_doc.get('accountId')

    @property
    def is_active(self):
        # We can extend this later to check a 'disabled' flag
        return True

class UserModel:
    """User model for MongoDB operations"""
    
    def __init__(self, mongo_client):
        self.client = mongo_client
        self.db = mongo_client.test_db
        self.collection = self.db.users
        self._create_indexes()
    
    def _create_indexes(self):
        """Create necessary indexes on the users collection"""
        self.collection.create_index('email', unique=True)
        self.collection.create_index('accountId', unique=True)
        self.collection.create_index('verification_token', sparse=True)
    
    def create_user(self, email, password, name=None, phone=None):
        """
        Create a new user in the database
        
        Args:
            email (str): User email
            password (str): Plain text password
            name (str): User name (optional)
            phone (str): User phone number (optional)
            
        Returns:
            dict: Created user data with accountId and verification_token
            
        Raises:
            ValueError: If email already exists
        """
        # Check if user already exists
        if self.collection.find_one({'email': email}):
            raise ValueError('Email already registered')
        
        # Hash password
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(10))
        
        # Generate verification token and accountId
        verification_token = secrets.token_urlsafe(32)
        account_id = str(uuid.uuid4())
        
        # Create user document
        user_data = {
            'email': email,
            'password': hashed_password,
            'name': name or email.split('@')[0],  # Default to email username part if not provided
            'is_verified': False,
            'verification_token': verification_token,
            'verification_token_expires_at': datetime.utcnow() + timedelta(seconds=Config.VERIFICATION_TOKEN_EXPIRY),
            'accountId': account_id,
            'phone_number': phone,
            'avatar_url': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        }
        
        try:
            result = self.collection.insert_one(user_data)
            user_data['_id'] = result.inserted_id
            return user_data
        except DuplicateKeyError:
            raise ValueError('Email already registered')
    
    def find_by_email(self, email):
        """Find user by email"""
        return self.collection.find_one({'email': email})
    
    def find_by_account_id(self, account_id):
        """Find user by accountId"""
        return self.collection.find_one({'accountId': account_id})
    
    def verify_password(self, user, password):
        """
        Verify user password
        
        Args:
            user (dict): User document from database
            password (str): Plain text password to verify
            
        Returns:
            bool: True if password matches, False otherwise
        """
        if not user:
            return False
        return bcrypt.checkpw(password.encode('utf-8'), user['password'])
    
    def verify_email(self, email, account_id, token):
        """
        Verify user email with token
        
        Args:
            email (str): User email
            account_id (str): User accountId
            token (str): Verification token
            
        Returns:
            dict: Updated user document or None if verification failed
        """
        user = self.collection.find_one({
            'email': email,
            'accountId': account_id,
            'verification_token': token
        })
        
        if not user:
            return None
        
        # Check if token has expired
        if user.get('verification_token_expires_at'):
            if datetime.utcnow() > user['verification_token_expires_at']:
                return None
        
        # Update user: mark as verified and clear token
        result = self.collection.find_one_and_update(
            {'_id': user['_id']},
            {
                '$set': {
                    'is_verified': True,
                    'verification_token': None,
                    'verification_token_expires_at': None,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        
        return result
    
    def resend_verification_token(self, email):
        """
        Generate a new verification token for user
        
        Args:
            email (str): User email
            
        Returns:
            dict: Updated user document or None if user not found
        """
        user = self.collection.find_one({'email': email})
        
        if not user:
            return None
        
        # Generate new token
        new_token = secrets.token_urlsafe(32)
        
        # Update user with new token
        result = self.collection.find_one_and_update(
            {'_id': user['_id']},
            {
                '$set': {
                    'verification_token': new_token,
                    'verification_token_expires_at': datetime.utcnow() + timedelta(seconds=Config.VERIFICATION_TOKEN_EXPIRY),
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        
        return result
    
    def get_user_status(self, email):
        """Get user verification status"""
        user = self.collection.find_one({'email': email})
        
        if not user:
            return None
        
        return {
            'email': user['email'],
            'is_verified': user.get('is_verified', False),
            'accountId': user.get('accountId'),
        }
    
    def create_reset_token(self, email):
        """
        Create a reset password token for user
        
        Args:
            email (str): User email
            
        Returns:
            dict: Updated user document or None if user not found
        """
        user = self.collection.find_one({'email': email})
        
        if not user:
            return None
        
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        
        # Update user with reset token (24 hour expiry)
        result = self.collection.find_one_and_update(
            {'_id': user['_id']},
            {
                '$set': {
                    'reset_password_token': reset_token,
                    'reset_password_token_expires_at': datetime.utcnow() + timedelta(seconds=Config.VERIFICATION_TOKEN_EXPIRY),
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        
        return result
    
    def verify_reset_token(self, email, token):
        """
        Verify reset password token
        
        Args:
            email (str): User email
            token (str): Reset token
            
        Returns:
            dict: User document or None if token invalid/expired
        """
        user = self.collection.find_one({
            'email': email,
            'reset_password_token': token
        })
        
        if not user:
            return None
        
        # Check if token has expired
        if user.get('reset_password_token_expires_at'):
            if datetime.utcnow() > user['reset_password_token_expires_at']:
                return None
        
        return user
    
    def update_password(self, email, new_password):
        """
        Update user password and clear reset token
        
        Args:
            email (str): User email
            new_password (str): New plain text password
            
        Returns:
            dict: Updated user document or None if user not found
        """
        user = self.collection.find_one({'email': email})
        
        if not user:
            return None
        
        # Hash new password
        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt(10))
        
        # Update password and clear reset token
        result = self.collection.find_one_and_update(
            {'_id': user['_id']},
            {
                '$set': {
                    'password': hashed_password,
                    'reset_password_token': None,
                    'reset_password_token_expires_at': None,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        
        return result
    
    def get_profile(self, account_id):
        """
        Get user profile data for authenticated user
        
        Args:
            account_id (str): User accountId
            
        Returns:
            dict: User profile data with non-sensitive information
        """
        user = self.collection.find_one({'accountId': account_id})
        
        if not user:
            return None
        
        # Return non-sensitive profile data
        return {
            'email': user['email'],
            'name': user.get('name'),
            'accountId': user['accountId'],
            'phone_number': user.get('phone_number'),
            'avatar_url': user.get('avatar_url'),
            'is_verified': user.get('is_verified', False),
            'created_at': user.get('created_at'),
        }
    
    def update_avatar_url(self, account_id, avatar_url):
        """
        Update user avatar URL
        
        Args:
            account_id (str): User accountId
            avatar_url (str): New avatar URL/path
            
        Returns:
            dict: Updated user document or None if user not found
        """
        user = self.collection.find_one({'accountId': account_id})
        
        if not user:
            return None
        
        # Update avatar URL
        result = self.collection.find_one_and_update(
            {'_id': user['_id']},
            {
                '$set': {
                    'avatar_url': avatar_url,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        
        return result
    
    def change_password(self, account_id, current_password, new_password):
        """
        Change user password after verifying current password
        
        Args:
            account_id (str): User accountId
            current_password (str): Current plain text password
            new_password (str): New plain text password
            
        Returns:
            dict: Updated user document or error dict with 'error' key
        """
        user = self.collection.find_one({'accountId': account_id})
        
        if not user:
            return {'error': 'User not found'}
        
        # Verify current password
        if not self.verify_password(user, current_password):
            return {'error': 'Current password is incorrect'}
        
        # Hash new password
        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt(10))
        
        # Update password
        result = self.collection.find_one_and_update(
            {'_id': user['_id']},
            {
                '$set': {
                    'password': hashed_password,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        
        return result

    def update_name(self, account_id, new_name):
        """
        Update user display name
        
        Args:
            account_id (str): User accountId
            new_name (str): New display name
            
        Returns:
            dict: Updated user document or None if user not found
        """
        user = self.collection.find_one({'accountId': account_id})
        
        if not user:
            return None
        
        # Update name
        result = self.collection.find_one_and_update(
            {'_id': user['_id']},
            {
                '$set': {
                    'name': new_name,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        
        return result


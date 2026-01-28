from datetime import datetime, timedelta
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
import bcrypt
import uuid
import secrets
import base64
import jwt
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
        # Create new indexes
        self.collection.create_index('email', unique=True, sparse=True)
        self.collection.create_index('accountId', unique=True)
        self.collection.create_index('verification_token', sparse=True)
        self.collection.create_index('organizationId')
    
    def create_user(self, email, password, name=None, phone=None, role='admin', parent_account_id=None, created_by=None):
        """
        Create a new user in the database
        
        Args:
            email (str): User email (required for admin, null for staff)
            password (str): Plain text password
            name (str): User name (optional)
            phone (str): User phone number (optional)
            role (str): 'admin' or 'staff' (default: 'admin')
            parent_account_id (str): Parent admin's accountId (for staff accounts)
            created_by (str): accountId of user who created this account
            
        Returns:
            dict: Created user data with accountId and verification_token
            
        Raises:
            ValueError: If email already exists
        """
        # Check if user already exists (only for admin accounts with email)
        if email and self.collection.find_one({'email': email}):
            raise ValueError('Email already registered')
        
        # Hash password
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(10))
        
        # Generate verification token and accountId
        verification_token = secrets.token_urlsafe(32)
        account_id = str(uuid.uuid4())
        organization_id = str(uuid.uuid4()) if role == 'admin' else None

        # Create user document
        user_data = {
            'email': email,
            'password': hashed_password,
            'name': name or (email.split('@')[0] if email else 'User'),
            'username': None,  # Will be set during staff creation or later
            'role': role,  # 'admin' or 'staff'
            'organizationId': organization_id,
            'parent_account_id': parent_account_id,  # None for admin, admin's accountId for staff
            'created_by': created_by,  # Who created this account
            'is_verified': (role == 'staff'),  # Staff accounts auto-verified
            'verification_token': verification_token if role == 'admin' else None,
            'verification_token_expires_at': (datetime.utcnow() + timedelta(seconds=Config.VERIFICATION_TOKEN_EXPIRY)) if role == 'admin' else None,
            'accountId': account_id,
            'phone_number': phone,
            'avatar_url': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        }
        if email:
            user_data['email'] = email

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
    
    def verify_password(self, user, password, role='admin'):
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
        
        if role == 'staff' and 'username' in user:
            # Staff users may have passwords stored as plain text (legacy support)
            return user['password'] == password
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
            'email': user['email'] if 'email' in user else None,
            'username': user.get('username') if 'username' in user else None,
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
        
        role = user.get('role', 'admin')
        
        # Verify current password
        if not self.verify_password(user, current_password, role):
            return {'error': 'Current password is incorrect'}
        
        # Hash new password
        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt(10))
        
        # Update password
        result = self.collection.find_one_and_update(
            {'_id': user['_id']},
            {
                '$set': {
                    'password': role == 'staff' and new_password or hashed_password,
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

    # ==================== STAFF MANAGEMENT METHODS ====================

    def find_by_username(self, username):
        """Find user by username"""
        query = {'username': username}
        # if parent_account_id:
        #     query['parent_account_id'] = parent_account_id
        return self.collection.find_one(query)

    def create_staff(self, parent_account_id, username, name, phone_number=None, password=None):
        """
        Create a new staff account
        
        Args:
            parent_account_id (str): Admin's accountId
            username (str): Staff username (unique per admin)
            name (str): Staff full name
            phone_number (str): Phone number (optional)
            password (str): Staff password
            
        Returns:
            dict: Created staff data
            
        Raises:
            ValueError: If validation fails
        """
        # Verify parent account is admin
        parent = self.collection.find_one({'accountId': parent_account_id, 'role': 'admin'})
        if not parent:
            raise ValueError('Unauthorized: Admin account required')
        
        parent_organization_id = parent.get('organizationId')

        # Check username uniqueness within parent account
        existing = self.collection.find_one({
            'parent_account_id': parent_account_id,
            'username': username
        })
        if existing:
            raise ValueError('Username already exists')
        
        # Create staff account
        account_id = str(uuid.uuid4())
        
        staff_data = {
            'accountId': account_id,
            'username': username,
            'name': name,
            'phone_number': phone_number,
            'password': password,
            'is_verified': True,
            'role': 'staff',
            'organizationId': parent_organization_id,
            'parent_account_id': parent_account_id,
            'avatar_url': None,
            'created_by': parent_account_id,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'verification_token': None,
            'verification_token_expires_at': None,
        }
        
        try:
            result = self.collection.insert_one(staff_data)
            staff_data['_id'] = result.inserted_id
            return staff_data
        except DuplicateKeyError:
            raise ValueError('Username already exists')

    def list_staff_accounts(self, parent_account_id, skip=0, limit=50, search=None):
        """
        List all staff accounts for an admin
        
        Args:
            parent_account_id (str): Admin's accountId
            skip (int): Skip count for pagination
            limit (int): Limit for pagination
            search (str): Search string for name/username filter
            
        Returns:
            tuple: (staff list, total count)
        """
        query = {
            'parent_account_id': parent_account_id,
            'role': 'staff'
        }
        
        if search:
            query['$or'] = [
                {'name': {'$regex': search, '$options': 'i'}},
                {'username': {'$regex': search, '$options': 'i'}}
            ]
        
        cursor = self.collection.find(query).skip(skip).limit(limit)
        staff = list(cursor)
        total = self.collection.count_documents(query)
        
        return staff, total

    def update_staff(self, staff_account_id, parent_account_id, **updates):
        """
        Update staff account fields
        
        Args:
            staff_account_id (str): Staff accountId
            parent_account_id (str): Parent admin's accountId (for authorization)
            **updates: Fields to update (name, username, phone_number, new_password)
            
        Returns:
            dict: Updated staff document
            
        Raises:
            ValueError: If validation fails
        """
        # Verify staff belongs to parent
        staff = self.collection.find_one({
            'accountId': staff_account_id,
            'parent_account_id': parent_account_id,
            'role': 'staff'
        })
        if not staff:
            raise ValueError('Staff account not found or unauthorized')
        
        # Build update set
        update_fields = {
            'updated_at': datetime.utcnow()
        }
        
        # Update name
        if 'name' in updates and updates['name'] != staff.get('name'):
            update_fields['name'] = updates['name']
        
        # Update username (check uniqueness)
        if 'username' in updates and updates['username'] != staff.get('username'):
            existing = self.collection.find_one({
                'parent_account_id': parent_account_id,
                'username': updates['username'],
                'accountId': {'$ne': staff_account_id}
            })
            if existing:
                raise ValueError('Username already exists')
            update_fields['username'] = updates['username']
        
        # Update phone
        if 'phone_number' in updates:
            update_fields['phone_number'] = updates['phone_number'] or None
        
        # Update password if provided
        if 'new_password' in updates and updates['new_password']:
            update_fields['password'] = updates['new_password']
        
        # Only update if there are changes
        if len(update_fields) == 1:  # Only updated_at
            return staff
        
        # Update and return
        result = self.collection.find_one_and_update(
            {'_id': staff['_id']},
            {'$set': update_fields},
            return_document=True
        )
        
        return result

    def delete_staff(self, staff_account_id, parent_account_id):
        """
        Delete a staff account
        
        Args:
            staff_account_id (str): Staff accountId
            parent_account_id (str): Parent admin's accountId (for authorization)
            
        Returns:
            bool: True if deleted
            
        Raises:
            ValueError: If staff not found or unauthorized
        """
        # Verify staff belongs to parent
        staff = self.collection.find_one({
            'accountId': staff_account_id,
            'parent_account_id': parent_account_id,
            'role': 'staff'
        })
        if not staff:
            raise ValueError('Staff account not found or unauthorized')
        
        # Delete
        self.collection.delete_one({'_id': staff['_id']})
        return True

    def verify_admin_password(self, admin_account_id, password):
        """
        Verify admin password and return a session token valid for 5 minutes
        
        Args:
            admin_account_id (str): Admin's accountId
            password (str): Admin's password
            
        Returns:
            dict: {token, expires_at}
            
        Raises:
            ValueError: If admin not found or password incorrect
        """
        admin = self.collection.find_one({'accountId': admin_account_id, 'role': 'admin'})
        if not admin:
            raise ValueError('Admin account not found')
        
        if not self.verify_password(admin, password):
            raise ValueError('Invalid password')
        
        # Generate session token (5 minute expiry)
        session_expires = datetime.utcnow() + timedelta(minutes=5)
        token_data = {
            'admin_account_id': admin_account_id,
            'purpose': 'view_staff_password',
            'exp': int(session_expires.timestamp())
        }
        token = jwt.encode(token_data, Config.SECRET_KEY, algorithm='HS256')
        
        return {
            'token': token,
            'expires_at': session_expires.isoformat()
        }

    def get_staff_password(self, staff_account_id, parent_account_id, verification_token):
        """
        Get staff password only if verification token is valid
        
        Args:
            staff_account_id (str): Staff accountId
            parent_account_id (str): Parent admin's accountId
            verification_token (str): JWT verification token
            
        Returns:
            dict: {password, username}
            
        Raises:
            ValueError: If verification fails or staff not found
        """
        # Verify the token
        try:
            decoded = jwt.decode(verification_token, Config.SECRET_KEY, algorithms=['HS256'])
            if decoded.get('admin_account_id') != parent_account_id:
                raise ValueError('Token invalid for this admin')
        except jwt.ExpiredSignatureError:
            raise ValueError('Verification session expired')
        except jwt.InvalidTokenError:
            raise ValueError('Invalid verification token')
        
        staff = self.db.users.find_one({
            "accountId": staff_account_id, 
            "parent_account_id": parent_account_id
        })

        if not staff:
            raise ValueError("Staff not found")

        password_val = staff.get('password', '')

        # FIX: Check if the password is bytes and decode it
        if isinstance(password_val, bytes):
            password_val = password_val.decode('utf-8')

        return {
            'password': password_val,
            'username': staff.get('username')
        }
    
    def get_user_organization_id(self, account_id):
        """Get organization ID for a user account
        
        Args:
            account_id (str): User's account ID
            
        Returns:
            str: Organization ID or None if user not found
        """
        user = self.collection.find_one({'accountId': account_id})
        if not user:
            return None
        return user.get('organizationId')

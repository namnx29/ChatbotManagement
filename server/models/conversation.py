import logging
from datetime import datetime, timedelta
from pymongo import MongoClient
from bson.objectid import ObjectId
from flask import current_app

logger = logging.getLogger(__name__)

class ConversationModel:
    def __init__(self, mongo_client):
        self.client = mongo_client
        self.db = mongo_client.test_db
        self.collection = self.db.conversations
        self._create_indexes()

    def _create_indexes(self):
        # SECURITY FIX: Drop old non-isolated indexes before creating new ones
        try:
            # Drop old unsafe unique index to avoid conflict with new isolated index
            index_info = self.collection.index_information()
            
            # Look for and drop old unique index on (oa_id, customer_id)
            for index_name, index_details in index_info.items():
                index_key = index_details.get('key', [])
                if (len(index_key) == 2 and 
                    index_key[0][0] == 'oa_id' and 
                    index_key[1][0] == 'customer_id' and
                    index_details.get('unique')):
                    logger.info(f"Dropping old unsafe unique index: {index_name}")
                    self.collection.drop_index(index_name)
            
            # Look for and drop old index with different sparse setting
            for index_name, index_details in index_info.items():
                index_key = index_details.get('key', [])
                if (len(index_key) == 3 and 
                    index_key[0][0] == 'accountId' and 
                    index_key[1][0] == 'oa_id' and 
                    index_key[2][0] == 'customer_id' and
                    not index_details.get('sparse')):  # Old one doesn't have sparse
                    logger.info(f"Dropping old index without sparse setting: {index_name}")
                    self.collection.drop_index(index_name)
        except Exception as e:
            logger.warning(f"Error managing old indexes: {e}")
        
        # SECURITY FIX: Unique index on accountId + oa_id + customer_id pair (account isolation)
        try:
            self.collection.create_index([('accountId', 1), ('oa_id', 1), ('customer_id', 1)], unique=True, sparse=True)
        except Exception as e:
            logger.warning(f"Error creating accountId unique index: {e}")
        
        # Legacy index for backward compatibility (may be duplicate, but allows transition)
        try:
            self.collection.create_index([('oa_id', 1), ('customer_id', 1)], unique=False)
        except Exception as e:
            logger.warning(f"Error creating legacy index: {e}")
        
        # Index for querying by accountId and oa_id
        try:
            self.collection.create_index([('accountId', 1), ('oa_id', 1), ('updated_at', -1)])
        except Exception as e:
            logger.warning(f"Error creating accountId+oa_id index: {e}")
        
        # Index for querying by accountId and customer_id
        try:
            self.collection.create_index([('accountId', 1), ('customer_id', 1), ('updated_at', -1)])
        except Exception as e:
            logger.warning(f"Error creating accountId+customer_id index: {e}")
        
        # Index for querying by chatbot_id (for account isolation)
        try:
            self.collection.create_index([('chatbot_id', 1), ('updated_at', -1)])
        except Exception as e:
            logger.warning(f"Error creating chatbot_id index: {e}")
        
        # Index for querying by accountId and chatbot_id
        try:
            self.collection.create_index([('accountId', 1), ('chatbot_id', 1), ('updated_at', -1)])
        except Exception as e:
            logger.warning(f"Error creating accountId+chatbot_id index: {e}")

        try:
            self.collection.create_index(
                [('organizationId', 1), ('oa_id', 1), ('customer_id', 1)], 
                unique=True, 
                sparse=True
            )
        except Exception as e:
            logger.warning(f"Error creating organizationId unique index: {e}")
        
        try:
            self.collection.create_index([('organizationId', 1), ('oa_id', 1), ('updated_at', -1)])
        except Exception as e:
            logger.warning(f"Error creating organizationId+oa_id index: {e}")
        
        try:
            self.collection.create_index([('organizationId', 1), ('customer_id', 1), ('updated_at', -1)])
        except Exception as e:
            logger.warning(f"Error creating organizationId+customer_id index: {e}")

    def _serialize(self, doc, current_user_id=None):
        if not doc:
            return None
        out = dict(doc)

        nickname = out.get('nicknames', {})
        default_name = out.get('customer_info', {}).get('name', 'Khách hàng')

        if current_user_id and current_user_id in nickname:
            out['display_name'] = nickname[current_user_id]
        else:
            out['display_name'] = default_name
        
        if out.get('_id') is not None:
            try:
                out['_id'] = str(out['_id'])
            except Exception:
                pass
        for k, v in list(out.items()):
            try:
                if hasattr(v, 'isoformat') and callable(getattr(v, 'isoformat')):
                    out[k] = v.isoformat() + 'Z'
                elif isinstance(v, dict):
                    # Recursively serialize nested dicts (e.g., last_message)
                    for nested_k, nested_v in v.items():
                        if hasattr(nested_v, 'isoformat') and callable(getattr(nested_v, 'isoformat')):
                            v[nested_k] = nested_v.isoformat() + 'Z'
            except Exception:
                pass

        # Ensure current_handler presence and serialize lock_expires_at
        if out.get('current_handler') and isinstance(out.get('current_handler'), dict):
            # keep as-is; name/accountId should be present
            pass
        if out.get('lock_expires_at'):
            try:
                le = out.get('lock_expires_at')
                if hasattr(le, 'isoformat') and callable(getattr(le, 'isoformat')):
                    out['lock_expires_at'] = le.isoformat() + 'Z'
            except Exception:
                pass

        return out

    def upsert_conversation(self, oa_id, customer_id, last_message_text=None, last_message_created_at=None, 
                           direction='in', customer_info=None, increment_unread=False, chatbot_id=None, chatbot_info=None, account_id=None, organization_id=None):
        """
        Upsert a conversation. Updates last_message and unread_count.
        - direction: 'in' for incoming (from customer), 'out' for outgoing (from staff)
        - increment_unread: if True and direction='in', increment unread_count
        - customer_info: dict with {name, avatar} to denormalize customer info
        - chatbot_id: the chatbot this conversation belongs to (for account isolation)
        - chatbot_info: dict with {name, avatar} to denormalize chatbot info
        - account_id: SECURITY FIX - the account that owns this conversation (for account isolation)
        Returns the conversation document.
        """
        now = datetime.utcnow()
        
        # Build update document
        update_doc = {
            'oa_id': oa_id,
            'customer_id': customer_id,
            'updated_at': now,
        }
        
        # SECURITY FIX: Always include accountId for account isolation
        if account_id:
            update_doc['accountId'] = account_id
        
        if organization_id:
            update_doc['organizationId'] = organization_id

        if chatbot_id:
            update_doc['chatbot_id'] = chatbot_id
        
        if chatbot_info:
            update_doc['chatbot_info'] = {
                'name': chatbot_info.get('name'),
                'avatar': chatbot_info.get('avatar'),
            }
        
        if last_message_text is not None:
            update_doc['last_message'] = {
                'text': last_message_text,
                'created_at': last_message_created_at or now,
            }
        
        if customer_info:
            update_doc['customer_info'] = {
                'name': customer_info.get('name'),
                'avatar': customer_info.get('avatar'),
            }
        
        # Build query to find existing conversation
        query = {'oa_id': oa_id, 'customer_id': customer_id}
        if organization_id:
            query['organizationId'] = organization_id
        elif account_id:
            query['accountId'] = account_id
        
        # Check if conversation exists first to avoid $setOnInsert vs $inc conflict
        existing = self.collection.find_one(query)
        
        if existing:
            # Document exists - use $set and $inc
            update_op = {
                '$set': update_doc,
            }
            if increment_unread and direction == 'in':
                update_op['$inc'] = {'unread_count': 1}
        else:
            # Document doesn't exist - use $setOnInsert for initial values
            initial_unread = 1 if (increment_unread and direction == 'in') else 0
            update_op = {
                '$set': update_doc,
                '$setOnInsert': {
                    'created_at': now,
                    'unread_count': initial_unread,
                }
            }
        
        # Upsert conversation with account isolation
        result = self.collection.find_one_and_update(
            query,
            update_op,
            upsert=True,
            return_document=True
        )
        
        return self._serialize(result)

    def find_by_oa_and_customer(self, oa_id, customer_id, account_id=None, organization_id=None):
        """Find conversation by oa_id and customer_id
        
        SECURITY FIX: If organization_id is provided, filter by it (primary).
        If account_id is provided (legacy), filter by it (fallback).
        """
        query = {'oa_id': oa_id, 'customer_id': customer_id}
        if organization_id:
            query['organizationId'] = organization_id
        elif account_id:
            query['accountId'] = account_id
        doc = self.collection.find_one(query)
        
        # DEBUG LOGGING: Trace conversation retrieval
        if doc:
            logger.info(f"Found conversation: oa_id={oa_id}, customer_id={customer_id}, organization_id={organization_id}, account_id={account_id}, _id={doc.get('_id')}")
        else:
            logger.warning(f"Conversation NOT found: oa_id={oa_id}, customer_id={customer_id}, organization_id={organization_id}, account_id={account_id}")
        
        return self._serialize(doc)

    def find_by_oa(self, oa_id, limit=100, skip=0, account_id=None):
        """Find all conversations for an OA, sorted by updated_at descending
        
        SECURITY FIX: If account_id is provided, filter by it to ensure account isolation.
        """
        query = {'oa_id': oa_id}
        if account_id:
            query['accountId'] = account_id
        cursor = self.collection.find(query).sort('updated_at', -1).skip(skip).limit(limit)
        docs = [self._serialize(d) for d in list(cursor)]
        return docs

    def mark_read(self, oa_id, customer_id, account_id=None, organization_id=None):
        """Mark conversation as read (reset unread_count to 0)
        
        SECURITY FIX: If organization_id is provided, filter by it (primary).
        If account_id is provided (legacy), filter by it (fallback).
        """
        query = {'oa_id': oa_id, 'customer_id': customer_id}
        if organization_id:
            query['organizationId'] = organization_id
        elif account_id:
            query['accountId'] = account_id
        result = self.collection.find_one_and_update(
            query,
            {
                '$set': {
                    'unread_count': 0,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        return self._serialize(result)

    def get_conversation_id(self, oa_id, customer_id):
        """Get the conversation _id (ObjectId) for a given oa_id and customer_id"""
        doc = self.collection.find_one({'oa_id': oa_id, 'customer_id': customer_id}, projection={'_id': 1})
        if doc:
            return str(doc['_id'])
        return None

    def get_all_oa_ids(self):
        """Get all distinct oa_ids in the conversations collection"""
        oa_ids = self.collection.distinct('oa_id')
        return oa_ids or []

    def find_all_by_oa_ids(self, oa_ids, limit=500, skip=0):
        """Find all conversations for a list of oa_ids, sorted by updated_at descending"""
        if not oa_ids:
            return []
        cursor = self.collection.find({'oa_id': {'$in': oa_ids}}).sort('updated_at', -1).skip(skip).limit(limit)
        docs = [self._serialize(d) for d in list(cursor)]
        return docs

    def find_by_chatbot_id(self, chatbot_id, limit=2000, skip=0, account_id=None, organization_id=None):
        """Find all conversations for a chatbot_id, sorted by updated_at descending
        
        NEW: If organization_id is provided, filter by it (primary).
        If account_id is provided (legacy), filter by it (fallback).
        """
        if not chatbot_id:
            return []
        query = {'chatbot_id': chatbot_id}
        if organization_id:
            query['organizationId'] = organization_id
        elif account_id:
            query['accountId'] = account_id
        cursor = self.collection.find(query).sort('updated_at', -1).skip(skip).limit(limit)
        logger.info(query)
        docs = [self._serialize(d) for d in list(cursor)]
        return docs

    # Locking API
    def lock_by_id(self, conversation_id, handler_account_id, handler_name, ttl_seconds=300):
        """Acquire a lock for a conversation by conversation _id (string or ObjectId).
        Returns the serialized updated document or None if failed.
        """
        try:
            from bson.objectid import ObjectId
            try:
                conv_obj_id = ObjectId(conversation_id)
            except Exception:
                # Try finding string _id match
                conv_obj_id = conversation_id
        except Exception:
            conv_obj_id = conversation_id
        now = datetime.utcnow()
        expires_at = now + timedelta(seconds=int(ttl_seconds))

        from models.user import UserModel
        user_model = UserModel(current_app.mongo_client)
        user_data = user_model.find_by_account_id(handler_account_id)

        if user_data.get('role') == 'admin':
        # If Admin, just fetch the conversation without setting a lock/handler
            result = self.collection.find_one({'_id': conv_obj_id})
            return self._serialize(result)
        
        result = self.collection.find_one_and_update(
            {'_id': conv_obj_id, '$or': [{'current_handler': None}, {'lock_expires_at': {'$lte': now}}]},
            {
                '$set': {
                    'current_handler': {
                        'accountId': handler_account_id,
                        'name': handler_name,
                        'started_at': now,
                    },
                    'lock_expires_at': expires_at,
                    'updated_at': now,
                }
            },
            return_document=True
        )
        return self._serialize(result)

    def set_handler_if_unset(self, conversation_id, handler_account_id, handler_name):
        """Set a persistent handler for a conversation only if none exists.
        This does NOT set a TTL — it's a persistent assignment used for "first-sender becomes handler" behavior.
        Returns the serialized updated document or None if another handler already exists.
        """
        try:
            from bson.objectid import ObjectId
            try:
                conv_obj_id = ObjectId(conversation_id)
            except Exception:
                conv_obj_id = conversation_id
        except Exception:
            conv_obj_id = conversation_id
        now = datetime.utcnow()

        from models.user import UserModel
        user_model = UserModel(current_app.mongo_client)
        user_data = user_model.find_by_account_id(handler_account_id)

        if user_data.get('role') == 'admin':
        # If Admin, just fetch the conversation without setting a lock/handler
            result = self.collection.find_one({'_id': conv_obj_id})
            return self._serialize(result)

        result = self.collection.find_one_and_update(
            {
                '_id': conv_obj_id,
                '$or': [
                    {'current_handler': None},
                    {'current_handler': {'$exists': False}}
                ]
            },
            {
                '$set': {
                    'current_handler': {
                        'accountId': handler_account_id,
                        'name': handler_name,
                        'started_at': now,
                    },
                    'updated_at': now,
                }
            },
            return_document=True
        )
        return self._serialize(result)

    def unlock_by_id(self, conversation_id, requester_account_id=None, force=False):
        """Release a lock for a conversation. Allows requester to unlock if they are the handler or force=True to force-unlock.
        Returns the serialized updated document or None if no change.
        """
        try:
            from bson.objectid import ObjectId
            try:
                conv_obj_id = ObjectId(conversation_id)
            except Exception:
                conv_obj_id = conversation_id
        except Exception:
            conv_obj_id = conversation_id

        # If not force, ensure requester matches current_handler.accountId
        if not force and requester_account_id:
            res = self.collection.find_one_and_update(
                {'_id': conv_obj_id, 'current_handler.accountId': requester_account_id},
                {
                    '$set': {'updated_at': datetime.utcnow()},
                    '$unset': {'current_handler': '', 'lock_expires_at': ''}
                },
                return_document=True
            )
            return self._serialize(res)
        else:
            res = self.collection.find_one_and_update(
                {'_id': conv_obj_id},
                {
                    '$set': {'updated_at': datetime.utcnow()},
                    '$unset': {'current_handler': '', 'lock_expires_at': ''}
                },
                return_document=True
            )
            return self._serialize(res)

    def expire_locks(self):
        """Expire locks whose lock_expires_at <= now. Returns list of serialized updated conversations."""
        now = datetime.utcnow()
        res = list(self.collection.find({'lock_expires_at': {'$lte': now}}))
        if not res:
            return []
        updated_ids = [r.get('_id') for r in res if r.get('_id')]
        # unset fields for these docs
        self.collection.update_many({'_id': {'$in': updated_ids}}, {'$set': {'updated_at': now}, '$unset': {'current_handler': '', 'lock_expires_at': ''}})
        docs = list(self.collection.find({'_id': {'$in': updated_ids}}))
        return [self._serialize(d) for d in docs]

    def update_nickname(self, oa_id, customer_id, user_id, nick_name, account_id=None, organization_id=None):
        """Update nickname for a conversation
        
        NEW: If organization_id is provided, use it (primary).
        SECURITY FIX: If account_id is provided, filter by it to ensure account isolation (fallback).
        """
        query = {'oa_id': oa_id, 'customer_id': customer_id}
        if organization_id:
            query['organizationId'] = organization_id
        elif account_id:
            query['accountId'] = account_id
        result = self.collection.find_one_and_update(
            query,
            {
                '$set': {
                    f'nicknames.{user_id}': nick_name,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        return self._serialize(result)
    
    def list_by_organization(self, organization_id, limit=100, skip=0):
        """List all conversations for an organization, sorted by updated_at descending
        
        NEW: Primary query method using organizationId for org-level isolation.
        """
        if not organization_id:
            return []
        cursor = self.collection.find({'organizationId': organization_id}).sort('updated_at', -1).skip(skip).limit(limit)
        docs = [self._serialize(d) for d in list(cursor)]
        return docs
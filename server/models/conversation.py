import logging
from datetime import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId

logger = logging.getLogger(__name__)

class ConversationModel:
    def __init__(self, mongo_client):
        self.client = mongo_client
        self.db = mongo_client.test_db
        self.collection = self.db.conversations
        self._create_indexes()

    def _create_indexes(self):
        # Unique index on oa_id + customer_id pair
        self.collection.create_index([('oa_id', 1), ('customer_id', 1)], unique=True)
        # Index for querying by oa_id
        self.collection.create_index([('oa_id', 1), ('updated_at', -1)])
        # Index for querying by customer_id
        self.collection.create_index([('customer_id', 1), ('updated_at', -1)])
        # Index for querying by chatbot_id (for account isolation)
        self.collection.create_index([('chatbot_id', 1), ('updated_at', -1)])

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
        return out

    def upsert_conversation(self, oa_id, customer_id, last_message_text=None, last_message_created_at=None, 
                           direction='in', customer_info=None, increment_unread=False, chatbot_id=None, chatbot_info=None):
        """
        Upsert a conversation. Updates last_message and unread_count.
        - direction: 'in' for incoming (from customer), 'out' for outgoing (from staff)
        - increment_unread: if True and direction='in', increment unread_count
        - customer_info: dict with {name, avatar} to denormalize customer info
        - chatbot_id: the chatbot this conversation belongs to (for account isolation)
        - chatbot_info: dict with {name, avatar} to denormalize chatbot info
        Returns the conversation document.
        """
        now = datetime.utcnow()
        
        # Build update document
        update_doc = {
            'oa_id': oa_id,
            'customer_id': customer_id,
            'updated_at': now,
        }
        
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
        
        # Check if conversation exists first to avoid $setOnInsert vs $inc conflict
        existing = self.collection.find_one({'oa_id': oa_id, 'customer_id': customer_id})
        
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
        
        # Upsert conversation
        result = self.collection.find_one_and_update(
            {'oa_id': oa_id, 'customer_id': customer_id},
            update_op,
            upsert=True,
            return_document=True
        )
        
        return self._serialize(result)

    def find_by_oa_and_customer(self, oa_id, customer_id):
        """Find conversation by oa_id and customer_id"""
        doc = self.collection.find_one({'oa_id': oa_id, 'customer_id': customer_id})
        return self._serialize(doc)

    def find_by_oa(self, oa_id, limit=100, skip=0):
        """Find all conversations for an OA, sorted by updated_at descending"""
        cursor = self.collection.find({'oa_id': oa_id}).sort('updated_at', -1).skip(skip).limit(limit)
        docs = [self._serialize(d) for d in list(cursor)]
        return docs

    def mark_read(self, oa_id, customer_id):
        """Mark conversation as read (reset unread_count to 0)"""
        result = self.collection.find_one_and_update(
            {'oa_id': oa_id, 'customer_id': customer_id},
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

    def find_by_chatbot_id(self, chatbot_id, limit=2000, skip=0):
        """Find all conversations for a chatbot_id, sorted by updated_at descending"""
        if not chatbot_id:
            return []
        cursor = self.collection.find({'chatbot_id': chatbot_id}).sort('updated_at', -1).skip(skip).limit(limit)
        docs = [self._serialize(d) for d in list(cursor)]
        return docs

    def update_nickname(self, oa_id, customer_id, user_id, nick_name):
        result = self.collection.find_one_and_update(
            {'oa_id': oa_id, 'customer_id': customer_id},
            {
                '$set': {
                    f'nicknames.{user_id}': nick_name,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )
        return self._serialize(result)
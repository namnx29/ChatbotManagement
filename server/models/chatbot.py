from datetime import datetime
from bson.objectid import ObjectId


class ChatbotModel:
    """Chatbot model for MongoDB operations"""

    def __init__(self, mongo_client):
        self.client = mongo_client
        self.db = mongo_client.test_db
        self.collection = self.db.chatbots
        self._create_indexes()

    def _create_indexes(self):
        self.collection.create_index('accountId')

    def create_chatbot(self, account_id, name, purpose=None, greeting=None, fields=None, avatar_url=None):
        """Create a new chatbot document"""
        now = datetime.utcnow()
        bot = {
            'accountId': account_id,
            'name': name,
            'purpose': purpose,
            'greeting': greeting,
            'fields': fields or [],
            'avatar_url': avatar_url,
            'created_at': now,
            'updated_at': now,
        }

        result = self.collection.insert_one(bot)
        bot['_id'] = result.inserted_id
        return bot

    def list_chatbots_by_account(self, account_id):
        """Return list of chatbots for an account ordered by updated_at desc"""
        cursor = self.collection.find({'accountId': account_id}).sort('updated_at', -1)
        bots = []
        for b in cursor:
            b['id'] = str(b.get('_id'))
            # keep only useful fields
            bots.append({
                'id': b['id'],
                'name': b.get('name'),
                'avatar_url': b.get('avatar_url'),
                'purpose': b.get('purpose'),
                'greeting': b.get('greeting'),
                'fields': b.get('fields', []),
                'created_at': b.get('created_at'),
                'updated_at': b.get('updated_at'),
            })
        return bots

    def get_chatbot(self, bot_id):
        try:
            _id = ObjectId(bot_id)
        except Exception:
            return None

        b = self.collection.find_one({'_id': _id})
        if not b:
            return None
        b['id'] = str(b.get('_id'))
        return b

    def delete_chatbot(self, account_id, bot_id):
        try:
            _id = ObjectId(bot_id)
        except Exception:
            return False

        result = self.collection.delete_one({'_id': _id, 'accountId': account_id})
        return result.deleted_count == 1

    def update_chatbot_avatar(self, account_id, bot_id, avatar_url):
        """Update avatar_url for a chatbot"""
        try:
            _id = ObjectId(bot_id)
        except Exception:
            return None

        result = self.collection.find_one_and_update(
            {'_id': _id, 'accountId': account_id},
            {
                '$set': {
                    'avatar_url': avatar_url,
                    'updated_at': datetime.utcnow(),
                }
            },
            return_document=True
        )

        return result

    def update_chatbot(self, account_id, bot_id, updates: dict):
        """Update chatbot document fields (e.g., name, purpose, greeting, fields, avatar_url)"""
        try:
            _id = ObjectId(bot_id)
        except Exception:
            return None

        set_fields = {k: v for k, v in updates.items() if v is not None}
        if not set_fields:
            return None

        set_fields['updated_at'] = datetime.utcnow()

        result = self.collection.find_one_and_update(
            {'_id': _id, 'accountId': account_id},
            {'$set': set_fields},
            return_document=True
        )

        if not result:
            return None

        result['id'] = str(result.get('_id'))
        return result

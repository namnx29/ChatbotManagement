from datetime import datetime
from bson.objectid import ObjectId


class TrainingModel:
    """Model to handle training data per chatbot per account"""

    def __init__(self, mongo_client):
        self.client = mongo_client
        self.db = mongo_client.test_db
        self.collection = self.db.training_data
        self._create_indexes()

    def _create_indexes(self):
        # Combined index to quickly find training by account + bot
        self.collection.create_index([('accountId', 1), ('botId', 1)])

    def create_training(self, account_id, bot_id, status, question, answer):
        now = datetime.utcnow()
        doc = {
            'accountId': account_id,
            'botId': bot_id,
            'status': status or 'active',
            'question': question,
            'answer': answer,
            'created_at': now,
            'updated_at': now,
        }
        result = self.collection.insert_one(doc)
        # return sanitized dict
        return {
            'id': str(result.inserted_id),
            'status': doc['status'],
            'question': doc['question'],
            'answer': doc['answer'],
            'created_at': doc['created_at'].isoformat() if doc.get('created_at') else None,
            'updated_at': doc['updated_at'].isoformat() if doc.get('updated_at') else None,
        }

    def list_training_by_bot(self, account_id, bot_id, limit=None, skip=0, sort='newest'):
        query = {'accountId': account_id, 'botId': bot_id}
        direction = -1 if (sort in (None, 'newest', 'desc', '-1')) else 1
        cursor = self.collection.find(query).sort('updated_at', direction)
        # skip may be '0' or integer; handle properly
        if skip is not None and skip != '':
            try:
                s = int(skip)
                if s > 0:
                    cursor = cursor.skip(s)
            except Exception:
                pass

        if limit:
            try:
                cursor = cursor.limit(int(limit))
            except Exception:
                pass

        items = []
        for item in cursor:
            item['id'] = str(item.get('_id'))
            items.append({
                'id': item['id'],
                'status': item.get('status'),
                'question': item.get('question'),
                'answer': item.get('answer'),
                'created_at': item.get('created_at').isoformat() if item.get('created_at') else None,
                'updated_at': item.get('updated_at').isoformat() if item.get('updated_at') else None,
            })
        return items

    def get_training(self, account_id, training_id):
        try:
            _id = ObjectId(training_id)
        except Exception:
            return None
        doc = self.collection.find_one({'_id': _id, 'accountId': account_id})
        if not doc:
            return None
        return {
            'id': str(doc.get('_id')),
            'status': doc.get('status'),
            'question': doc.get('question'),
            'answer': doc.get('answer'),
            'created_at': doc.get('created_at').isoformat() if doc.get('created_at') else None,
            'updated_at': doc.get('updated_at').isoformat() if doc.get('updated_at') else None,
        }

    def update_training(self, account_id, training_id, patch):
        try:
            _id = ObjectId(training_id)
        except Exception:
            return None
        update = {k: v for k, v in patch.items() if k in ['status', 'question', 'answer']}
        update['updated_at'] = datetime.utcnow()
        result = self.collection.find_one_and_update(
            {'_id': _id, 'accountId': account_id},
            {'$set': update},
            return_document=True
        )
        if not result:
            return None
        return {
            'id': str(result.get('_id')),
            'status': result.get('status'),
            'question': result.get('question'),
            'answer': result.get('answer'),
            'created_at': result.get('created_at').isoformat() if result.get('created_at') else None,
            'updated_at': result.get('updated_at').isoformat() if result.get('updated_at') else None,
        }

    def delete_training(self, account_id, training_id):
        try:
            _id = ObjectId(training_id)
        except Exception:
            return False
        result = self.collection.delete_one({'_id': _id, 'accountId': account_id})
        return result.deleted_count == 1

    def delete_training_bulk(self, account_id, bot_id, list_ids):
        # list_ids: array of string ids
        try:
            object_ids = [ObjectId(i) for i in list_ids]
        except Exception:
            object_ids = []
        if not object_ids:
            return 0
        result = self.collection.delete_many({'_id': {'$in': object_ids}, 'accountId': account_id, 'botId': bot_id})
        return result.deleted_count

    def count_training_by_bot(self, account_id, bot_id, q=None):
        query = {'accountId': account_id, 'botId': bot_id}
        # Optionally implement search (q) later
        return self.collection.count_documents(query)

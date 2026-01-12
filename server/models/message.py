import logging
from datetime import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId

logger = logging.getLogger(__name__)

class MessageModel:
    def __init__(self, mongo_client):
        self.client = mongo_client
        self.db = mongo_client.test_db
        self.collection = self.db.messages
        self._create_indexes()

    def _create_indexes(self):
        # Indexes to support common queries (legacy)
        self.collection.create_index([('platform', 1), ('oa_id', 1), ('sender_id', 1), ('created_at', -1)])
        self.collection.create_index([('platform', 1), ('oa_id', 1), ('sender_id', 1)])
        # New indexes for conversation_id
        self.collection.create_index([('conversation_id', 1), ('created_at', -1)])
        self.collection.create_index([('conversation_id', 1)])

    def _serialize(self, doc):
        """Return a fully JSON-serializable representation of a message document.
        This normalizes ObjectId -> str, datetimes -> ISO strings, and recursively
        handles nested dicts and lists (e.g., metadata, sender_profile).
        """
        if not doc:
            return None
        out = dict(doc)

        def _normalize(value):
            try:
                # ObjectId -> string
                if isinstance(value, ObjectId):
                    return str(value)

                # datetime -> ISO string
                if hasattr(value, 'isoformat') and callable(getattr(value, 'isoformat')):
                    try:
                        return value.isoformat() + 'Z'
                    except Exception:
                        return str(value)

                # dict -> normalize items
                if isinstance(value, dict):
                    return {k: _normalize(v) for k, v in value.items()}

                # list/tuple -> normalize elements
                if isinstance(value, (list, tuple)):
                    return [_normalize(v) for v in value]

                # fallback: leave as-is
                return value
            except Exception:
                # Best-effort fallback
                try:
                    return str(value)
                except Exception:
                    return None

        for k, v in list(out.items()):
            out[k] = _normalize(v)

        return out

    def add_message(self, platform, oa_id, sender_id, direction, text=None, metadata=None, sender_profile=None, is_read=False, conversation_id=None):
        """
        Add a message. 
        - conversation_id: Optional ObjectId string of conversation. If provided, this is the new way.
        - sender_profile: Optional dict like {name, avatar} describing the sender.
        """
        now = datetime.utcnow()
        doc = {
            'platform': platform,
            'oa_id': oa_id,
            'sender_id': sender_id,  # Keep for backward compatibility
            'direction': direction,  # 'in' or 'out'
            'text': text,
            'metadata': metadata or {},
            'sender_profile': sender_profile or {},
            'is_read': bool(is_read),
            'created_at': now,
            'updated_at': now,
        }
        
        # Add conversation_id if provided (new structure)
        if conversation_id:
            try:
                # Handle both string and ObjectId formats
                if isinstance(conversation_id, ObjectId):
                    doc['conversation_id'] = conversation_id
                else:
                    doc['conversation_id'] = ObjectId(conversation_id)
            except Exception as e:
                logger.warning(f"Invalid conversation_id format: {conversation_id}, error: {e}")
        
        res = self.collection.insert_one(doc)
        doc['_id'] = res.inserted_id
        try:
            logger.info(f"Added message: platform={platform}, oa_id={oa_id}, sender_id={sender_id}, direction={direction}, conversation_id={conversation_id}, _id={doc['_id']}")
        except Exception:
            pass
        return self._serialize(doc)

    def find_recent_similar(self, platform=None, oa_id=None, sender_id=None, conversation_id=None, direction=None, text=None, within_seconds=10):
        """
        Find a recent similar message that matches the provided criteria within a time window.
        Returns a serialized message document or None.
        """
        from datetime import datetime, timedelta
        cutoff = datetime.utcnow() - timedelta(seconds=int(within_seconds or 10))
        q = {}
        # Prefer conversation_id if provided
        if conversation_id:
            try:
                from bson.objectid import ObjectId
                q['conversation_id'] = ObjectId(conversation_id) if not isinstance(conversation_id, ObjectId) else conversation_id
            except Exception:
                q['conversation_id'] = conversation_id
        else:
            if platform is not None:
                q['platform'] = platform
            if oa_id is not None:
                q['oa_id'] = oa_id
            if sender_id is not None:
                q['sender_id'] = sender_id
        if direction is not None:
            q['direction'] = direction
        if text is not None:
            q['text'] = text
        q['created_at'] = {'$gte': cutoff}
        doc = self.collection.find_one(q, sort=[('created_at', -1)])
        return self._serialize(doc) if doc else None

    def get_messages(self, platform, oa_id, sender_id, limit=50, skip=0, conversation_id=None):
        """
        Get messages. If conversation_id is provided, use it; otherwise use legacy sender_id.
        """
        if conversation_id:
            try:
                # Handle both string and ObjectId formats
                if isinstance(conversation_id, ObjectId):
                    q = {'conversation_id': conversation_id}
                else:
                    q = {'conversation_id': ObjectId(conversation_id)}
            except Exception:
                # Fallback: try as string
                q = {'conversation_id': conversation_id}
        else:
            q = {'platform': platform, 'oa_id': oa_id, 'sender_id': sender_id}
        cursor = self.collection.find(q).sort('created_at', 1).skip(int(skip)).limit(int(limit))
        docs = [self._serialize(d) for d in list(cursor)]
        return docs

    def mark_read(self, platform, oa_id, sender_id, conversation_id=None):
        """
        Mark messages as read. If conversation_id is provided, use it; otherwise use legacy sender_id.
        """
        if conversation_id:
            try:
                # Handle both string and ObjectId formats
                if isinstance(conversation_id, ObjectId):
                    q = {'conversation_id': conversation_id, 'direction': 'in', 'is_read': False}
                else:
                    q = {'conversation_id': ObjectId(conversation_id), 'direction': 'in', 'is_read': False}
            except Exception:
                # Fallback: try as string
                q = {'conversation_id': conversation_id, 'direction': 'in', 'is_read': False}
        else:
            q = {'platform': platform, 'oa_id': oa_id, 'sender_id': sender_id, 'direction': 'in', 'is_read': False}
        res = self.collection.update_many(q, {'$set': {'is_read': True, 'updated_at': datetime.utcnow()}})
        return res.modified_count

    def get_conversations_for_oa(self, platform, oa_id, limit=100):
        # Aggregate last message by sender_id
        pipeline = [
            {'$match': {'platform': platform, 'oa_id': oa_id}},
            {'$sort': {'created_at': -1}},
            {'$group': {
                '_id': '$sender_id',
                'lastMessage': {'$first': '$text'},
                'lastTime': {'$first': '$created_at'},
                'lastDirection': {'$first': '$direction'},
                'senderProfile': {'$first': '$sender_profile'},
                'unreadCount': {'$sum': {'$cond': [{'$and': [{'$eq': ['$direction', 'in']}, {'$eq': ['$is_read', False]}]}, 1, 0]}},
            }},
            {'$sort': {'lastTime': -1}},
            {'$limit': int(limit)}
        ]
        docs = list(self.collection.aggregate(pipeline))
        out = []
        for d in docs:
            sp = d.get('senderProfile') or {}
            out.append({
                'sender_id': d.get('_id'),
                'lastMessage': d.get('lastMessage'),
                'time': (d.get('lastTime').isoformat() + 'Z') if d.get('lastTime') else None,
                'lastDirection': d.get('lastDirection'),
                'unreadCount': int(d.get('unreadCount') or 0),
                'sender_profile': sp,
            })
        return out

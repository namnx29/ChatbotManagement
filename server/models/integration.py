from datetime import datetime, timedelta
from pymongo import MongoClient
from bson.objectid import ObjectId

class IntegrationModel:
    def __init__(self, mongo_client):
        self.client = mongo_client
        self.db = mongo_client.test_db
        self.collection = self.db.integrations
        self._create_indexes()

    def _create_indexes(self):
        self.collection.create_index([('accountId', 1)])
        # index to help querying by chatbot and platform
        self.collection.create_index([('accountId', 1), ('chatbotId', 1), ('platform', 1)])
        self.collection.create_index([('platform', 1), ('oa_id', 1)], unique=True)
        self.collection.create_index('expires_at')

    def _serialize(self, doc):
        if not doc:
            return None
        out = dict(doc)
        # Convert ObjectId to string
        if out.get('_id') is not None:
            try:
                out['_id'] = str(out['_id'])
            except Exception:
                pass
        # Convert datetimes to ISO strings (as UTC 'Z')
        from datetime import datetime as _dt
        for k, v in list(out.items()):
            try:
                if isinstance(v, _dt):
                    # Store as UTC ISO string with 'Z' to make parsing consistent on client
                    out[k] = v.replace(microsecond=0).isoformat() + 'Z'
                elif hasattr(v, 'isoformat') and callable(getattr(v, 'isoformat')):
                    # Fallback for other date-like objects
                    out[k] = v.isoformat()
            except Exception:
                pass
        return out

    def create_or_update(self, account_id, platform, oa_id, access_token, refresh_token=None, expires_in=None, meta=None, is_active=True, name=None, avatar_url=None, chatbot_id=None):
        expires_at = None
        if expires_in:
            expires_at = datetime.utcnow() + timedelta(seconds=int(expires_in))
        now = datetime.utcnow()
        # Don't include `created_at` or `connected_at` in the $set payload to avoid conflict with $setOnInsert
        doc = {
            'accountId': account_id,
            'platform': platform,
            'oa_id': oa_id,
            'access_token': access_token,
            'refresh_token': refresh_token,
            'expires_at': expires_at,
            'meta': meta or {},
            'is_active': bool(is_active),
            'name': name,
            'oa_name': name,
            'avatar_url': avatar_url,
            'chatbotId': chatbot_id,
            'updated_at': now,
        }
        # On insert, set created_at and connected_at
        self.collection.update_one(
            {'platform': platform, 'oa_id': oa_id},
            {'$set': doc, '$setOnInsert': {'created_at': now, 'connected_at': now}},
            upsert=True
        )
        # Return the canonical doc (serialize) that was upserted
        res_doc = self.collection.find_one({'platform': platform, 'oa_id': oa_id})
        # If chatbot_id provided, ensure created doc has chatbotId set (some upserts may have overwritten)
        if chatbot_id and res_doc and res_doc.get('chatbotId') != chatbot_id:
            # Try to ensure chatbotId is consistent for this integration for this account
            self.collection.update_one({'_id': res_doc.get('_id')}, {'$set': {'chatbotId': chatbot_id, 'updated_at': datetime.utcnow()}})
            res_doc = self.collection.find_one({'_id': res_doc.get('_id')})
        return self._serialize(res_doc)

    def find_by_platform_and_oa(self, platform, oa_id):
        res = self.collection.find_one({'platform': platform, 'oa_id': oa_id})
        return self._serialize(res)

    def find_by_account(self, account_id, platform=None, chatbot_id=None):
        q = {'accountId': account_id}
        if platform:
            q['platform'] = platform
        if chatbot_id is not None:
            q['chatbotId'] = chatbot_id
        docs = list(self.collection.find(q))
        return [self._serialize(d) for d in docs]

    def update_tokens(self, integration_id, access_token=None, refresh_token=None, expires_in=None):
        update = {'updated_at': datetime.utcnow()}
        if access_token is not None:
            update['access_token'] = access_token
        if refresh_token is not None:
            update['refresh_token'] = refresh_token
        if expires_in is not None:
            update['expires_at'] = datetime.utcnow() + timedelta(seconds=int(expires_in))
        res = self.collection.find_one_and_update({'_id': ObjectId(integration_id)}, {'$set': update}, return_document=True)
        return self._serialize(res)

    def integrations_needing_refresh(self, cutoff_datetime):
        # Return integrations whose expires_at is not None and <= cutoff
        docs = list(self.collection.find({'expires_at': {'$lte': cutoff_datetime}, 'is_active': True}))
        return [self._serialize(d) for d in docs]

    def set_active(self, integration_id, active: bool):
        res = self.collection.find_one_and_update({'_id': ObjectId(integration_id)}, {'$set': {'is_active': bool(active), 'updated_at': datetime.utcnow()}}, return_document=True)
        return self._serialize(res)

    def find_by_id(self, integration_id):
        try:
            res = self.collection.find_one({'_id': ObjectId(integration_id)})
            return self._serialize(res)
        except Exception:
            return None

    def delete_integration(self, integration_id):
        try:
            res = self.collection.find_one_and_delete({'_id': ObjectId(integration_id)})
            return self._serialize(res)
        except Exception:
            return None

    def transfer_integration(self, integration_id, to_chatbot_id, access_token=None, refresh_token=None, expires_in=None, name=None, avatar_url=None, meta=None):
        # Move an existing integration to a new chatbotId and update tokens/meta
        update = {'updated_at': datetime.utcnow(), 'chatbotId': to_chatbot_id}
        if access_token is not None:
            update['access_token'] = access_token
        if refresh_token is not None:
            update['refresh_token'] = refresh_token
        if expires_in is not None:
            update['expires_at'] = datetime.utcnow() + timedelta(seconds=int(expires_in))
        if name is not None:
            update['name'] = name
            update['oa_name'] = name
        if avatar_url is not None:
            update['avatar_url'] = avatar_url
        if meta is not None:
            update['meta'] = meta
        res = self.collection.find_one_and_update({'_id': ObjectId(integration_id)}, {'$set': update}, return_document=True)
        return self._serialize(res)

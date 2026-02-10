import logging
from datetime import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId

logger = logging.getLogger(__name__)

class CustomerModel:
    def __init__(self, mongo_client):
        self.client = mongo_client
        self.db = mongo_client.test_db
        self.collection = self.db.customers
        self._create_indexes()

    def _create_indexes(self):
        # Unique index on platform_specific_id (which is the _id)
        # This ensures one customer per platform-specific ID
        self.collection.create_index([('platform', 1), ('platform_specific_id', 1)], unique=True)
        self.collection.create_index([('platform', 1)])

    def _serialize(self, doc):
        if not doc:
            return None
        out = dict(doc)
        if out.get('_id') is not None:
            try:
                out['_id'] = str(out['_id'])
            except Exception:
                pass
        for k, v in list(out.items()):
            try:
                if hasattr(v, 'isoformat') and callable(getattr(v, 'isoformat')):
                    out[k] = v.isoformat() + 'Z'
            except Exception:
                pass
        return out

    def upsert_customer(self, platform, platform_specific_id, name=None, avatar=None, phone=None):
        """
        Upsert a customer. platform_specific_id becomes the _id.
        Returns the customer document.
        """
        now = datetime.utcnow()
        
        # Use platform_specific_id as _id for easy lookup
        customer_id = f"{platform}:{platform_specific_id}"
        
        update_doc = {
            'platform': platform,
            'platform_specific_id': platform_specific_id,
            'updated_at': now,
        }
        logger.info(f"Upserting customer with phone: {phone}")
        
        if name is not None:
            update_doc['name'] = name
        if avatar is not None:
            update_doc['avatar'] = avatar
        if phone is not None:
            update_doc['phone'] = phone
        
        # Upsert: update if exists, insert if not
        result = self.collection.find_one_and_update(
            {'_id': customer_id},
            {
                '$set': update_doc,
                '$setOnInsert': {
                    'created_at': now,
                }
            },
            upsert=True,
            return_document=True
        )
        
        return self._serialize(result)

    def find_by_id(self, customer_id):
        """Find customer by _id (which is platform:platform_specific_id)"""
        doc = self.collection.find_one({'_id': customer_id})
        return self._serialize(doc)

    def find_by_platform_and_id(self, platform, platform_specific_id):
        """Find customer by platform and platform_specific_id"""
        customer_id = f"{platform}:{platform_specific_id}"
        return self.find_by_id(customer_id)


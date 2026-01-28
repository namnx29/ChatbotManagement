# OrganizationId Implementation - Step-by-Step Guide

## Overview

This guide provides step-by-step implementation instructions to add `organizationId` support to the system. The approach uses dual-write and query fallback for zero-downtime deployment.

---

## Phase 1: Code Changes (Deploy First)

### Step 1.1: Update User Model

**File:** `server/models/user.py`

**Changes needed:**
1. Add `organizationId` to admin account creation
2. Add `organizationId` copy for staff account creation
3. Add method to get user's organization
4. Create index on `organizationId`

#### Code snippets:

```python
# In _create_indexes():
def _create_indexes(self):
    """Create necessary indexes on the users collection"""
    self.collection.create_index('email', unique=True, sparse=True)
    self.collection.create_index('accountId', unique=True)
    self.collection.create_index('organizationId')  # NEW
    self.collection.create_index('verification_token', sparse=True)

# In create_user() - for admin accounts:
def create_user(self, email, password, name=None, phone=None, role='admin', parent_account_id=None, created_by=None):
    # ... existing code ...
    account_id = str(uuid.uuid4())
    organization_id = str(uuid.uuid4()) if role == 'admin' else None  # NEW
    
    user_data = {
        # ... existing fields ...
        'accountId': account_id,
        'organizationId': organization_id,  # NEW
        'role': role,
        # ... rest of fields ...
    }

# In create_staff() - for staff accounts:
def create_staff(self, parent_account_id, username, name, phone_number=None, password=None):
    # ... existing validation ...
    
    # Get parent's organization
    parent = self.collection.find_one({'accountId': parent_account_id, 'role': 'admin'})
    if not parent:
        raise ValueError('Unauthorized: Admin account required')
    
    parent_organization_id = parent.get('organizationId')  # NEW
    
    account_id = str(uuid.uuid4())
    staff_data = {
        'accountId': account_id,
        'organizationId': parent_organization_id,  # NEW - Copy from parent
        'username': username,
        'name': name,
        # ... rest of fields ...
    }
    # ... rest of method ...

# NEW method:
def get_user_organization_id(self, account_id):
    """Get organization ID for a user account"""
    user = self.collection.find_one({'accountId': account_id})
    if not user:
        return None
    return user.get('organizationId')
```

### Step 1.2: Update Conversation Model

**File:** `server/models/conversation.py`

**Changes needed:**
1. Add `organizationId` field to upsert method
2. Add `organizationId` to queries with fallback
3. Update indexes
4. Add new query methods

#### Code snippets:

```python
# In _create_indexes():
def _create_indexes(self):
    # ... existing indexes ...
    
    # NEW indexes for organizationId (primary)
    try:
        self.collection.create_index(
            [('organizationId', 1), ('oa_id', 1), ('customer_id', 1)], 
            unique=True, 
            sparse=True
        )
    except Exception as e:
        logger.warning(f"Error creating organizationId unique index: {e}")
    
    # NEW query indexes
    try:
        self.collection.create_index([('organizationId', 1), ('oa_id', 1), ('updated_at', -1)])
    except Exception as e:
        logger.warning(f"Error creating organizationId+oa_id index: {e}")
    
    try:
        self.collection.create_index([('organizationId', 1), ('customer_id', 1), ('updated_at', -1)])
    except Exception as e:
        logger.warning(f"Error creating organizationId+customer_id index: {e}")
    
    # ... keep existing indexes for backward compatibility ...

# Update upsert_conversation():
def upsert_conversation(self, oa_id, customer_id, last_message_text=None, 
                       last_message_created_at=None, direction='in', customer_info=None, 
                       increment_unread=False, chatbot_id=None, chatbot_info=None, 
                       account_id=None, organization_id=None):  # NEW param
    """
    Upsert a conversation. 
    - organization_id: REQUIRED (NEW) - the organization that owns this conversation
    - account_id: KEEP for audit trail
    """
    now = datetime.utcnow()
    
    update_doc = {
        'oa_id': oa_id,
        'customer_id': customer_id,
        'updated_at': now,
    }
    
    # Add both organizationId and accountId
    if organization_id:
        update_doc['organizationId'] = organization_id  # NEW
    if account_id:
        update_doc['accountId'] = account_id  # KEEP for audit
    
    # ... rest of existing code ...
    
    # Build query - try organizationId first (new way), fallback to accountId
    query = {'oa_id': oa_id, 'customer_id': customer_id}
    if organization_id:
        query['organizationId'] = organization_id  # NEW
    elif account_id:
        query['accountId'] = account_id  # FALLBACK for backward compat
    
    # ... rest of method ...

# Update find_by_oa_and_customer():
def find_by_oa_and_customer(self, oa_id, customer_id, account_id=None, organization_id=None):
    """Find conversation by oa_id and customer_id
    
    - organization_id: NEW preferred parameter for organization-wide queries
    - account_id: DEPRECATED but kept for backward compatibility
    """
    query = {'oa_id': oa_id, 'customer_id': customer_id}
    
    # Prefer organizationId
    if organization_id:
        query['organizationId'] = organization_id
    elif account_id:
        query['accountId'] = account_id
    
    doc = self.collection.find_one(query)
    return self._serialize(doc)

# NEW method:
def list_by_organization(self, organization_id, skip=0, limit=50, oa_id=None):
    """List conversations for an organization
    
    Args:
        organization_id (str): Organization ID
        skip (int): Pagination skip
        limit (int): Pagination limit
        oa_id (str): Optional filter by oa_id
    
    Returns:
        list: Conversation documents
    """
    query = {'organizationId': organization_id}
    if oa_id:
        query['oa_id'] = oa_id
    
    cursor = self.collection.find(query).sort('updated_at', -1).skip(skip).limit(limit)
    return [self._serialize(doc) for doc in cursor]
```

### Step 1.3: Update Message Model

**File:** `server/models/message.py`

**Changes needed:**
1. Add `organizationId` to add_message method
2. Add query methods for organization
3. Update indexes

#### Code snippets:

```python
# In _create_indexes():
def _create_indexes(self):
    # ... existing indexes ...
    
    # NEW indexes for organizationId
    try:
        self.collection.create_index([('organizationId', 1), ('platform', 1), ('oa_id', 1), ('created_at', -1)])
    except Exception as e:
        logger.warning(f"Error creating organizationId index: {e}")
    
    try:
        self.collection.create_index([('organizationId', 1), ('conversation_id', 1), ('created_at', -1)])
    except Exception as e:
        logger.warning(f"Error creating organizationId+conversation_id index: {e}")
    
    # ... keep existing indexes ...

# Update add_message():
def add_message(self, platform, oa_id, sender_id, direction, text=None, metadata=None, 
                sender_profile=None, is_read=False, conversation_id=None, 
                account_id=None, organization_id=None):  # NEW param
    """
    Add a message.
    - organization_id: NEW - the organization that owns this message
    - account_id: KEEP for audit trail
    """
    now = datetime.utcnow()
    doc = {
        'platform': platform,
        'oa_id': oa_id,
        'sender_id': sender_id,
        'direction': direction,
        'text': text,
        'metadata': metadata or {},
        'sender_profile': sender_profile or {},
        'is_read': bool(is_read),
        'created_at': now,
        'updated_at': now,
    }
    
    # Add both organizationId and accountId
    if organization_id:
        doc['organizationId'] = organization_id  # NEW
    if account_id:
        doc['accountId'] = account_id  # KEEP for audit
    
    # ... rest of method ...

# NEW method:
def get_by_organization_and_conversation(self, organization_id, conversation_id, 
                                         skip=0, limit=50):
    """Get messages for an organization's conversation"""
    query = {
        'organizationId': organization_id,
        'conversation_id': ObjectId(conversation_id) if isinstance(conversation_id, str) else conversation_id
    }
    
    cursor = self.collection.find(query).sort('created_at', -1).skip(skip).limit(limit)
    return [self._serialize(doc) for doc in cursor]

# NEW method:
def mark_as_read_by_organization(self, organization_id, conversation_id):
    """Mark all messages in conversation as read for an organization"""
    result = self.collection.update_many(
        {
            'organizationId': organization_id,
            'conversation_id': ObjectId(conversation_id) if isinstance(conversation_id, str) else conversation_id,
            'is_read': False
        },
        {'$set': {'is_read': True, 'updated_at': datetime.utcnow()}}
    )
    return result.modified_count
```

### Step 1.4: Update Integration Model

**File:** `server/models/integration.py`

**Changes needed:**
1. Add `organizationId` to create_or_update method
2. Add query methods for organization
3. Update indexes

#### Code snippets:

```python
# In _create_indexes():
def _create_indexes(self):
    # NEW indexes for organizationId
    self.collection.create_index([('organizationId', 1)])
    self.collection.create_index([('organizationId', 1), ('chatbotId', 1), ('platform', 1)])
    self.collection.create_index([('organizationId', 1), ('platform', 1)])
    
    # KEEP for backward compatibility
    self.collection.create_index([('accountId', 1)])
    self.collection.create_index([('accountId', 1), ('chatbotId', 1), ('platform', 1)])
    self.collection.create_index([('platform', 1), ('oa_id', 1)], unique=False)  # Changed: no longer unique
    self.collection.create_index('expires_at')

# Update create_or_update():
def create_or_update(self, account_id, platform, oa_id, access_token, refresh_token=None, 
                     expires_in=None, meta=None, is_active=True, name=None, 
                     avatar_url=None, chatbot_id=None, organization_id=None):  # NEW param
    """
    Create or update integration.
    - organization_id: NEW - the organization that owns this integration
    - account_id: KEEP for audit trail
    """
    expires_at = None
    if expires_in:
        expires_at = datetime.utcnow() + timedelta(seconds=int(expires_in))
    now = datetime.utcnow()
    
    doc = {
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
    
    # Add both organizationId and accountId
    if organization_id:
        doc['organizationId'] = organization_id  # NEW
    if account_id:
        doc['accountId'] = account_id  # KEEP for audit
    
    # Query with both for backward compatibility
    query = {'platform': platform, 'oa_id': oa_id}
    
    self.collection.update_one(
        query,
        {'$set': doc, '$setOnInsert': {'created_at': now, 'connected_at': now}},
        upsert=True
    )
    
    res_doc = self.collection.find_one(query)
    return self._serialize(res_doc)

# NEW method:
def find_by_organization(self, organization_id, platform=None, chatbot_id=None):
    """Find integrations by organization"""
    query = {'organizationId': organization_id}
    if platform:
        query['platform'] = platform
    if chatbot_id is not None:
        query['chatbotId'] = chatbot_id
    
    docs = list(self.collection.find(query))
    return [self._serialize(d) for d in docs]

# Update find_by_account() - add fallback:
def find_by_account(self, account_id, platform=None, chatbot_id=None):
    """Find integrations by account (DEPRECATED - use find_by_organization)"""
    q = {'accountId': account_id}  # Legacy query
    if platform:
        q['platform'] = platform
    if chatbot_id is not None:
        q['chatbotId'] = chatbot_id
    docs = list(self.collection.find(q))
    return [self._serialize(d) for d in docs]
```

### Step 1.5: Create Authentication Helper

**File:** `server/utils/request_helpers.py` (or update existing)

```python
"""
Request helper utilities for extracting user context from requests
"""

def get_organization_id_from_request(account_id, user_model):
    """
    Get the organization ID for an authenticated user
    
    Args:
        account_id (str): The user's account ID
        user_model (UserModel): The user model instance
    
    Returns:
        str: The organization ID, or None if user not found
    
    Raises:
        ValueError: If user doesn't have an organization ID
    """
    organization_id = user_model.get_user_organization_id(account_id)
    
    if not organization_id:
        raise ValueError(f'User {account_id} does not have an organization ID')
    
    return organization_id
```

### Step 1.6: Update Route Handlers - Facebook

**File:** `server/routes/facebook.py`

**Key changes:**
1. Import helper
2. Get organization from user
3. Pass to model methods

#### Changes in specific locations:

```python
# At top of file, add imports:
from utils.request_helpers import get_organization_id_from_request

# In the init_facebook_routes function, where integrations are used:

# OLD (around line 215):
# existing_on_chatbot_list = integration_model.find_by_account(account_id, platform='facebook', chatbot_id=chatbot_id)

# NEW:
organization_id = get_organization_id_from_request(account_id, user_model)
existing_on_chatbot_list = integration_model.find_by_organization(
    organization_id, 
    platform='facebook', 
    chatbot_id=chatbot_id
)

# OLD (around line 265):
# account_id=account_id,

# NEW:
account_id=account_id,
organization_id=organization_id,

# OLD (around line 488):
# account_id=integration.get('accountId'),

# NEW:
account_id=account_id,
organization_id=organization_id,

# Similarly for upsert_conversation:
# OLD: account_id=integration.get('accountId')
# NEW: account_id=account_id, organization_id=organization_id
```

### Step 1.7: Update Route Handlers - Zalo

**File:** `server/routes/zalo.py`

Similar changes as Facebook:
1. Import helper at top
2. Get organization from user
3. Pass to model methods

### Step 1.8: Update Route Handlers - Integrations

**File:** `server/routes/integrations.py`

```python
# In list_integrations():
# OLD:
# items = model.find_by_account(account_id, ...)

# NEW:
organization_id = get_organization_id_from_request(account_id, user_model)
items = model.find_by_organization(organization_id, ...)
```

### Step 1.9: Update Chatbot Routes

**File:** `server/routes/chatbot.py`

Assume chatbot model has similar methods, update to use organization_id:

```python
# In list_chatbots():
organization_id = get_organization_id_from_request(account_id, user_model)
bots = chatbot_model.list_chatbots_by_organization(organization_id)
```

---

## Phase 2: Data Migration

### Step 2.1: Create Migration Script

**File:** `server/migrations/add_organization_id.py`

```python
"""
Migration script to add organizationId to all collections

Run this AFTER deploying code changes:
    python migrations/add_organization_id.py
"""

import uuid
from pymongo import MongoClient
from config import Config
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_organization_ids(mongo_client):
    """Add organizationId to all collections"""
    db = mongo_client.test_db
    
    # ==================== Users ====================
    logger.info("Migrating users collection...")
    
    # Admin users: create organizationId
    admin_org_map = {}  # Map of admin account_id -> organization_id
    
    admin_users = list(db.users.find({'role': 'admin', 'organizationId': {'$exists': False}}))
    logger.info(f"Found {len(admin_users)} admin users without organizationId")
    
    for admin in admin_users:
        org_id = str(uuid.uuid4())
        admin_org_map[admin['accountId']] = org_id
        
        db.users.update_one(
            {'_id': admin['_id']},
            {'$set': {'organizationId': org_id}}
        )
        logger.info(f"Added organizationId {org_id} to admin {admin['accountId']}")
    
    # Staff users: copy from parent admin
    staff_users = list(db.users.find({'role': 'staff', 'organizationId': {'$exists': False}}))
    logger.info(f"Found {len(staff_users)} staff users without organizationId")
    
    for staff in staff_users:
        parent_id = staff.get('parent_account_id')
        if not parent_id:
            logger.warning(f"Staff user {staff['accountId']} has no parent_account_id, skipping")
            continue
        
        # Get parent's organization
        parent = db.users.find_one({'accountId': parent_id})
        if not parent:
            logger.warning(f"Parent {parent_id} for staff {staff['accountId']} not found")
            continue
        
        org_id = parent.get('organizationId')
        if not org_id:
            logger.warning(f"Parent {parent_id} has no organizationId")
            continue
        
        db.users.update_one(
            {'_id': staff['_id']},
            {'$set': {'organizationId': org_id}}
        )
        logger.info(f"Added organizationId {org_id} to staff {staff['accountId']}")
    
    # ==================== Conversations ====================
    logger.info("Migrating conversations collection...")
    
    conversations = list(db.conversations.find({'organizationId': {'$exists': False}}))
    logger.info(f"Found {len(conversations)} conversations without organizationId")
    
    for conv in conversations:
        account_id = conv.get('accountId')
        if not account_id:
            logger.warning(f"Conversation {conv['_id']} has no accountId, skipping")
            continue
        
        # Get account's organization
        user = db.users.find_one({'accountId': account_id})
        if not user:
            logger.warning(f"User {account_id} for conversation {conv['_id']} not found")
            continue
        
        org_id = user.get('organizationId')
        if not org_id:
            logger.warning(f"User {account_id} has no organizationId")
            continue
        
        db.conversations.update_one(
            {'_id': conv['_id']},
            {'$set': {'organizationId': org_id}}
        )
    
    logger.info(f"Migrated conversations, total processed: {len(conversations)}")
    
    # ==================== Messages ====================
    logger.info("Migrating messages collection...")
    
    messages = list(db.messages.find({'organizationId': {'$exists': False}}))
    logger.info(f"Found {len(messages)} messages without organizationId")
    
    for msg in messages:
        account_id = msg.get('accountId')
        if not account_id:
            logger.warning(f"Message {msg['_id']} has no accountId, skipping")
            continue
        
        # Get account's organization
        user = db.users.find_one({'accountId': account_id})
        if not user:
            logger.warning(f"User {account_id} for message {msg['_id']} not found")
            continue
        
        org_id = user.get('organizationId')
        if not org_id:
            logger.warning(f"User {account_id} has no organizationId")
            continue
        
        db.messages.update_one(
            {'_id': msg['_id']},
            {'$set': {'organizationId': org_id}}
        )
    
    logger.info(f"Migrated messages, total processed: {len(messages)}")
    
    # ==================== Integrations ====================
    logger.info("Migrating integrations collection...")
    
    integrations = list(db.integrations.find({'organizationId': {'$exists': False}}))
    logger.info(f"Found {len(integrations)} integrations without organizationId")
    
    for integ in integrations:
        account_id = integ.get('accountId')
        if not account_id:
            logger.warning(f"Integration {integ['_id']} has no accountId, skipping")
            continue
        
        # Get account's organization
        user = db.users.find_one({'accountId': account_id})
        if not user:
            logger.warning(f"User {account_id} for integration {integ['_id']} not found")
            continue
        
        org_id = user.get('organizationId')
        if not org_id:
            logger.warning(f"User {account_id} has no organizationId")
            continue
        
        db.integrations.update_one(
            {'_id': integ['_id']},
            {'$set': {'organizationId': org_id}}
        )
    
    logger.info(f"Migrated integrations, total processed: {len(integrations)}")
    
    # ==================== Chatbots ====================
    logger.info("Migrating chatbots collection...")
    
    chatbots = list(db.chatbots.find({'organizationId': {'$exists': False}}))
    logger.info(f"Found {len(chatbots)} chatbots without organizationId")
    
    for bot in chatbots:
        account_id = bot.get('accountId')
        if not account_id:
            logger.warning(f"Chatbot {bot['_id']} has no accountId, skipping")
            continue
        
        # Get account's organization
        user = db.users.find_one({'accountId': account_id})
        if not user:
            logger.warning(f"User {account_id} for chatbot {bot['_id']} not found")
            continue
        
        org_id = user.get('organizationId')
        if not org_id:
            logger.warning(f"User {account_id} has no organizationId")
            continue
        
        db.chatbots.update_one(
            {'_id': bot['_id']},
            {'$set': {'organizationId': org_id}}
        )
    
    logger.info(f"Migrated chatbots, total processed: {len(chatbots)}")
    
    logger.info("✅ Migration complete!")

if __name__ == '__main__':
    client = MongoClient(Config.MONGO_URI)
    migrate_organization_ids(client)
    client.close()
```

### Step 2.2: Run Migration

```bash
cd /home/nam/work/test-preny/server
python migrations/add_organization_id.py
```

---

## Phase 3: Verification & Rollout

### Step 3.1: Verification Queries

```bash
# Check admin users have organizationId
db.users.find({role: 'admin', organizationId: {$exists: false}}).count()
# Should return 0

# Check staff users have organizationId
db.users.find({role: 'staff', organizationId: {$exists: false}}).count()
# Should return 0

# Check all conversations have organizationId
db.conversations.find({organizationId: {$exists: false}}).count()
# Should return 0

# Check all messages have organizationId
db.messages.find({organizationId: {$exists: false}}).count()
# Should return 0

# Check organization isolation
# Admin account conversions should match staff conversations
admin_user = db.users.findOne({role: 'admin'})
staff_user = db.users.findOne({role: 'staff', parent_account_id: admin_user.accountId})

admin_convs = db.conversations.find({organizationId: admin_user.organizationId}).count()
staff_convs = db.conversations.find({organizationId: staff_user.organizationId}).count()

print("Admin conversations:", admin_convs)
print("Staff conversations:", staff_convs)
# Should be equal (same organization)
```

### Step 3.2: Testing Checklist

- [ ] Admin can see their conversations
- [ ] Staff can see admin's conversations (same organization)
- [ ] Different organizations isolated
- [ ] Sending messages works
- [ ] Mark read works
- [ ] Getting messages works
- [ ] Integration operations work
- [ ] Chatbot operations work

### Step 3.3: Monitoring

Monitor after rollout:
- Error logs for authorization failures
- Query performance (should be same or better with new indexes)
- Staff users accessing conversations successfully

---

## Phase 4: Cleanup & Optimization (Optional, 2-3 weeks later)

### Step 4.1: Remove Fallback Queries

Once confident all users have `organizationId`:

```python
# In conversation.py - simplify find_by_oa_and_customer():
def find_by_oa_and_customer(self, oa_id, customer_id, organization_id=None):
    """Find conversation by oa_id and customer_id"""
    query = {'oa_id': oa_id, 'customer_id': customer_id}
    if organization_id:
        query['organizationId'] = organization_id
    # No more fallback to accountId
    doc = self.collection.find_one(query)
    return self._serialize(doc)
```

### Step 4.2: Archive Old Indexes (Optional)

```python
# Drop old accountId-only indexes if desired:
db.conversations.dropIndex("accountId_1")
db.messages.dropIndex("accountId_1_platform_1_oa_id_1_created_at_-1")
# etc.

# Keep for audit trail:
# - Don't drop accountId field itself
# - Keep organization+accountId compound indexes if useful
```

---

## Rollback Plan

If something goes wrong:

1. **Code Rollback**: Revert code changes, queries will work with fallback
2. **Data Rollback**: Migration script is safe (only adds fields), no need to rollback

The dual-write approach makes this very safe - the system works both before and after migration.

---

## Testing the Implementation

### Test 1: Admin Access

```bash
# Login as admin
curl -X POST http://localhost/api/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'

# List conversations (should see admin's)
curl -X GET http://localhost/api/integrations/conversations/all \
  -H "X-Account-Id: <admin-account-id>"
```

### Test 2: Staff Access

```bash
# Login as staff
curl -X POST http://localhost/api/login \
  -H "Content-Type: application/json" \
  -d '{"email": "staff@example.com", "password": "password"}'

# List conversations (should see SAME conversations as admin)
curl -X GET http://localhost/api/integrations/conversations/all \
  -H "X-Account-Id: <staff-account-id>"

# Should return same data as admin!
```

### Test 3: Isolation

```bash
# Create two separate organizations
# Verify conversations don't appear across organizations
```

---

## Summary

This step-by-step guide provides everything needed to implement `organizationId`:

1. **Code changes** to add support (5-6 files)
2. **Migration script** to backfill data
3. **Verification steps** to ensure correctness
4. **Rollback plan** for safety
5. **Testing guidance** for validation

The dual-write approach ensures **zero-downtime deployment** and **easy rollback**.


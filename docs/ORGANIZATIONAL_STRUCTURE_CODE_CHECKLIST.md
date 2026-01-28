# OrganizationId Implementation - Code Checklist

## Quick Reference for All Changes

This document provides line-by-line guidance for implementing organizationId across the codebase.

---

## 1. User Model Changes

**File:** `server/models/user.py`

### 1.1 Add Index (Around line 35-40)

```python
def _create_indexes(self):
    """Create necessary indexes on the users collection"""        
    # Create new indexes
    self.collection.create_index('email', unique=True, sparse=True)
    self.collection.create_index('accountId', unique=True)
    self.collection.create_index('organizationId')  # ← ADD THIS LINE
    self.collection.create_index('verification_token', sparse=True)
```

### 1.2 Update create_user() method (Around line 50-100)

**Find this section:**
```python
def create_user(self, email, password, name=None, phone=None, role='admin', parent_account_id=None, created_by=None):
    """Create a new user in the database"""
    # ... validation code ...
    account_id = str(uuid.uuid4())
    
    user_data = {
        'email': email,
        'password': hashed_password,
        # ... other fields ...
        'accountId': account_id,
```

**Change to:**
```python
def create_user(self, email, password, name=None, phone=None, role='admin', parent_account_id=None, created_by=None):
    """Create a new user in the database"""
    # ... validation code ...
    account_id = str(uuid.uuid4())
    organization_id = str(uuid.uuid4()) if role == 'admin' else None  # ← ADD THIS
    
    user_data = {
        'email': email,
        'password': hashed_password,
        # ... other fields ...
        'accountId': account_id,
        'organizationId': organization_id,  # ← ADD THIS LINE
```

### 1.3 Update create_staff() method (Around line 430-500)

**Find this section:**
```python
def create_staff(self, parent_account_id, username, name, phone_number=None, password=None):
    # Verify parent account is admin
    parent = self.collection.find_one({'accountId': parent_account_id, 'role': 'admin'})
    if not parent:
        raise ValueError('Unauthorized: Admin account required')
    
    # ... validation ...
    account_id = str(uuid.uuid4())
    
    staff_data = {
        'accountId': account_id,
        'username': username,
        'name': name,
```

**Change to:**
```python
def create_staff(self, parent_account_id, username, name, phone_number=None, password=None):
    # Verify parent account is admin
    parent = self.collection.find_one({'accountId': parent_account_id, 'role': 'admin'})
    if not parent:
        raise ValueError('Unauthorized: Admin account required')
    
    parent_organization_id = parent.get('organizationId')  # ← ADD THIS
    
    # ... validation ...
    account_id = str(uuid.uuid4())
    
    staff_data = {
        'accountId': account_id,
        'organizationId': parent_organization_id,  # ← ADD THIS LINE
        'username': username,
        'name': name,
```

### 1.4 Add new method (At end of UserModel class, before last closing)

```python
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
```

---

## 2. Conversation Model Changes

**File:** `server/models/conversation.py`

### 2.1 Update _create_indexes() (Around line 12-50)

**Find existing indexes section, ADD after line 50:**

```python
def _create_indexes(self):
    # ... existing indexes ...
    
    # SECURITY FIX: Unique index on accountId + oa_id + customer_id pair (account isolation)
    try:
        self.collection.create_index([('accountId', 1), ('oa_id', 1), ('customer_id', 1)], unique=True, sparse=True)
    except Exception as e:
        logger.warning(f"Error creating accountId unique index: {e}")
    
    # ← ADD NEW INDEXES BELOW ←
    
    # NEW: Unique index on organizationId + oa_id + customer_id (organization isolation)
    try:
        self.collection.create_index(
            [('organizationId', 1), ('oa_id', 1), ('customer_id', 1)], 
            unique=True, 
            sparse=True
        )
    except Exception as e:
        logger.warning(f"Error creating organizationId unique index: {e}")
    
    # NEW: Query indexes for organizationId
    try:
        self.collection.create_index([('organizationId', 1), ('oa_id', 1), ('updated_at', -1)])
    except Exception as e:
        logger.warning(f"Error creating organizationId+oa_id index: {e}")
    
    try:
        self.collection.create_index([('organizationId', 1), ('customer_id', 1), ('updated_at', -1)])
    except Exception as e:
        logger.warning(f"Error creating organizationId+customer_id index: {e}")
```

### 2.2 Update upsert_conversation() method signature (Around line 117)

**Find:**
```python
def upsert_conversation(self, oa_id, customer_id, last_message_text=None, last_message_created_at=None, 
                       direction='in', customer_info=None, increment_unread=False, chatbot_id=None, chatbot_info=None, account_id=None):
```

**Change to:**
```python
def upsert_conversation(self, oa_id, customer_id, last_message_text=None, last_message_created_at=None, 
                       direction='in', customer_info=None, increment_unread=False, chatbot_id=None, chatbot_info=None, 
                       account_id=None, organization_id=None):  # ← ADD organization_id parameter
```

### 2.3 Update upsert_conversation() method body (Around line 130-145)

**Find:**
```python
    update_doc = {
        'oa_id': oa_id,
        'customer_id': customer_id,
        'updated_at': now,
    }
    
    # SECURITY FIX: Always include accountId for account isolation
    if account_id:
        update_doc['accountId'] = account_id
```

**Change to:**
```python
    update_doc = {
        'oa_id': oa_id,
        'customer_id': customer_id,
        'updated_at': now,
    }
    
    # Add both organizationId and accountId
    if organization_id:
        update_doc['organizationId'] = organization_id  # ← ADD THIS
    if account_id:
        update_doc['accountId'] = account_id
```

### 2.4 Update query building in upsert_conversation() (Around line 160-170)

**Find:**
```python
    # Build query to find existing conversation
    # SECURITY FIX: Include accountId in query for isolation
    query = {'oa_id': oa_id, 'customer_id': customer_id}
    if account_id:
        query['accountId'] = account_id
```

**Change to:**
```python
    # Build query - prefer organizationId, fallback to accountId
    query = {'oa_id': oa_id, 'customer_id': customer_id}
    if organization_id:
        query['organizationId'] = organization_id  # ← ADD THIS (preferred)
    elif account_id:
        query['accountId'] = account_id  # ← Keep as fallback
```

### 2.5 Update find_by_oa_and_customer() method (Around line 200)

**Find:**
```python
def find_by_oa_and_customer(self, oa_id, customer_id, account_id=None):
    """Find conversation by oa_id and customer_id
    
    SECURITY FIX: If account_id is provided, filter by it to ensure account isolation.
    """
    query = {'oa_id': oa_id, 'customer_id': customer_id}
    if account_id:
        query['accountId'] = account_id
    doc = self.collection.find_one(query)
    return self._serialize(doc)
```

**Change to:**
```python
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
```

### 2.6 Add new methods at end of ConversationModel class

```python
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

---

## 3. Message Model Changes

**File:** `server/models/message.py`

### 3.1 Update _create_indexes() (Around line 15-25)

**Add after existing indexes:**

```python
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
```

### 3.2 Update add_message() method signature (Around line 67)

**Find:**
```python
def add_message(self, platform, oa_id, sender_id, direction, text=None, metadata=None, sender_profile=None, is_read=False, conversation_id=None, account_id=None):
```

**Change to:**
```python
def add_message(self, platform, oa_id, sender_id, direction, text=None, metadata=None, sender_profile=None, is_read=False, conversation_id=None, account_id=None, organization_id=None):  # ← ADD
```

### 3.3 Update add_message() method body (Around line 85-95)

**Find:**
```python
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
    
    if account_id:
        doc['accountId'] = account_id
```

**Change to:**
```python
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
        doc['organizationId'] = organization_id  # ← ADD THIS
    if account_id:
        doc['accountId'] = account_id
```

### 3.4 Add new methods at end of MessageModel class

```python
def get_by_organization_and_conversation(self, organization_id, conversation_id, skip=0, limit=50):
    """Get messages for an organization's conversation"""
    query = {
        'organizationId': organization_id,
        'conversation_id': ObjectId(conversation_id) if isinstance(conversation_id, str) else conversation_id
    }
    
    cursor = self.collection.find(query).sort('created_at', -1).skip(skip).limit(limit)
    return [self._serialize(doc) for doc in cursor]

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

---

## 4. Integration Model Changes

**File:** `server/models/integration.py`

### 4.1 Update _create_indexes() (Around line 12-20)

**Find:**
```python
def _create_indexes(self):
    self.collection.create_index([('accountId', 1)])
    # index to help querying by chatbot and platform
    self.collection.create_index([('accountId', 1), ('chatbotId', 1), ('platform', 1)])
    self.collection.create_index([('platform', 1), ('oa_id', 1)], unique=True)
    self.collection.create_index('expires_at')
```

**Change to:**
```python
def _create_indexes(self):
    # NEW indexes for organizationId (primary)
    self.collection.create_index([('organizationId', 1)])
    self.collection.create_index([('organizationId', 1), ('chatbotId', 1), ('platform', 1)])
    self.collection.create_index([('organizationId', 1), ('platform', 1)])
    
    # KEEP for backward compatibility
    self.collection.create_index([('accountId', 1)])
    self.collection.create_index([('accountId', 1), ('chatbotId', 1), ('platform', 1)])
    self.collection.create_index([('platform', 1), ('oa_id', 1)], unique=False)  # No longer unique
    self.collection.create_index('expires_at')
```

### 4.2 Update create_or_update() method signature (Around line 31)

**Find:**
```python
def create_or_update(self, account_id, platform, oa_id, access_token, refresh_token=None, expires_in=None, meta=None, is_active=True, name=None, avatar_url=None, chatbot_id=None):
```

**Change to:**
```python
def create_or_update(self, account_id, platform, oa_id, access_token, refresh_token=None, expires_in=None, meta=None, is_active=True, name=None, avatar_url=None, chatbot_id=None, organization_id=None):  # ← ADD
```

### 4.3 Update create_or_update() method body (Around line 40-60)

**Find:**
```python
    doc = {
        'accountId': account_id,
        'platform': platform,
        'oa_id': oa_id,
        # ... other fields ...
    }
```

**Change to:**
```python
    doc = {
        'platform': platform,
        'oa_id': oa_id,
        # ... other fields ...
    }
    
    # Add both organizationId and accountId
    if organization_id:
        doc['organizationId'] = organization_id  # ← ADD THIS
    if account_id:
        doc['accountId'] = account_id  # ← ADD THIS (was implicit)
```

### 4.4 Add new methods at end of IntegrationModel class

```python
def find_by_organization(self, organization_id, platform=None, chatbot_id=None):
    """Find integrations by organization"""
    query = {'organizationId': organization_id}
    if platform:
        query['platform'] = platform
    if chatbot_id is not None:
        query['chatbotId'] = chatbot_id
    
    docs = list(self.collection.find(query))
    return [self._serialize(d) for d in docs]
```

---

## 5. Request Helper Update

**File:** `server/utils/request_helpers.py` (create if doesn't exist)

**Create/Update this file:**

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
        str: The organization ID
    
    Raises:
        ValueError: If user doesn't have an organization ID
    """
    organization_id = user_model.get_user_organization_id(account_id)
    
    if not organization_id:
        raise ValueError(f'User {account_id} does not have an organization ID')
    
    return organization_id
```

---

## 6. Route Updates - Facebook

**File:** `server/routes/facebook.py`

### 6.1 Add import at top

**Find imports section, add:**
```python
from utils.request_helpers import get_organization_id_from_request
```

### 6.2 Around line 215 - List existing integrations

**Find:**
```python
existing_on_chatbot_list = integration_model.find_by_account(account_id, platform='facebook', chatbot_id=chatbot_id)
```

**Change to:**
```python
organization_id = get_organization_id_from_request(account_id, user_model)
existing_on_chatbot_list = integration_model.find_by_organization(
    organization_id, 
    platform='facebook', 
    chatbot_id=chatbot_id
)
```

### 6.3 Around line 265 - Create integration

**Find:**
```python
integration = integration_model.create_or_update(
    account_id=account_id,
    platform='facebook',
    oa_id=oa_id,
    access_token=access_token,
    expires_in=expires_in,
    chatbot_id=chatbot_id,
    # ... other params ...
)
```

**Change to:**
```python
integration = integration_model.create_or_update(
    account_id=account_id,
    platform='facebook',
    oa_id=oa_id,
    access_token=access_token,
    expires_in=expires_in,
    chatbot_id=chatbot_id,
    organization_id=organization_id,  # ← ADD THIS
    # ... other params ...
)
```

### 6.4 Around line 488 - Upsert conversation

**Find:**
```python
conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id, account_id=integration.get('accountId'))
# ...
conversation_model.upsert_conversation(
    oa_id=oa_id,
    customer_id=customer_id,
    # ... other params ...
    account_id=integration.get('accountId'),  # SECURITY FIX
)
```

**Change to:**
```python
conversation_doc = conversation_model.find_by_oa_and_customer(
    oa_id, customer_id, 
    organization_id=organization_id  # ← CHANGE THIS
)
# ...
conversation_model.upsert_conversation(
    oa_id=oa_id,
    customer_id=customer_id,
    # ... other params ...
    account_id=account_id,           # ← KEEP for audit
    organization_id=organization_id,  # ← ADD THIS
)
```

### 6.5 Around line 488+ - Add message

**Find:**
```python
message_model.add_message(
    platform=platform,
    oa_id=oa_id,
    sender_id=customer_id,
    direction='in',
    text=text_content,
    metadata=msg_metadata,
    sender_profile=sender_profile,
    conversation_id=str(conversation_doc['_id']),
    account_id=integration.get('accountId'),  # SECURITY FIX
)
```

**Change to:**
```python
message_model.add_message(
    platform=platform,
    oa_id=oa_id,
    sender_id=customer_id,
    direction='in',
    text=text_content,
    metadata=msg_metadata,
    sender_profile=sender_profile,
    conversation_id=str(conversation_doc['_id']),
    account_id=account_id,              # ← CHANGE TO account_id
    organization_id=organization_id,    # ← ADD THIS
)
```

---

## 7. Route Updates - Zalo

**File:** `server/routes/zalo.py`

**Apply same changes as Facebook (Steps 6.1-6.5)**

- Import the helper function
- Update all `find_by_account()` → `find_by_organization()`
- Pass `organization_id` to create_or_update()
- Pass both `account_id` and `organization_id` to conversation/message methods

---

## 8. Route Updates - Integrations

**File:** `server/routes/integrations.py`

### 8.1 Update list_integrations function

**Find:**
```python
items = model.find_by_account(account_id, platform=platform, chatbot_id=chatbot_id)
```

**Change to:**
```python
organization_id = get_organization_id_from_request(account_id, user_model)
items = model.find_by_organization(organization_id, platform=platform, chatbot_id=chatbot_id)
```

---

## 9. Create Migration Script

**File:** `server/migrations/add_organization_id.py`

**Create this new file** (see ORGANIZATIONAL_STRUCTURE_IMPLEMENTATION_GUIDE.md for full content)

---

## Verification Checklist

After implementing all changes, verify:

- [ ] All model methods updated
- [ ] All route handlers updated  
- [ ] Imports added correctly
- [ ] No syntax errors
- [ ] Tests pass
- [ ] Migration script runs successfully
- [ ] Admin can access conversations
- [ ] Staff can access admin's conversations
- [ ] Different organizations isolated

---

## Deploy Steps

1. Deploy code changes first (backward compatible)
2. Wait 1-2 hours for monitoring
3. Run migration script
4. Verify organization isolation
5. Monitor for 1-2 weeks
6. Optional: Clean up fallback code


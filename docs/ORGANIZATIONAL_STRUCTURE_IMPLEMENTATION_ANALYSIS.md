# Organizational Structure Implementation Analysis

## Executive Summary

This document provides a comprehensive analysis of the codebase to implement organizational structure support. Currently, all operations (conversations, messages, integrations) are tied to individual `accountId`. With staff management feature added, you need both admin and staff accounts to access shared resources. The proposed solution is to introduce `organizationId` as the primary filtering mechanism.

---

## Current Architecture

### Data Models

#### 1. **User Model** (`server/models/user.py`)
- **Current Fields:**
  - `accountId`: Unique user identifier (UUID)
  - `email`: User email (admin only)
  - `role`: 'admin' or 'staff'
  - `parent_account_id`: Reference to admin account (staff only)
  - `created_by`: User who created this account

**Issue:** No organization linking. Staff accounts only know their parent admin, not a shared organization.

#### 2. **Conversation Model** (`server/models/conversation.py`)
- **Current Structure:**
  ```python
  {
    'oa_id': string,           # Platform OA ID
    'customer_id': string,     # Platform customer ID
    'accountId': string,       # OWNER ACCOUNT (security isolated)
    'chatbot_id': string,      # Chatbot reference
    'unread_count': int,
    'created_at': datetime,
    'updated_at': datetime,
  }
  ```
- **Current Index:** Unique on `(accountId, oa_id, customer_id)`
- **Issue:** Each account sees only their own conversations, staff can't see admin's

#### 3. **Message Model** (`server/models/message.py`)
- **Current Structure:**
  ```python
  {
    'platform': string,
    'oa_id': string,
    'sender_id': string,
    'conversation_id': ObjectId,
    'direction': 'in'|'out',
    'text': string,
    'accountId': string,       # OWNER ACCOUNT
    'is_read': bool,
    'created_at': datetime,
  }
  ```
- **Current Indexes:** `(accountId, platform, oa_id)`, `(accountId, conversation_id)`
- **Issue:** Messages belong to specific account, not organization

#### 4. **Integration Model** (`server/models/integration.py`)
- **Current Structure:**
  ```python
  {
    'accountId': string,       # OWNER ACCOUNT
    'platform': string,        # 'facebook', 'zalo', etc
    'oa_id': string,           # Platform OA ID
    'access_token': string,
    'refresh_token': string,
    'expires_at': datetime,
    'chatbotId': string,       # Linked chatbot
    'created_at': datetime,
    'updated_at': datetime,
  }
  ```
- **Current Indexes:** `(accountId)`, `(accountId, chatbotId, platform)`, `(platform, oa_id)` (unique)
- **Issue:** Each admin's integrations isolated, staff can't use them

#### 5. **Chatbot Model** (`server/models/chatbot.py`)
- **Current:** Likely has `accountId` field (implicit from route usage)
- **Issue:** Chatbots are per-account, not shared

---

## Query Patterns (Current Dependencies on `accountId`)

### Frontend API Calls (`client/lib/api.js`)

1. **Get All Conversations**
   ```javascript
   GET /api/integrations/conversations/all
   Header: X-Account-Id: <accountId>
   ```

2. **Get Messages**
   ```javascript
   GET /api/facebook/conversations/<convId>/messages
   Header: X-Account-Id: <accountId>
   ```

3. **Send Message**
   ```javascript
   POST /api/facebook/conversations/<convId>/messages
   Header: X-Account-Id: <accountId>
   Body: { text }
   ```

4. **Mark Read**
   ```javascript
   POST /api/facebook/conversations/<convId>/mark-read
   Header: X-Account-Id: <accountId>
   ```

5. **List Integrations**
   ```javascript
   GET /api/integrations?platform=facebook
   Header: X-Account-Id: <accountId>
   ```

6. **Chatbot Operations**
   ```javascript
   GET/POST /api/chatbots
   Header: X-Account-Id: <accountId>
   ```

### Backend Routes (`server/routes/`)

**File: `facebook.py`**
- Line 215: `integration_model.find_by_account(account_id, platform='facebook', chatbot_id=chatbot_id)`
- Line 265: `account_id=account_id` (passed to integration create)
- Line 488: `account_id=integration.get('accountId')` (passed to message)

**File: `zalo.py`**
- Similar patterns for Zalo platform

**File: `integrations.py`**
- Line 20: `model.find_by_account(account_id, ...)`
- All queries filter by `account_id`

**File: `chatbot.py`**
- Line 43: `bots = chatbot_model.list_chatbots_by_account(account_id)`
- All operations filter by `account_id`

---

## Proposed Solution: `organizationId` Implementation

### Step 1: Update User Model

#### Add `organizationId` field:

**When admin registers:**
- Create new `organizationId` (UUID)
- Store in admin's user document

**When staff is created:**
- Copy `organizationId` from parent admin
- Staff gets same organization as admin

```python
# In UserModel.create_user() - for admin
user_data = {
    ...
    'organizationId': str(uuid.uuid4()),  # NEW
    'accountId': account_id,
    'role': 'admin',
    ...
}

# In UserModel.create_staff() - for staff
staff_data = {
    ...
    'organizationId': parent['organizationId'],  # Copy from parent
    'accountId': account_id,
    'role': 'staff',
    'parent_account_id': parent_account_id,
    ...
}
```

### Step 2: Update Data Models

#### A. Conversation Model

**Add `organizationId` field:**
```python
{
  'organizationId': string,     # NEW: For organization-wide access
  'accountId': string,          # KEEP: For audit trail (who created)
  'oa_id': string,
  'customer_id': string,
  'chatbot_id': string,
  ...
}
```

**Update indexes:**
```python
# OLD (account isolation):
# create_index([('accountId', 1), ('oa_id', 1), ('customer_id', 1)], unique=True)

# NEW (organization isolation):
create_index(
  [('organizationId', 1), ('oa_id', 1), ('customer_id', 1)],
  unique=True,
  sparse=True
)

# Query indexes:
create_index([('organizationId', 1), ('oa_id', 1), ('updated_at', -1)])
create_index([('organizationId', 1), ('customer_id', 1), ('updated_at', -1)])
create_index([('organizationId', 1), ('chatbot_id', 1), ('updated_at', -1)])
```

**Query changes:**
```python
# OLD:
conversation_model.find_by_oa_and_customer(oa_id, customer_id, account_id=account_id)
# Query: {'oa_id': oa_id, 'customer_id': customer_id, 'accountId': account_id}

# NEW:
conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=organization_id)
# Query: {'oa_id': oa_id, 'customer_id': customer_id, 'organizationId': organization_id}
```

#### B. Message Model

**Add `organizationId` field:**
```python
{
  'organizationId': string,     # NEW: For organization-wide access
  'accountId': string,          # KEEP: For audit trail
  'conversation_id': ObjectId,
  'platform': string,
  'oa_id': string,
  'sender_id': string,
  ...
}
```

**Update indexes:**
```python
# OLD:
# create_index([('accountId', 1), ('platform', 1), ('oa_id', 1), ('created_at', -1)])
# create_index([('accountId', 1), ('conversation_id', 1), ('created_at', -1)])

# NEW:
create_index([('organizationId', 1), ('platform', 1), ('oa_id', 1), ('created_at', -1)])
create_index([('organizationId', 1), ('conversation_id', 1), ('created_at', -1)])
create_index([('organizationId', 1), ('created_at', -1)])
```

#### C. Integration Model

**Add `organizationId` field:**
```python
{
  'organizationId': string,     # NEW: For organization-wide access
  'accountId': string,          # KEEP: For audit trail
  'platform': string,
  'oa_id': string,
  'access_token': string,
  'chatbotId': string,
  ...
}
```

**Update indexes:**
```python
# OLD:
# create_index([('accountId', 1)])
# create_index([('accountId', 1), ('chatbotId', 1), ('platform', 1)])

# NEW:
create_index([('organizationId', 1)])
create_index([('organizationId', 1), ('chatbotId', 1), ('platform', 1)])
create_index([('organizationId', 1), ('platform', 1)])

# Keep for backward compatibility:
create_index([('platform', 1), ('oa_id', 1)], unique=False)  # Was unique before
```

#### D. Chatbot Model

**Add `organizationId` field** (similar pattern):
```python
{
  'organizationId': string,     # NEW
  'accountId': string,          # KEEP: Who created it
  'name': string,
  ...
}
```

### Step 3: Update Backend Routes

#### A. Helper Function to Get Organization

```python
def get_organization_id_from_user(account_id, user_model):
    """Get organizationId for a user account"""
    user = user_model.collection.find_one({'accountId': account_id})
    if not user:
        return None
    return user.get('organizationId')
```

#### B. Update Integration Queries

**File: `server/routes/facebook.py` (line 215)**
```python
# OLD:
existing_on_chatbot_list = integration_model.find_by_account(account_id, ...)

# NEW:
organization_id = get_organization_id_from_user(account_id, user_model)
existing_on_chatbot_list = integration_model.find_by_organization(
    organization_id, 
    platform='facebook', 
    chatbot_id=chatbot_id
)
```

#### C. Update Conversation Queries

**File: `server/routes/facebook.py` (line ~488)**
```python
# OLD:
conversation_doc = conversation_model.find_by_oa_and_customer(
    oa_id, customer_id, 
    account_id=integration.get('accountId')
)

# NEW:
organization_id = get_organization_id_from_user(account_id, user_model)
conversation_doc = conversation_model.find_by_oa_and_customer(
    oa_id, customer_id, 
    organization_id=organization_id
)
```

#### D. Update Message Creation

**All platform routes (facebook.py, zalo.py)**
```python
# OLD:
message_model.add_message(..., account_id=integration.get('accountId'))

# NEW:
organization_id = get_organization_id_from_user(account_id, user_model)
message_model.add_message(..., account_id=account_id, organization_id=organization_id)
```

---

## Implementation Checklist

### Phase 1: Data Model Updates

- [ ] **User Model** (`server/models/user.py`)
  - [ ] Add `organizationId` to `create_user()` (admin)
  - [ ] Add `organizationId` to `create_staff()` (copy from parent)
  - [ ] Create index on `organizationId`

- [ ] **Conversation Model** (`server/models/conversation.py`)
  - [ ] Add `organizationId` field to schema
  - [ ] Update `upsert_conversation()` to require `organization_id`
  - [ ] Add method `find_by_organization()`
  - [ ] Add method `list_by_organization()`
  - [ ] Update indexes
  - [ ] Keep `accountId` for audit trail

- [ ] **Message Model** (`server/models/message.py`)
  - [ ] Add `organizationId` field
  - [ ] Update `add_message()` to accept `organization_id`
  - [ ] Add query method `get_by_organization_and_conversation()`
  - [ ] Update indexes
  - [ ] Keep `accountId` for audit trail

- [ ] **Integration Model** (`server/models/integration.py`)
  - [ ] Add `organizationId` field
  - [ ] Update `create_or_update()` to accept `organization_id`
  - [ ] Add method `find_by_organization()`
  - [ ] Add method `list_by_organization()`
  - [ ] Update indexes

- [ ] **Chatbot Model** (`server/models/chatbot.py`)
  - [ ] Add `organizationId` field
  - [ ] Update creation/query methods
  - [ ] Update indexes

### Phase 2: Backend Route Updates

- [ ] **Authentication Helper** (`server/routes/auth.py` or utils)
  - [ ] Create `get_organization_id_from_request()` function
  - [ ] Or add to existing auth utilities

- [ ] **Integration Routes** (`server/routes/integrations.py`)
  - [ ] Update `list_integrations()` to use organization
  - [ ] Update `get_integration()` to verify organization access

- [ ] **Facebook Routes** (`server/routes/facebook.py`)
  - [ ] Update webhook handler to use organization
  - [ ] Update conversation list queries
  - [ ] Update message operations (send, mark read, get)
  - [ ] Update integration callbacks

- [ ] **Zalo Routes** (`server/routes/zalo.py`)
  - [ ] Same updates as Facebook

- [ ] **Chatbot Routes** (`server/routes/chatbot.py`)
  - [ ] Update list to show organization chatbots
  - [ ] Update queries

### Phase 3: Frontend Updates

- [ ] **API Layer** (`client/lib/api.js`)
  - [ ] No changes needed (uses `X-Account-Id` header)
  - [ ] Backend will translate to `organizationId`

- [ ] **Context/State** (`client/lib/context/`)
  - [ ] Consider adding `organizationId` to auth context
  - [ ] Useful for debugging/logging

### Phase 4: Data Migration

- [ ] **Migration Script**
  - [ ] For each admin user, generate `organizationId`
  - [ ] For each staff user, copy from parent admin
  - [ ] For each conversation, add `organizationId`
  - [ ] For each message, add `organizationId`
  - [ ] For each integration, add `organizationId`
  - [ ] For each chatbot, add `organizationId`

- [ ] **Backward Compatibility**
  - [ ] Keep `accountId` fields for audit
  - [ ] Maintain old indexes during transition
  - [ ] Test both old and new queries

### Phase 5: Testing

- [ ] **Unit Tests**
  - [ ] Staff can access admin's conversations
  - [ ] Admin can access staff's messages
  - [ ] Different organizations are isolated

- [ ] **Integration Tests**
  - [ ] Full conversation flow with mixed staff
  - [ ] Message delivery
  - [ ] Read status

- [ ] **Security Tests**
  - [ ] Staff can't access other organization's data
  - [ ] Organization boundaries are enforced

---

## Database Migration Strategy

### Approach 1: Dual-Write (Recommended for Zero Downtime)

**Phase 1: Deploy Code (1-2 weeks)**
1. Update all models to accept both `accountId` and `organizationId`
2. Update all queries to try `organizationId` first, fallback to `accountId`
3. Update write operations to write both fields

**Phase 2: Backfill Data (Run migration)**
```python
# Pseudocode for migration
for user in users_collection.find({'role': 'admin'}):
    org_id = str(uuid.uuid4())
    users_collection.update_one({'_id': user['_id']}, {'$set': {'organizationId': org_id}})
    
    # Update staff users
    staff_users = users_collection.find({'parent_account_id': user['accountId']})
    for staff in staff_users:
        users_collection.update_one({'_id': staff['_id']}, {'$set': {'organizationId': org_id}})

# Similar for conversations, messages, integrations, chatbots
for conversation in conversations_collection.find({'accountId': {'$exists': True}}):
    # Find account's organization
    account = users_collection.find_one({'accountId': conversation['accountId']})
    org_id = account.get('organizationId')
    conversations_collection.update_one(
        {'_id': conversation['_id']}, 
        {'$set': {'organizationId': org_id}}
    )
```

**Phase 3: Cleanup (1-2 weeks later)**
1. Remove fallback to `accountId` in queries
2. Remove `accountId` from queries (keep for audit trail in data)
3. Update indexes to remove old ones

---

## Security Considerations

### 1. **Organization Isolation**
- Always filter by both `organizationId` AND `accountId` during transition
- Never trust client-side organization ID
- Derive from authenticated user

### 2. **Staff Permissions**
- Staff should only access conversations/messages in their organization
- Consider adding role-based permissions (e.g., can't create integrations)
- Currently staff can do everything - add permission layer later if needed

### 3. **Audit Trail**
- Keep `accountId` to track which user performed actions
- Useful for: "Which staff member sent this message?"
- Separate from organization access control

### 4. **Transition Period**
- Run both checks:
  ```python
  # During transition:
  if not (doc.get('organizationId') == org_id OR doc.get('accountId') == account_id):
      raise UnauthorizedError()
  ```

---

## API Changes Summary

### Frontend (No Changes Needed)
- Continues to send `X-Account-Id` header
- Backend handles the organization lookup

### Backend - Request Processing

**Before (Current):**
```
Request Header: X-Account-Id: abc123
→ Query with: accountId = abc123
→ Return user's data
```

**After (New):**
```
Request Header: X-Account-Id: abc123
→ Lookup user: get organizationId from user
→ Query with: organizationId = org-xyz
→ Return organization's data (including staff)
```

---

## Files Requiring Changes

### Server Models
1. `/home/nam/work/test-preny/server/models/user.py`
2. `/home/nam/work/test-preny/server/models/conversation.py`
3. `/home/nam/work/test-preny/server/models/message.py`
4. `/home/nam/work/test-preny/server/models/integration.py`
5. `/home/nam/work/test-preny/server/models/chatbot.py` (implicit)

### Server Routes
1. `/home/nam/work/test-preny/server/routes/facebook.py`
2. `/home/nam/work/test-preny/server/routes/zalo.py`
3. `/home/nam/work/test-preny/server/routes/integrations.py`
4. `/home/nam/work/test-preny/server/routes/chatbot.py`
5. `/home/nam/work/test-preny/server/routes/auth.py` (add helper)
6. `/home/nam/work/test-preny/server/app.py` (possibly for migration)

### Utilities
1. `/home/nam/work/test-preny/server/utils/request_helpers.py` (create new or update)

### No Changes Needed
- Frontend API calls
- Client library functions
- WebSocket event emission (can update to include org_id for logging)

---

## Benefits of This Approach

✅ **Zero Trust**: Organization ID always derived from authenticated user  
✅ **Clean Separation**: Admin and staff see shared data naturally  
✅ **Scalability**: Organizations can grow with more staff  
✅ **Audit Trail**: Still know who performed each action  
✅ **Backward Compatible**: Existing accountId data preserved  
✅ **Easy Migration**: Can backfill data gradually  
✅ **Security**: Clear isolation boundaries  

---

## Future Enhancements

1. **Permission Levels**: Different staff roles (admin, viewer, limited)
2. **Multi-Organization**: Allow user to join multiple orgs
3. **Shared Chatbots**: Chatbots owned by organization, not individuals
4. **Activity Logging**: Track which user (staff) performed actions
5. **Cost Attribution**: Charges per organization instead of account
6. **Conversation Routing**: Assign conversations to specific staff


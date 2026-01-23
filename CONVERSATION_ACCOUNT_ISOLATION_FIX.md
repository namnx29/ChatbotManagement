# Conversation Account Isolation Fix

## Problem

When an integration is transferred from one account to another:

**Scenario:**
1. Account A integrates Facebook Page "XYZ" 
2. Customers chat with page "XYZ" → Conversations created with (oa_id='XYZ', customer_id='facebook:123')
3. Account A disconnects the integration
4. Account B integrates the same page "XYZ"
5. Customer "123" chats again → **Finds old conversation from Account A instead of creating new one**
6. **Old conversation updates with Account B's chatbot_id, mixing message history**
7. **Both accounts can access the same conversation list**

**Root Cause:**
- Conversation collection had unique index only on `(oa_id, customer_id)`
- No `accountId` field to isolate conversations by account owner
- When integration transfers, the old conversation gets reused instead of creating account-specific conversations
- Account B sees Account A's old conversations because they share same oa_id + customer_id

---

## Solution: Add `accountId` to Conversations

### 1. **Updated ConversationModel** (`server/models/conversation.py`)

**Updated indexes for account-based isolation:**
```python
def _create_indexes(self):
    # SECURITY FIX: Unique index includes accountId for account isolation
    self.collection.create_index([('accountId', 1), ('oa_id', 1), ('customer_id', 1)], unique=True)
    # ... other indexes ...
    # SECURITY FIX: Index for account-level queries
    self.collection.create_index([('accountId', 1), ('updated_at', -1)])
    self.collection.create_index([('accountId', 1), ('oa_id', 1), ('updated_at', -1)])
```

**Updated `upsert_conversation()` method:**
```python
def upsert_conversation(self, oa_id, customer_id, ..., account_id=None):
    """
    Upsert a conversation with account isolation.
    - account_id: the account that owns this conversation (SECURITY FIX)
    """
    # Update document includes accountId
    if account_id:
        update_doc['accountId'] = account_id
    
    # Query includes accountId for account-specific isolation
    query_filter = {'oa_id': oa_id, 'customer_id': customer_id}
    if account_id:
        query_filter['accountId'] = account_id
    
    existing = self.collection.find_one(query_filter)
```

**Updated query methods to support account filtering:**
- `find_by_oa_and_customer(oa_id, customer_id, account_id=None)` - Filter by account
- `mark_read(oa_id, customer_id, account_id=None)` - Filter by account
- `get_conversation_id(oa_id, customer_id, account_id=None)` - Filter by account
- `update_nickname(oa_id, customer_id, user_id, nick_name, account_id=None)` - Filter by account

### 2. **Updated Webhooks** (Facebook & Zalo)

All conversation creation now includes `account_id`:

**Facebook webhook:**
```python
conversation_doc = conversation_model.upsert_conversation(
    oa_id=integration.get('oa_id'),
    customer_id=customer_id,
    # ... other params ...
    account_id=integration.get('accountId'),  # ← NEW: Account isolation
)
```

**Zalo webhook:**
```python
conversation_doc = conversation_model.upsert_conversation(
    oa_id=resolved_oa_id,
    customer_id=customer_id,
    # ... other params ...
    account_id=integration.get('accountId'),  # ← NEW: Account isolation
)
```

### 3. **Updated Conversation Lookups**

All conversation queries now include account filtering:

**Facebook send message endpoint:**
```python
conversation_doc = conversation_model.find_by_oa_and_customer(
    oa_id, customer_id, 
    account_id=account_id_owner  # ← NEW: Filter by account
)
```

**Zalo send message endpoint:**
```python
conversation_doc = conversation_model.find_by_oa_and_customer(
    oa_id, customer_id,
    account_id=integration.get('accountId')  # ← NEW: Filter by account
)
```

**Mark read operations:**
```python
conversation_model.mark_read(oa_id, customer_id, account_id=account_id)  # ← NEW
```

### 4. **Updated Nickname Updates** (`server/routes/integrations.py`)

```python
updated_conv = model.update_nickname(
    oa_id=oa_id,
    customer_id=customer_id,
    user_id=account_id,
    nick_name=nick_name,
    account_id=account_id,  # ← NEW: Filter by account
)
```

---

## Behavior After Fix

### Scenario: Integration Transfer (BEFORE)

```
Account A integrates Page "XYZ"
  ↓
Customer "123" chats
  ↓
Conversation created: (oa_id='XYZ', customer_id='facebook:123')
  ↓
Account A disconnects
  ↓
Account B integrates Page "XYZ"
  ↓
Customer "123" chats again
  ↓
❌ FINDS OLD CONVERSATION (same oa_id + customer_id)
❌ Updates it with Account B's chatbot_id
❌ Account A and B both see same conversation
```

### Scenario: Integration Transfer (AFTER)

```
Account A integrates Page "XYZ"
  ↓
Customer "123" chats
  ↓
Conversation created:
  - accountId='A'
  - oa_id='XYZ'
  - customer_id='facebook:123'
  ↓
Account A disconnects
  ↓
Account B integrates Page "XYZ"
  ↓
Customer "123" chats again
  ↓
Queries with: (accountId='B', oa_id='XYZ', customer_id='facebook:123')
  ↓
✅ NO MATCH - Creates new conversation
✅ New conversation: accountId='B', oa_id='XYZ', customer_id='facebook:123'
✅ Account A's old conversation remains with accountId='A'
✅ Account B only sees their conversations
```

### Scenario: Reconnection

```
Account A integrates Page "XYZ"
  ↓
Customer "123" chats
  ↓
Conversation: accountId='A', oa_id='XYZ', customer_id='facebook:123'
  ↓
Account B connects Page "XYZ"
  ↓
Customer "123" chats
  ↓
Conversation: accountId='B', oa_id='XYZ', customer_id='facebook:123' (NEW)
  ↓
Account A reconnects Page "XYZ"
  ↓
Customer "123" chats
  ↓
✅ Finds existing: accountId='A', oa_id='XYZ', customer_id='facebook:123'
✅ Account A sees only their conversation history
✅ Account B's conversation remains separate with accountId='B'
```

---

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `server/models/conversation.py` | Added accountId to indexes, updated query methods | Store and isolate conversations by account |
| `server/routes/facebook.py` | Added `account_id` parameter to all `upsert_conversation()` and lookup calls | Isolate Facebook conversations |
| `server/routes/zalo.py` | Added `account_id` parameter to all `upsert_conversation()` and lookup calls | Isolate Zalo conversations |
| `server/routes/integrations.py` | Updated nickname update to include `account_id` | Isolate conversation updates |

---

## Database Behavior

### New Unique Index

**Before:**
```
Unique: (oa_id, customer_id)
```

**After:**
```
Unique: (accountId, oa_id, customer_id)
```

This means:
- ✅ Account A can have: (accountId='A', oa_id='XYZ', customer_id='facebook:123')
- ✅ Account B can have: (accountId='B', oa_id='XYZ', customer_id='facebook:123')
- ❌ Account A cannot have duplicate: (accountId='A', oa_id='XYZ', customer_id='facebook:123')

### Old Conversations (Without accountId)

Existing conversations without `accountId` field will still work but won't be returned by account-filtered queries. They're effectively isolated by the missing accountId.

---

## Testing Checklist

- [ ] Disconnect Account A's integration
- [ ] Connect Account B to same platform/page
- [ ] Send test message as Account B
- [ ] Verify Account B's conversation is NEW (not Account A's old one)
- [ ] Verify Account A's old conversations NOT visible to Account B
- [ ] Reconnect Account A to same platform/page
- [ ] Send message and verify Account A sees their OLD conversation
- [ ] Verify Account B's conversations still separate

---

## Summary

✅ **Conversations now belong to specific accounts**
✅ **Integration transfers create new account-specific conversations**
✅ **Old conversations remain isolated when integration changes hands**
✅ **Same customer can have separate conversations with different accounts**
✅ **Conversation history preserved per account**
✅ **Defense-in-depth: Combined with message + API isolation**

**Complete Account Isolation Now at 4 Layers:**
1. API endpoint validation (account ownership)
2. WebSocket room filtering (account-specific rooms)
3. Message collection isolation (accountId field)
4. **Conversation collection isolation (accountId field) ← NEW**

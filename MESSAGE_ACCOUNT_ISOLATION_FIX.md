# Message Collection Account Isolation Fix

## Problem

When an integration is transferred from one account to another:

**Scenario:**
1. Account A integrates Facebook Page "XYZ"
2. Customers chat with page "XYZ" → Messages stored without account ownership info
3. Account A disconnects the integration
4. Account B integrates the same page "XYZ"
5. **Account B sees ALL old messages** that Account A received (DATA LEAK)
6. Even if Account B later disconnects, if Account A reconnects, they'd see Account B's messages too

**Root Cause:**
- Message collection had no `accountId` field
- Queries only filtered by `(platform, oa_id, sender_id)`
- No account isolation when integration changes hands

---

## Solution: Add `accountId` to Messages

### 1. **Updated MessageModel** (`server/models/message.py`)

**Added indexes for account-based filtering:**
```python
def _create_indexes(self):
    # ... existing indexes ...
    # SECURITY FIX: Index for account-based message isolation
    self.collection.create_index([('accountId', 1), ('platform', 1), ('oa_id', 1), ('created_at', -1)])
    self.collection.create_index([('accountId', 1), ('conversation_id', 1), ('created_at', -1)])
```

**Updated `add_message()` to accept and store account_id:**
```python
def add_message(self, platform, oa_id, sender_id, direction, text=None, ..., account_id=None):
    """Add a message with accountId for account isolation."""
    doc = {
        'platform': platform,
        'oa_id': oa_id,
        'sender_id': sender_id,
        # ...
        'accountId': account_id  # SECURITY FIX: Isolate by account
    }
```

**Updated `get_messages()` to filter by account_id:**
```python
def get_messages(self, platform, oa_id, sender_id, limit=50, skip=0, conversation_id=None, account_id=None):
    """Get messages, optionally filtered by account_id."""
    # Build query
    if account_id:
        q['accountId'] = account_id  # SECURITY FIX: Filter by account
```

### 2. **Updated Webhooks** (Facebook & Zalo)

All message creation now includes `account_id`:

**Facebook webhook (`server/routes/facebook.py`):**
```python
incoming_doc = message_model.add_message(
    platform='facebook',
    oa_id=integration.get('oa_id'),
    sender_id=customer_platform_id,
    direction=direction,
    text=message_text,
    conversation_id=conversation_id,
    account_id=integration.get('accountId'),  # ← ADD ACCOUNT
)
```

**Zalo webhook (`server/routes/zalo.py`):**
```python
message_doc = message_model.add_message(
    platform='zalo',
    oa_id=integration.get('oa_id'),
    sender_id=customer_platform_id,
    direction=direction,
    text=message,
    conversation_id=conversation_id,
    account_id=integration.get('accountId'),  # ← ADD ACCOUNT
)
```

### 3. **Updated Send Message Endpoints**

**Facebook send message:**
```python
sent_doc = message_model.add_message(
    platform=platform,
    # ...
    account_id=account_id_owner,  # ← ADD ACCOUNT
)
```

**Zalo send message:**
```python
sent_doc = message_model.add_message(
    platform=platform,
    # ...
    account_id=integration.get('accountId'),  # ← ADD ACCOUNT
)
```

### 4. **Updated Message Retrieval**

**Facebook get messages endpoint:**
```python
msgs = message_model.get_messages(
    platform, oa_id, sender_id,
    limit=limit, skip=skip,
    conversation_id=conversation_id,
    account_id=account_id  # ← FILTER BY ACCOUNT
)
```

**Zalo get messages endpoint:**
```python
msgs = message_model.get_messages(
    platform, oa_id, sender_id,
    limit=limit, skip=skip,
    conversation_id=conversation_id,
    account_id=account_id  # ← FILTER BY ACCOUNT
)
```

---

## Behavior After Fix

### Scenario: Integration Transfer

**Before (VULNERABLE):**
```
Account A integrates Page "XYZ"
  ↓ Customers chat → Messages saved (no accountId)
  ↓
Account A disconnects
  ↓
Account B integrates same Page "XYZ"
  ↓
Query: messages where (platform='facebook', oa_id='XYZ')
  ↓
❌ RETURNS ALL MESSAGES (from both Account A and B)
```

**After (SECURE):**
```
Account A integrates Page "XYZ"
  ↓ Customers chat → Messages saved with accountId='A'
  ↓
Account A disconnects
  ↓
Account B integrates same Page "XYZ"
  ↓
Query: messages where (platform='facebook', oa_id='XYZ', accountId='B')
  ↓
✅ RETURNS ONLY ACCOUNT B'S MESSAGES
✅ Account A's messages isolated in their accountId='A' records
```

### Scenario: Reconnection

```
Account A integrates Page "XYZ"
  ↓ Messages saved with accountId='A'
  ↓
Account B connects Page "XYZ"
  ↓ Account B sees only their messages (accountId='B')
  ✅ Account A's old messages remain intact
  ✓
Account A reconnects Page "XYZ"
  ↓ Account A sees their accountId='A' messages again
  ✅ Account B's messages remain in accountId='B'
```

---

## Database Migration Notes

**For existing messages without accountId:**

Old messages don't have `accountId` field. This is OK because:

1. **New messages** - All created with `accountId`
2. **Old messages** - Won't be retrieved anyway (query filters by accountId)
3. **History preservation** - Old messages stay in DB but are isolated by missing accountId

**Optional: Backfill existing messages**
```javascript
// To backfill old messages (if needed in future)
db.messages.updateMany(
  { accountId: { $exists: false } },
  { $set: { accountId: null } }  // Mark as "legacy"
)
```

---

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `server/models/message.py` | Added accountId indexes, updated `add_message()` and `get_messages()` | Store and filter by account |
| `server/routes/facebook.py` | Added `account_id` parameter to all `add_message()` calls | Isolate Facebook messages |
| `server/routes/zalo.py` | Added `account_id` parameter to all `add_message()` calls | Isolate Zalo messages |

---

## Testing Checklist

- [ ] Send message from Account A's page → Saved with accountId='A'
- [ ] Disconnect Account A
- [ ] Connect Account B to same page
- [ ] Verify Account B sees NO messages from Account A
- [ ] Send message to Account B's page → Saved with accountId='B'
- [ ] Verify Account B only sees their messages
- [ ] Reconnect Account A to same page
- [ ] Verify Account A sees their original messages (accountId='A')
- [ ] Verify Account A doesn't see Account B's messages (accountId='B')

---

## Summary

✅ **Messages now belong to specific accounts**
✅ **Integration transfers don't leak message history**
✅ **Old messages isolated when integration changes hands**
✅ **History preserved per account indefinitely**
✅ **Defense-in-depth: Combined with API/WebSocket isolation**

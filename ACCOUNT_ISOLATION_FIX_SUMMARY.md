# Account Isolation Bug Fix - Complete Summary

## Problem Identified

When removing a platform integration from **Account A** and reconnecting it to **Account B**:

1. ❌ Old conversations from Account A are lost/not displayed
2. ❌ When Account B receives messages from the same customer, it updates the old conversation instead of creating a new one
3. ❌ Conversations are mixed between accounts with no isolation

### Root Causes

#### 1. **Missing Account ID in Conversation Model** (PRIMARY ISSUE)

**File**: `models/conversation.py`

**Problem**:
- Conversations were uniquely indexed by `(oa_id, customer_id)` only
- No `accountId` field was stored in conversation documents
- When the same platform (OA) transferred to a new account, MongoDB would find the existing conversation instead of creating a new one
- This caused both accounts to share the same conversation record

**Example Scenario**:
```
Account A owns Facebook Page: "fb_page_12345"
- Conversation doc: (oa_id: "fb_page_12345", customer_id: "fb:user_xyz")

Account A removes integration

Account B connects Facebook Page: "fb_page_12345"
- Webhook tries to upsert: (oa_id: "fb_page_12345", customer_id: "fb:user_xyz")
- ❌ MongoDB finds the OLD conversation (same unique key!)
- ❌ Updates it to Account B's chatbot
- ❌ Account A's users can't see it anymore (different chatbot_id)
- ❌ Account B sees only ONE merged conversation
```

#### 2. **Webhook Handlers Not Passing Account ID** (SECONDARY ISSUE)

**Files**: `routes/facebook.py`, `routes/zalo.py`

**Problem**:
- `upsert_conversation()` and `find_by_oa_and_customer()` were not receiving `account_id` parameter
- Even though `add_message()` was correctly using `account_id`, conversations weren't isolated
- Messages and conversations were tracked separately, breaking the connection

#### 3. **No Account Filtering in Conversation Queries** (TERTIARY ISSUE)

**Files**: `models/conversation.py`, `routes/integrations.py`

**Problem**:
- Query methods didn't filter by `accountId`
- `find_by_chatbot_id()` didn't accept `account_id` parameter
- Even when listing conversations, no account isolation was enforced

---

## Fixes Applied

### Fix 1: Updated Conversation Model Indexes and Methods

**File**: `models/conversation.py`

**Changes**:
- ✅ Added new unique index: `[(accountId, 1), (oa_id, 1), (customer_id, 1)]`
- ✅ Added support indexes for account isolation queries
- ✅ Updated `upsert_conversation()` to accept and store `account_id`
- ✅ Updated `find_by_oa_and_customer()` to filter by `account_id`
- ✅ Updated `find_by_oa()` to filter by `account_id`
- ✅ Updated `find_by_chatbot_id()` to filter by `account_id`
- ✅ Updated `mark_read()` to filter by `account_id`
- ✅ Updated `update_nickname()` to filter by `account_id`

**Code Example**:
```python
# OLD (insecure):
upsert_conversation(oa_id=oa_id, customer_id=customer_id, ...)

# NEW (secure):
upsert_conversation(
    oa_id=oa_id, 
    customer_id=customer_id, 
    account_id=integration.get('accountId'),  # SECURITY FIX
    ...
)
```

### Fix 2: Updated Facebook Webhook Handler

**File**: `routes/facebook.py`

**Changes**:
- ✅ Added `account_id=integration.get('accountId')` to `upsert_conversation()` calls
- ✅ Added `account_id=integration.get('accountId')` to `find_by_oa_and_customer()` calls
- ✅ Updated 2 main webhook locations (incoming messages, send message endpoint)

### Fix 3: Updated Zalo Webhook Handler

**File**: `routes/zalo.py`

**Changes**:
- ✅ Added `account_id=integration.get('accountId')` to all `upsert_conversation()` calls
- ✅ Added `account_id` to all `find_by_oa_and_customer()` calls
- ✅ Added `account_id` to all `mark_read()` calls
- ✅ Updated 4 locations (main webhook, message retrieval, mark read, send message)

### Fix 4: Updated Integration Routes

**File**: `routes/integrations.py`

**Changes**:
- ✅ Updated `get_all_conversations()` to pass `account_id` to `find_by_chatbot_id()`

---

## How the Fix Solves the Problem

### Before Fix (Broken):
```
Account A: "fb_page_123" → Conversation(oa_id="fb_page_123", customer="X", chatbot_id="A")
    ↓ (Account A removes integration)
Account B: "fb_page_123" → Webhook tries upsert
    ↓ (MongoDB finds existing conversation by oa_id+customer)
Result: ❌ Conversation updated to chatbot_id="B", Account A loses access
```

### After Fix (Secure):
```
Account A: "fb_page_123" → Conversation(accountId="A", oa_id="fb_page_123", customer="X", chatbot_id="A")
    ↓ (Account A removes integration)
Account B: "fb_page_123" → Webhook tries upsert with account_id="B"
    ↓ (MongoDB uses unique key: (accountId, oa_id, customer))
    ↓ (Key (A, fb_page_123, X) ≠ Key (B, fb_page_123, X))
Result: ✅ Creates NEW conversation for Account B
        ✅ Account A's conversation remains intact
        ✅ Both accounts have separate conversation histories
```

---

## Files Modified

| File | Changes |
|------|---------|
| `models/conversation.py` | Added accountId support to indexes, upsert, and query methods |
| `routes/facebook.py` | Added account_id parameter to upsert/query calls |
| `routes/zalo.py` | Added account_id parameter to upsert/query calls |
| `routes/integrations.py` | Added account_id parameter to find_by_chatbot_id call |

---

## Testing the Fix

### Test Scenario

1. **Setup Account A**:
   - Create Account A with Chatbot A
   - Integrate Facebook Page ID "test_page_123"
   - Receive message from Customer X
   - ✅ Verify conversation appears with chatbot_id="A"

2. **Transfer Platform**:
   - Remove Facebook Page integration from Account A
   - ✅ Verify old conversation still exists in database

3. **Setup Account B**:
   - Create Account B with Chatbot B
   - Integrate the SAME Facebook Page ID "test_page_123"
   - ✅ Verify integration created for Account B

4. **Test Isolation**:
   - Send message from same Customer X
   - ✅ Account A still has original conversation with chatbot_id="A"
   - ✅ Account B has NEW conversation with chatbot_id="B"
   - ✅ They are completely separate documents in database
   - ✅ No data leakage between accounts

### Verification Queries

```javascript
// Find all conversations for this OA and customer
db.conversations.find({
  oa_id: "fb_page_123",
  customer_id: "fb:user_xyz"
});

// Should return 2 documents (one per account):
// 1. { accountId: "account_A", oa_id: "fb_page_123", customer_id: "fb:user_xyz", chatbot_id: "chatbot_A" }
// 2. { accountId: "account_B", oa_id: "fb_page_123", customer_id: "fb:user_xyz", chatbot_id: "chatbot_B" }
```

---

## Migration Required

**IMPORTANT**: Existing conversations need to be updated with `accountId` field.

See: [ACCOUNT_ISOLATION_MIGRATION_GUIDE.md](./ACCOUNT_ISOLATION_MIGRATION_GUIDE.md)

### Quick Migration Steps

1. Back up database
2. Run MongoDB aggregation to add accountId to existing conversations
3. Delete orphaned conversations (optional)
4. Verify no conversations exist without accountId
5. Deploy code changes
6. Restart application

---

## Security Impact

### Before Fix
- ⚠️ **HIGH RISK**: Conversations could leak between accounts
- ⚠️ Data from Account A visible to Account B when platform transferred
- ⚠️ No account isolation at database level

### After Fix
- ✅ **SECURE**: Each conversation uniquely tied to an account
- ✅ Platform transfer doesn't cause data mixing
- ✅ Account isolation enforced at database schema level
- ✅ Query filters ensure cross-account queries are prevented

---

## Documentation Added

1. **ACCOUNT_ISOLATION_ISSUE_ANALYSIS.md**
   - Detailed analysis of root causes
   - Data flow diagrams
   - Solution requirements

2. **ACCOUNT_ISOLATION_MIGRATION_GUIDE.md**
   - Complete migration steps
   - MongoDB scripts for data updates
   - Troubleshooting guide
   - Rollback procedures

---

## Next Steps

1. **Apply Migration**:
   - Follow steps in ACCOUNT_ISOLATION_MIGRATION_GUIDE.md
   - Verify data integrity before deployment

2. **Deploy Code**:
   - Deploy updated code to production
   - Monitor logs for any issues

3. **Test**:
   - Run test scenario above
   - Verify account isolation works correctly

4. **Monitor**:
   - Watch for any webhook errors
   - Check conversation retrieval queries
   - Monitor for duplicate key errors

---

## Questions?

For more details, refer to:
- Analysis: [ACCOUNT_ISOLATION_ISSUE_ANALYSIS.md](./ACCOUNT_ISOLATION_ISSUE_ANALYSIS.md)
- Migration: [ACCOUNT_ISOLATION_MIGRATION_GUIDE.md](./ACCOUNT_ISOLATION_MIGRATION_GUIDE.md)

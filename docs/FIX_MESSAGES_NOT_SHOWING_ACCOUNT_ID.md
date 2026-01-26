# Message Retrieval Fix - Account ID Not Passed

## Problem Found

From the logs, I identified the exact issue:

```
Found conversation: oa_id=878897715315948, customer_id=facebook:26673788925547349, account_id=None ❌
```

The conversation was being found with **`account_id=None`** instead of the actual account ID.

This caused:
1. ✅ Conversation found in database
2. ❌ Messages query looking for messages with correct account_id
3. ❌ But no messages matched because query didn't use same account_id filter

## Root Cause

**Two Facebook endpoints were not passing `account_id` when querying conversations:**

### 1. `GET /api/facebook/conversations/<conv_id>/messages` (Line 817)
```python
# BEFORE (❌ Wrong)
conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id)

# AFTER (✅ Fixed)
conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id, account_id=account_id)
```

### 2. `POST /api/facebook/conversations/<conv_id>/mark-read` (Line 880)
```python
# BEFORE (❌ Wrong)
conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id)
...
conversation_model.mark_read(oa_id, customer_id)

# AFTER (✅ Fixed)
conversation_doc = conversation_model.find_by_oa_and_customer(oa_id, customer_id, account_id=account_id)
...
conversation_model.mark_read(oa_id, customer_id, account_id=account_id)
```

## What This Means

### The Bug Flow

```
1. User clicks conversation
   ↓
2. App calls: GET /api/facebook/conversations/facebook:123:456/messages
   ↓
3. Backend queries: find_by_oa_and_customer('123', 'facebook:456', account_id=None) ❌
   ↓
4. Database returns conversation (found it!)
   ↓
5. Backend then queries messages with: account_id='user-account-id' ✅
   ↓
6. Message query doesn't match because conversation was found with account_id=None
   ↓
7. Result: 0 messages returned ❌
```

### After Fix

```
1. User clicks conversation
   ↓
2. App calls: GET /api/facebook/conversations/facebook:123:456/messages
   ↓
3. Backend queries: find_by_oa_and_customer('123', 'facebook:456', account_id='user-account-id') ✅
   ↓
4. Database returns conversation (found with correct account!)
   ↓
5. Backend queries messages with: account_id='user-account-id' ✅
   ↓
6. Message query matches (same account_id!)
   ↓
7. Result: Messages returned ✅
```

## Files Modified

### `server/routes/facebook.py`
- **Line 820**: Updated `find_by_oa_and_customer()` call to pass `account_id`
- **Line 883**: Updated `find_by_oa_and_customer()` call to pass `account_id`
- **Line 887**: Updated `mark_read()` call to pass `account_id`

### `server/routes/zalo.py`
- Already fixed in previous update ✅

## Testing

After this fix, when you:

1. Transfer platform from Account A to Account B
2. Click on conversation in Account B
3. **Expected**: Messages now appear ✅
4. Click again or refresh
5. **Expected**: Messages marked as read ✅

## Expected Logs (After Fix)

```
Found conversation: oa_id=878897715315948, customer_id=facebook:26673788925547349, account_id=75a98bf9-7dcd-4346-9024-c683621eac86 ✅

Querying messages by conversation_id (converted): 697335c493e2f34b6d16528a -> ..., account_id=75a98bf9-7dcd-4346-9024-c683621eac86 ✅

Found N messages for query: {'conversation_id': ObjectId(...), 'accountId': '75a98bf9-7dcd-4346-9024-c683621eac86'} ✅
```

Notice: `account_id` is now populated instead of `None` ✅

## Restart Required

Restart your application to load these changes.

Then test:
1. Transfer platform to Account B
2. Click conversation
3. **Messages should now appear** ✅

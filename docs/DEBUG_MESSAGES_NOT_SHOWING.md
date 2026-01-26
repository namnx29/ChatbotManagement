# Debugging: Messages Not Showing - Diagnostic Guide

## What I Fixed

I added **detailed logging** to help diagnose why messages aren't showing when you click on conversations:

### 1. **Message Storage** (`add_message()`)
- ✅ Now logs when conversation_id is successfully stored
- ✅ **CRITICAL**: Logs errors if conversation_id fails to convert to ObjectId
- ✅ Shows exact conversation_id value being stored

### 2. **Conversation Retrieval** (`find_by_oa_and_customer()`)
- ✅ Logs when conversation is found with its _id
- ✅ Logs WARNING if conversation is NOT found

### 3. **Message Retrieval** (`get_messages()`)
- ✅ Logs what query is being used
- ✅ Shows conversation_id conversion process
- ✅ Logs how many messages were found

---

## How to Debug

### Step 1: Check Application Logs

After restarting the application, when you:
1. Transfer platform from Account A to Account B
2. Receive a message from the customer

**Look for these logs:**

```
[OK] INFO: Found conversation: oa_id=page_123, customer_id=fb:X, account_id=account_B, _id=ObjectId(...)

[OK] INFO: Added message with conversation_id (converted from string): 507f1f77bcf36e ... -> ObjectId(507f1f77bcf36e...)

[OK] INFO: Found 1 messages for query: {'conversation_id': ObjectId(...), 'accountId': 'account_B'}
```

If you see **any ERROR logs**, that's where the problem is.

### Step 2: Check for These Errors

**ERROR 1 - Conversation not found:**
```
[ERROR] WARNING: Conversation NOT found: oa_id=page_123, customer_id=fb:X, account_id=account_B
```
**Fix**: Conversation wasn't created properly. Check if upsert_conversation is being called with account_id.

**ERROR 2 - Message conversation_id failed:**
```
[ERROR] CRITICAL: Failed to convert conversation_id '...' to ObjectId: ...
```
**Fix**: conversation_id is in wrong format. Check what value is being passed.

**ERROR 3 - No messages found:**
```
[INFO] Found 0 messages for query: {'conversation_id': ObjectId(...), 'accountId': 'account_B'}
```
**Fix**: Messages weren't stored, OR stored with different conversation_id or account_id.

---

## Common Issues & Solutions

### Issue 1: Conversation ID Mismatch

**Symptom**: Messages exist but aren't retrieved

**Cause**: 
- Conversation _id is stored as string in conversation doc
- But stored as ObjectId in message doc
- MongoDB can't match ObjectId vs string

**Check in logs**:
```
Added message with conversation_id (converted from string): 507f... -> ObjectId(507f...)
Found conversation: _id=ObjectId(507f...)
```
Should match.

**Fix**: Already done! The logging will show if there's a mismatch.

---

### Issue 2: Account ID Mismatch

**Symptom**: Conversation shows in list but no messages

**Cause**: Message stored with account_id=A but query filters account_id=B

**Check in logs**:
```
Added message: ... account_id=account_B ...
Found 0 messages for query: ... 'accountId': 'account_B'
```
Should match.

**Check database**:
```javascript
// Find messages for this conversation
db.messages.find({
  conversation_id: ObjectId("507f1f77bcf36e..."),
  accountId: "account_B"
})
```

---

### Issue 3: Conversation Not Created

**Symptom**: Webhook receives message but no conversation found

**Cause**: upsert_conversation failed or wasn't called with account_id

**Check in logs**:
```
[FACEBOOK WEBHOOK]
Conversation NOT found: oa_id=page_123, customer_id=fb:X, account_id=account_B
```

**Check database**:
```javascript
db.conversations.find({
  oa_id: "page_123",
  customer_id: "fb:X"
})
```

Should return a document with `accountId: "account_B"`.

---

## Testing Steps

### Step 1: Clear Old Data (Optional)
If you want to test with fresh data:
```javascript
// Remove old test conversations and messages
db.conversations.deleteMany({oa_id: "test_page"})
db.messages.deleteMany({oa_id: "test_page"})
```

### Step 2: Run Test Scenario

1. **Restart application** - Indexes will be fixed, logging enabled
2. **Account B connects platform**
3. **Customer sends message** - Watch console logs
4. **Check logs** for the sequence of:
   - "Found conversation" ✅
   - "Added message with conversation_id" ✅
   - Message appears in list ✅
5. **Click on conversation**
6. **Check logs** for:
   - "Found N messages" ✅
7. **Messages should appear** ✅

### Step 3: Monitor Logs

```bash
# Watch application logs in real-time
tail -f /path/to/app/logs/app.log | grep -E "(conversation|message|account)"
```

---

## Database Verification

If messages still don't show after restart, check the database directly:

```javascript
// 1. Find the conversation
const conv = db.conversations.findOne({
  oa_id: "page_123",
  customer_id: "fb:customer_X",
  accountId: "account_B"
})

console.log("Conversation:", conv)
console.log("_id:", conv._id)

// 2. Find messages for that conversation
const msgs = db.messages.find({
  conversation_id: conv._id,
  accountId: "account_B"
})

console.log("Message count:", msgs.count())
msgs.forEach(m => console.log(m))

// 3. Check message structure
// Should have: conversation_id, accountId, platform, oa_id, text, created_at
```

---

## Mark as Read Issue

If "mark as read" doesn't work:

```javascript
// Find conversation
const conv = db.conversations.findOne({
  oa_id: "page_123",
  customer_id: "fb:customer_X"
})

// Find unread messages
const unread = db.messages.find({
  conversation_id: conv._id,
  direction: "in",
  is_read: false
})

console.log("Unread count:", unread.count())

// Manually mark as read
db.messages.updateMany(
  { conversation_id: conv._id, direction: "in", is_read: false },
  { $set: { is_read: true, updated_at: new Date() } }
)
```

---

## Solution Checklist

After implementing these fixes:

- [ ] Restart application
- [ ] Transfer platform from Account A to B
- [ ] Send message
- [ ] Check logs for "Found conversation" ✅
- [ ] Check logs for "Added message with conversation_id" ✅
- [ ] Click conversation in UI
- [ ] Check logs for "Found N messages" (should be > 0)
- [ ] Messages should display ✅
- [ ] Click conversation again
- [ ] Messages should be marked as read ✅

---

## Still Not Working?

If you still see issues after these fixes, please provide:

1. **Full application logs** when message is received and displayed
2. **Output of this database query**:
   ```javascript
   db.conversations.findOne({
     oa_id: "YOUR_PAGE_ID",
     customer_id: "fb:YOUR_CUSTOMER_ID"
   })
   ```

3. **Output of this database query**:
   ```javascript
   db.messages.find({
     oa_id: "YOUR_PAGE_ID",
     sender_id: "YOUR_CUSTOMER_ID"
   }).limit(5)
   ```

4. **Screenshot** of the conversation list and detail view

This will help identify exactly where the data is getting lost.

---

## Key Changes Made

### `add_message()`
- ✅ Enhanced logging for conversation_id storage
- ✅ **CRITICAL** error logging if conversion fails
- ✅ Shows exact ObjectId being stored

### `find_by_oa_and_customer()`
- ✅ Logs when conversation is found
- ✅ Warning when not found

### `get_messages()`
- ✅ Logs query parameters
- ✅ Logs conversation_id conversion
- ✅ Shows count of messages found

These improvements will make it **much easier to diagnose** what's happening.

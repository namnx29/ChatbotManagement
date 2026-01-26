# Data Migration Guide for Account Isolation Fix

## Summary of Changes

The codebase has been updated to implement proper account isolation for conversations. This document explains the changes and provides migration steps for existing data.

## Key Changes Made

### 1. Conversation Model (`models/conversation.py`)

**Index Changes:**
```python
# OLD (unsafe - allows cross-account mixing):
create_index([('oa_id', 1), ('customer_id', 1)], unique=True)

# NEW (secure - account-isolated):
create_index([('accountId', 1), ('oa_id', 1), ('customer_id', 1)], unique=True, sparse=True)
```

**Method Signature Changes:**
- `upsert_conversation()` - now accepts `account_id` parameter
- `find_by_oa_and_customer()` - now accepts `account_id` parameter
- `find_by_oa()` - now accepts `account_id` parameter
- `mark_read()` - now accepts `account_id` parameter
- `update_nickname()` - now accepts `account_id` parameter
- `find_by_chatbot_id()` - now accepts `account_id` parameter

### 2. Webhook Handlers

**Facebook (`routes/facebook.py`):**
- All `upsert_conversation()` calls now pass `account_id=integration.get('accountId')`
- All `find_by_oa_and_customer()` calls now pass `account_id=integration.get('accountId')`

**Zalo (`routes/zalo.py`):**
- All `upsert_conversation()` calls now pass `account_id=integration.get('accountId')`
- All `find_by_oa_and_customer()` calls now pass `account_id=integration.get('accountId')`
- `mark_read()` calls now pass `account_id=account_id`

### 3. Integration Routes (`routes/integrations.py`)

- `get_all_conversations()` now passes `account_id` to `find_by_chatbot_id()`
- `update_conversation_nickname()` already passes account_id (no change needed)

## Migration Steps

### Step 1: Backup Your Database

Before running any migrations, back up your MongoDB database:

```bash
mongodump --out=backup_$(date +%Y%m%d_%H%M%S)
```

### Step 2: Add Account IDs to Existing Conversations

Run this MongoDB aggregation to add `accountId` to all conversations that have a valid integration:

```javascript
// Find all conversations without accountId but with a valid oa_id
// and update them with the accountId from their integration

db.getCollection('conversations').aggregate([
  {
    $match: {
      $or: [
        { accountId: { $exists: false } },
        { accountId: null }
      ],
      oa_id: { $exists: true, $ne: null }
    }
  },
  {
    $lookup: {
      from: "integrations",
      localField: "oa_id",
      foreignField: "oa_id",
      as: "integration"
    }
  },
  {
    $unwind: "$integration"
  },
  {
    $group: {
      _id: "$_id",
      accountId: { $first: "$integration.accountId" },
      oa_id: { $first: "$oa_id" }
    }
  }
]).forEach(function(doc) {
  if (doc.accountId) {
    db.getCollection('conversations').updateOne(
      { _id: doc._id },
      { $set: { accountId: doc.accountId } }
    );
    print("Updated conversation " + doc._id + " with accountId: " + doc.accountId);
  } else {
    print("WARNING: Conversation " + doc._id + " has no matching integration for oa_id: " + doc.oa_id);
  }
});
```

### Step 3: Identify Orphaned Conversations

Conversations without a matching integration (deleted integrations) will not have an `accountId`. 

**Option A: Delete Orphaned Conversations**

```javascript
// Find and delete conversations where no integration exists
db.getCollection('conversations').aggregate([
  {
    $match: {
      oa_id: { $exists: true, $ne: null }
    }
  },
  {
    $lookup: {
      from: "integrations",
      localField: "oa_id",
      foreignField: "oa_id",
      as: "integration"
    }
  },
  {
    $match: {
      integration: { $size: 0 }
    }
  }
]).forEach(function(doc) {
  print("Orphaned conversation found: " + doc._id + " (oa_id: " + doc.oa_id + ")");
  db.getCollection('conversations').deleteOne({ _id: doc._id });
  print("Deleted orphaned conversation: " + doc._id);
});
```

**Option B: Keep Orphaned Conversations (Not Recommended)**

If you want to keep orphaned conversations for historical reasons, you can manually assign an `accountId`:

```javascript
// Find all orphaned conversations
db.getCollection('conversations').find({
  $or: [
    { accountId: { $exists: false } },
    { accountId: null }
  ]
}).pretty();

// For each one, manually update with a known account_id
// db.conversations.updateOne(
//   { _id: ObjectId("...") },
//   { $set: { accountId: "known-account-id" } }
// );
```

### Step 4: Verify Migration

After running migrations, verify the data:

```javascript
// Count conversations by accountId
db.getCollection('conversations').aggregate([
  { $group: { _id: "$accountId", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).pretty();

// Find conversations without accountId (should be empty)
db.getCollection('conversations').find({
  $or: [
    { accountId: { $exists: false } },
    { accountId: null }
  ]
}).count();
```

### Step 5: Rebuild Indexes

After updating data, rebuild the unique index:

```javascript
// Drop the old non-account-isolated index
db.getCollection('conversations').dropIndex("oa_id_1_customer_id_1");

// The new index will be created automatically when the app starts,
// but you can manually create it:
db.getCollection('conversations').createIndex(
  { accountId: 1, oa_id: 1, customer_id: 1 },
  { unique: true, sparse: true }
);
```

### Step 6: Deploy Code Changes

1. Deploy the updated code from this fix
2. Restart the application
3. Monitor logs for any migration-related errors

### Step 7: Test the Fix

Test the full flow:

1. **Account A**: Integrate a platform (e.g., Facebook Page ID "12345")
2. **Account A**: Receive a message from Customer X
3. **Account A**: Verify conversation is stored with accountId
4. **Account A**: Remove the platform integration
5. **Account B**: Integrate the same platform (Facebook Page ID "12345")
6. **Account B**: Receive a message from the same Customer X
7. **Verify**:
   - Account A's old conversation should still exist (with Account A's accountId)
   - Account B's new conversation should exist (with Account B's accountId)
   - They should be separate, isolated conversations
   - Customer X should appear in both accounts' message history separately

## Troubleshooting

### Issue: Duplicate Key Error on Insert

**Symptom**: After deployment, seeing duplicate key errors in webhook handler logs

**Cause**: Existing conversations without `accountId` conflict with new unique index

**Solution**:
1. Ensure all conversations have `accountId` field
2. If necessary, temporarily drop the unique index: `db.conversations.dropIndex("accountId_1_oa_id_1_customer_id_1")`
3. Run the migration script above
4. Rebuild the index

### Issue: Conversations Missing After Platform Transfer

**Symptom**: After moving a platform from Account A to Account B, Account A's conversations are gone

**Cause**: If `accountId` is not set on old conversations, they may not be queryable

**Solution**:
1. Check if conversations exist in database: `db.conversations.find({oa_id: "..."}).count()`
2. If they exist, update them with the correct `accountId`
3. If they don't exist, they were likely deleted when the integration was removed

### Issue: Application Won't Start

**Symptom**: Application crashes on startup with MongoDB index errors

**Cause**: Index creation conflict

**Solution**:
1. Check MongoDB logs for specific error
2. Drop conflicting indexes: `db.conversations.dropIndex("...")`
3. Restart application (it will recreate indexes automatically)

## Rollback Plan

If you need to rollback:

1. **Restore from backup**:
   ```bash
   mongorestore --drop backup_YYYYMMDD_HHMMSS
   ```

2. **Redeploy old code** (before this fix)

3. **Restart application**

## FAQ

**Q: Will this affect existing users?**  
A: No, if migrated correctly. Users will see the same conversations, but they will now be properly isolated by account.

**Q: What happens to conversations from deleted integrations?**  
A: They become orphaned (no `accountId` field) and won't be queryable. You can delete them or manually assign an account.

**Q: Can I skip the migration?**  
A: Not recommended. Without proper `accountId` values, conversations could leak between accounts.

**Q: How do I know if the migration was successful?**  
A: Run the verification queries above. All conversations should have an `accountId` field.

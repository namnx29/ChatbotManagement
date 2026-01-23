# Account Isolation Issue Analysis: Lost Conversations After Platform Transfer

## Problem Summary
When removing a platform integration from **Account A** and reconnecting it to **Account B**, the conversations from Account A are lost/not displayed. Additionally, when Account B receives messages, it updates the old conversation instead of creating a new one.

## Root Causes Identified

### 1. **Conversation Lookup by OA_ID Only (Primary Issue)**

**File**: `models/conversation.py`  
**Problem**: The conversation model uses `(oa_id, customer_id)` as the unique constraint:

```python
def _create_indexes(self):
    # Unique index on oa_id + customer_id pair
    self.collection.create_index([('oa_id', 1), ('customer_id', 1)], unique=True)
```

**Why This Is Wrong**: 
- When Platform X (e.g., Facebook Page ID "12345") is transferred from Account A to Account B, both accounts can have conversations with the SAME `oa_id` and `customer_id`
- The unique index causes duplicate key errors or overwrites when trying to create a new conversation for Account B
- **Example**: 
  - Account A has conversation: `(oa_id: "fb_page_12345", customer_id: "zalo:customer_789")`
  - Account B reconnects platform "fb_page_12345"
  - Same conversation doc gets updated instead of creating a new one per account

### 2. **Missing Account ID in Conversation Document (Secondary Issue)**

**File**: `models/conversation.py`  
**Problem**: The conversation model doesn't store `accountId` or enforce account isolation:

```python
def upsert_conversation(self, oa_id, customer_id, ...):
    # No accountId/accountId field being stored!
    update_doc = {
        'oa_id': oa_id,
        'customer_id': customer_id,
        # Missing: 'accountId': account_id
    }
```

**Impact**:
- Conversations can't be filtered by account
- When querying conversations, there's no way to isolate data per account
- Historical conversations become invisible because they're queried with a different OA that now belongs to a different account

### 3. **Webhook Uses Platform OA_ID to Look Up Integration (Tertiary Issue)**

**File**: `routes/zalo.py` (line ~423) and `routes/facebook.py`  
**Current Flow**:
```python
# Webhook handler receives message
oa_id = extract_oa_id_from_webhook()  # e.g., "fb_page_12345"

# Look up integration by platform + oa_id ONLY
integration = integration_model.find_by_platform_and_oa('zalo', oa_id)
# This gets whichever integration record has this oa_id (could be ANY account!)
```

**Problem**:
- If Platform X is transferred to a new account, the webhook still finds the old integration (if it wasn't deleted)
- Or it finds the new integration correctly, but then creates/updates conversations using old account context

### 4. **Conversation Queries Missing Account ID Filter**

**File**: `routes/integrations.py` (line ~127)  
**Example**:
```python
conversations = [conversation_model._serialize(conv, current_user_id=account_id) 
                 for conv in conversation_model.find_by_chatbot_id(chatbot_id, limit=2000)]
```

Even though this filters by `chatbot_id`, conversations don't have `chatbot_id` stored in all cases, leading to cross-contamination.

## Data Flow Showing the Bug

### Scenario
1. **Account A** integrates Facebook Page ID `page_123`
   - Creates conversation: `(oa_id: "page_123", customer_id: "fb:customer_X")`
   - Stored in DB with NO account isolation

2. **Account A** removes the integration
   - Integration record deleted
   - **Conversations remain in DB!**

3. **Account B** integrates the same Facebook Page ID `page_123`
   - Webhook receives message from same customer
   - Tries to upsert conversation with `(oa_id: "page_123", customer_id: "fb:customer_X")`
   - **Updates the OLD conversation doc** (unique constraint violation prevention)
   - Old conversation gets `chatbot_id` set to Account B's chatbot
   - **But**: Account A's users can't see it (no account_id isolation)
   - **And**: Account B sees one merged conversation instead of separate ones

## Solution Requirements

### Fix 1: Add Account ID to Conversation Documents
- Add `accountId` field to all conversation documents
- Update unique index to: `[(accountId, 1), (oa_id, 1), (customer_id, 1)]`
- This makes conversations truly per-account

### Fix 2: Include Account ID in Conversation Upsert
- All calls to `upsert_conversation()` must pass `account_id`
- Store it in the conversation document

### Fix 3: Filter Conversations by Account ID
- All conversation queries must filter by `accountId`
- Ensure `find_by_oa_and_customer()`, `find_by_oa()`, etc. all filter by account

### Fix 4: Pass Account Context Through Webhooks
- When integration is looked up, verify its `accountId`
- Pass `account_id` from integration to conversation upsert

### Fix 5: Create Migration for Existing Conversations
- Add `accountId` to all existing conversations based on their integration's account
- Or bulk delete orphaned conversations from deleted integrations

## Files to Modify

1. **`models/conversation.py`**
   - Add `accountId` field to upsert operations
   - Update indexes to include `accountId`
   - Add account filtering to all query methods

2. **`routes/facebook.py`** (webhook handler)
   - Ensure `integration.get('accountId')` is passed to `upsert_conversation()`

3. **`routes/zalo.py`** (webhook handler)
   - Ensure `integration.get('accountId')` is passed to `upsert_conversation()`

4. **`routes/integrations.py`**
   - Add account_id filtering when listing conversations

5. **`models/message.py`** (already has `accountId` - good!)
   - Verify all message queries use account isolation

## Verification Steps

1. Check conversation collection indexes
2. Verify conversation documents have `accountId` field
3. Trace webhook flow to ensure account context is preserved
4. Test scenario: Transfer platform → send message → verify old and new conversations exist separately

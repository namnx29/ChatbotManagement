# OrganizationId Implementation - Visual Summary

## Current Architecture (Before)

```
┌─────────────────────────────────────────────────────┐
│                    SYSTEM STRUCTURE                  │
└─────────────────────────────────────────────────────┘

Admin Account (accountId: admin-123)
    │
    ├── Integrations (accountId: admin-123)
    │   ├── Facebook Page 1
    │   └── Zalo OA 1
    │
    ├── Conversations (accountId: admin-123)
    │   ├── Conv 1: Customer A → Page 1
    │   ├── Conv 2: Customer B → Page 1
    │   └── Conv 3: Customer C → Zalo
    │
    └── Messages (accountId: admin-123)
        ├── MSG 1: Conv 1
        ├── MSG 2: Conv 2
        └── MSG 3: Conv 3


Staff Account 1 (accountId: staff-456, parent: admin-123)
    │
    ├── Integrations (accountId: staff-456)
    │   └── EMPTY! Can't see admin's integrations
    │
    ├── Conversations (accountId: staff-456)
    │   └── EMPTY! Can't see admin's conversations
    │
    └── Messages (accountId: staff-456)
        └── EMPTY! Can't see admin's messages


PROBLEM: Staff can't access admin's data!
```

---

## Proposed Architecture (After)

```
┌─────────────────────────────────────────────────────┐
│                  ORGANIZATION STRUCTURE               │
└─────────────────────────────────────────────────────┘

Organization (organizationId: org-xyz-123)
    │
    ├─ Admin Account (accountId: admin-123)
    │  └─ organizationId: org-xyz-123
    │
    ├─ Staff Account 1 (accountId: staff-456)
    │  └─ organizationId: org-xyz-123  ← SAME organization!
    │
    ├─ Staff Account 2 (accountId: staff-789)
    │  └─ organizationId: org-xyz-123  ← SAME organization!
    │
    ├── Integrations (organizationId: org-xyz-123)
    │   ├── Facebook Page 1
    │   │   ├── created_by: admin-123
    │   │   └── accountId: admin-123 (audit trail)
    │   │
    │   └── Zalo OA 1
    │       ├── created_by: admin-123
    │       └── accountId: admin-123 (audit trail)
    │
    ├── Conversations (organizationId: org-xyz-123)
    │   ├── Conv 1: Customer A → Page 1
    │   │   ├── accountId: admin-123 (who handled it)
    │   │   └── organizationId: org-xyz-123
    │   │
    │   ├── Conv 2: Customer B → Page 1
    │   │   ├── accountId: staff-456 (who handled it)
    │   │   └── organizationId: org-xyz-123
    │   │
    │   └── Conv 3: Customer C → Zalo
    │       ├── accountId: staff-789 (who handled it)
    │       └── organizationId: org-xyz-123
    │
    └── Messages (organizationId: org-xyz-123)
        ├── MSG 1: Conv 1
        │   ├── accountId: admin-123 (sender)
        │   └── organizationId: org-xyz-123
        │
        ├── MSG 2: Conv 2
        │   ├── accountId: staff-456 (sender)
        │   └── organizationId: org-xyz-123
        │
        └── MSG 3: Conv 3
            ├── accountId: staff-789 (sender)
            └── organizationId: org-xyz-123


BENEFIT: All team members see all conversations!
Different organizations are completely isolated.
```

---

## Data Flow Examples

### Current Flow (Broken)

```
User Request: Get Conversations
    │
    ├─ Header: X-Account-Id: staff-456
    │
    └─→ Backend Query: {accountId: staff-456}
        │
        └─→ Database returns: [] (empty - no conversations for staff!)
```

### New Flow (Working)

```
User Request: Get Conversations
    │
    ├─ Header: X-Account-Id: staff-456
    │
    └─→ Backend:
        ├─ Lookup user: staff-456
        ├─ Get organizationId: org-xyz-123
        │
        └─→ Database Query: {organizationId: org-xyz-123}
            │
            └─→ Returns ALL conversations for the organization
                (including those created by admin-123, staff-456, staff-789)
```

---

## Database Changes Summary

### User Collection

```javascript
// BEFORE
{
  _id: ObjectId(...),
  accountId: "admin-123",
  email: "admin@company.com",
  role: "admin",
  name: "Admin User",
  created_at: 2024-01-01,
  // ... no organization tracking
}

// AFTER
{
  _id: ObjectId(...),
  accountId: "admin-123",
  email: "admin@company.com",
  role: "admin",
  name: "Admin User",
  organizationId: "org-xyz-123",  // ← NEW
  created_at: 2024-01-01,
  // ... rest same
}

// STAFF ACCOUNT
{
  _id: ObjectId(...),
  accountId: "staff-456",
  username: "john_doe",
  role: "staff",
  parent_account_id: "admin-123",
  organizationId: "org-xyz-123",  // ← COPIED FROM ADMIN
  created_at: 2024-01-15,
  // ... rest same
}
```

### Conversation Collection

```javascript
// BEFORE
{
  _id: ObjectId(...),
  oa_id: "page-id-1",
  customer_id: "cust-123",
  accountId: "admin-123",  // ← Only admin can see
  unread_count: 2,
  created_at: 2024-01-01,
}

// AFTER
{
  _id: ObjectId(...),
  oa_id: "page-id-1",
  customer_id: "cust-123",
  accountId: "admin-123",      // ← KEPT FOR AUDIT
  organizationId: "org-xyz-123", // ← NEW: All org members can see
  unread_count: 2,
  created_at: 2024-01-01,
}
```

### Message Collection

```javascript
// BEFORE
{
  _id: ObjectId(...),
  conversation_id: ObjectId(...),
  platform: "facebook",
  oa_id: "page-id-1",
  sender_id: "cust-123",
  accountId: "admin-123",  // ← Only admin can see
  text: "Hello",
  created_at: 2024-01-01,
}

// AFTER
{
  _id: ObjectId(...),
  conversation_id: ObjectId(...),
  platform: "facebook",
  oa_id: "page-id-1",
  sender_id: "cust-123",
  accountId: "staff-456",           // ← CHANGED: Who handled it
  organizationId: "org-xyz-123",   // ← NEW: All org members can see
  text: "Hello",
  created_at: 2024-01-01,
}
```

### Integration Collection

```javascript
// BEFORE
{
  _id: ObjectId(...),
  platform: "facebook",
  oa_id: "page-id-1",
  accountId: "admin-123",  // ← Only admin can use
  access_token: "...",
  created_at: 2024-01-01,
}

// AFTER
{
  _id: ObjectId(...),
  platform: "facebook",
  oa_id: "page-id-1",
  accountId: "admin-123",        // ← KEPT FOR AUDIT
  organizationId: "org-xyz-123", // ← NEW: All staff can use
  access_token: "...",
  created_at: 2024-01-01,
}
```

---

## Query Changes

### Get All Conversations

#### Current (Broken for Staff)
```python
# Backend receives: X-Account-Id: staff-456
# Query executed: db.conversations.find({accountId: "staff-456"})
# Result: [] ← Empty!
```

#### New (Works for All)
```python
# Backend receives: X-Account-Id: staff-456
# 1. Look up user: staff-456
# 2. Get organizationId: org-xyz-123
# 3. Query executed: db.conversations.find({organizationId: "org-xyz-123"})
# Result: All conversations in org ← Works!
```

### Get Messages for Conversation

#### Current
```python
# Query: db.messages.find({accountId: "staff-456", conversation_id: conv_id})
# Result: [] if staff didn't create the conversation
```

#### New
```python
# Query: db.messages.find({organizationId: "org-xyz-123", conversation_id: conv_id})
# Result: All messages, regardless of who sent them
```

### Send Message

#### Current
```python
message_model.add_message(
    platform="facebook",
    oa_id="page-id-1",
    sender_id="staff-456",
    text="Response from staff",
    account_id="staff-456"  # Message marked as staff's
)
```

#### New
```python
message_model.add_message(
    platform="facebook",
    oa_id="page-id-1",
    sender_id="staff-456",
    text="Response from staff",
    account_id="staff-456",              # ← KEPT: Who sent it (audit)
    organization_id="org-xyz-123"        # ← NEW: Which org
)
```

### List Integrations

#### Current
```python
# Only admin's integrations returned
integrations = integration_model.find_by_account("admin-123")
# Staff: find_by_account("staff-456") → Empty list
```

#### New
```python
# All organization's integrations returned
integrations = integration_model.find_by_organization("org-xyz-123")
# Both admin and staff get: Facebook + Zalo integrations
```

---

## Index Structure

### Current Indexes (Account-Based)

```
conversations:
  ✓ (accountId, oa_id, customer_id) UNIQUE
  ✓ (accountId, oa_id, updated_at DESC)
  ✓ (accountId, customer_id, updated_at DESC)

messages:
  ✓ (accountId, platform, oa_id, created_at DESC)
  ✓ (accountId, conversation_id, created_at DESC)

integrations:
  ✓ (accountId)
  ✓ (accountId, chatbotId, platform)
```

### New Indexes (Organization-Based)

```
conversations:
  ✓ (organizationId, oa_id, customer_id) UNIQUE  ← NEW PRIMARY
  ✓ (organizationId, oa_id, updated_at DESC)    ← NEW
  ✓ (organizationId, customer_id, updated_at DESC) ← NEW
  (accountId, oa_id, customer_id) UNIQUE        ← KEEP (compatibility)

messages:
  ✓ (organizationId, platform, oa_id, created_at DESC)  ← NEW PRIMARY
  ✓ (organizationId, conversation_id, created_at DESC)  ← NEW
  (accountId, platform, oa_id, created_at DESC)         ← KEEP (compatibility)

integrations:
  ✓ (organizationId)              ← NEW PRIMARY
  ✓ (organizationId, chatbotId, platform) ← NEW
  (accountId)                     ← KEEP (compatibility)
```

---

## Security & Isolation

### Before (Issue)

```
┌─────────────────────────────────────┐
│   Organization A                    │
│   - Admin: admin-a                  │
│   - Staff: staff-a                  │
│   - Convs: 5 (all linked to admin-a)│
│   - Staff sees: 0 conversations ❌  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│   Organization B                    │
│   - Admin: admin-b                  │
│   - Convs: 10 (linked to admin-b)   │
└─────────────────────────────────────┘
```

### After (Fixed)

```
┌──────────────────────────────────────────┐
│   Organization A (org-a)                 │
│   - Admin: admin-a (accountId-a)         │
│   - Staff: staff-a (accountId-sa)        │
│   - Integrations: Linked to org-a ✓      │
│   - Convs: 5 (organizationId: org-a)     │
│   - Staff sees: 5 conversations ✓✓       │
│   - Messages: accountId shows who sent   │
│   - Isolation: Can't see org-b data ✓    │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│   Organization B (org-b)                 │
│   - Admin: admin-b (accountId-b)         │
│   - Integrations: Linked to org-b ✓      │
│   - Convs: 10 (organizationId: org-b)    │
│   - Isolation: Can't see org-a data ✓    │
└──────────────────────────────────────────┘
```

---

## Implementation Timeline

```
Week 1: Deploy Code
  ├─ Update Models (user, conversation, message, integration, chatbot)
  ├─ Update Routes (facebook, zalo, integrations, chatbot)
  └─ Deploy to production (backward compatible)

Week 2: Run Migration
  ├─ Execute migration script
  ├─ Verify all records have organizationId
  ├─ Monitor queries
  └─ Test staff access

Week 3: Verify & Stabilize
  ├─ Run comprehensive tests
  ├─ Monitor performance
  ├─ Fix any issues
  └─ Declare complete

Optional Week 4-5: Cleanup
  ├─ Remove fallback queries
  ├─ Drop old indexes (if desired)
  └─ Optimize performance
```

---

## Quick Reference: What Changes

### What Gets ADDED
- `organizationId` field in: users, conversations, messages, integrations, chatbots
- `find_by_organization()` methods in all models
- New indexes on `organizationId`
- Helper function `get_organization_id_from_request()`
- Migration script

### What Gets KEPT
- `accountId` field (for audit trail)
- All existing API endpoints
- All client-side code
- Old indexes (for compatibility during transition)

### What Gets REMOVED (Optional, phase 2)
- Fallback query logic (after verification)
- Old indexes (after full migration)
- Backward compatibility code

### What CHANGES BEHAVIOR
- Conversations visible to: just owner → entire organization
- Messages visible to: just owner → entire organization
- Integrations accessible to: just owner → entire organization
- Staff users now see admin's data in same organization

---

## Benefits

✅ Staff can now see admin's conversations  
✅ All team members see shared data  
✅ Easy to add more staff later  
✅ Organization isolation preserved  
✅ Audit trail maintained (accountId shows who did what)  
✅ Backward compatible during migration  
✅ Zero downtime deployment possible  
✅ Simple, clean architecture  


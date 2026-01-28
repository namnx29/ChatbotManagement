# Testing Guide - Staff Access to Admin Data

## Quick Start

These changes fix the issue where **staff accounts couldn't see admin's conversations and messages** even though the organizationId was implemented.

**What Changed**: 
- Route endpoints now use `organizationId` for queries instead of `accountId`
- Authorization checks now compare `organizationId` instead of `accountId`
- Staff and admin in the same organization can now see each other's data

## Deploy & Test

### 1. Deploy Updated Code

Deploy these 2 files:
- `server/routes/facebook.py`
- `server/routes/zalo.py`

No database migration needed - everything is already populated.

### 2. Test Data Setup

Create test accounts:
```
Admin Account:
  accountId: "admin_123"
  organizationId: "org_abc"  (auto-generated)

Staff Account:
  accountId: "staff_456"
  organizationId: "org_abc"  (copied from admin)
```

The migration script already created this, so if you ran `add_organization_id.py`, this data exists.

### 3. Test Cases

#### Test 1: Admin Can See Their Own Conversations

```bash
curl -H "X-Account-Id: admin_123" \
  "http://localhost:5000/api/facebook/conversations?oa_id=page_123"
```

**Expected**: ✓ Conversations returned

#### Test 2: Staff Can Now See Admin's Conversations

```bash
curl -H "X-Account-Id: staff_456" \
  "http://localhost:5000/api/facebook/conversations?oa_id=page_123"
```

**Expected**: ✓ Same conversations as admin (FIXED!)
**Before Fix**: ✗ 403 Unauthorized error

#### Test 3: Staff Can Get Messages from Admin's Conversations

```bash
curl -H "X-Account-Id: staff_456" \
  "http://localhost:5000/api/facebook/conversations/facebook:page_123:customer_456/messages"
```

**Expected**: ✓ Messages returned
**Before Fix**: ✗ Empty or not found

#### Test 4: Staff Can Mark Messages as Read

```bash
curl -X POST -H "X-Account-Id: staff_456" \
  "http://localhost:5000/api/facebook/conversations/facebook:page_123:customer_456/mark-read"
```

**Expected**: ✓ Messages marked as read
**Before Fix**: ✗ 403 Unauthorized error

#### Test 5: Staff Can Send Messages to Admin's Conversations

```bash
curl -X POST \
  -H "X-Account-Id: staff_456" \
  -H "Content-Type: application/json" \
  -d '{"text": "Staff message"}' \
  "http://localhost:5000/api/facebook/conversations/facebook:page_123:customer_456/messages"
```

**Expected**: ✓ Message sent successfully
**Before Fix**: ✗ 403 Unauthorized error

#### Test 6: Different Organizations Cannot See Each Other

```
Org A - Admin: account_A_001, orgId: org_aaa
Org B - Admin: account_B_001, orgId: org_bbb

curl -H "X-Account-Id: account_A_001" \
  "http://localhost:5000/api/facebook/conversations?oa_id=page_999"
```

**Expected**: ✓ Only org_aaa conversations returned
**Should NOT**: See org_bbb conversations (403 error)

## How to Verify in Database

Check that conversations have organizationId populated:

```javascript
// Check a conversation has organizationId
db.conversations.findOne({})
// Should see: { organizationId: "org_abc", accountId: "admin_123", ... }

// Check a message has organizationId
db.messages.findOne({})
// Should see: { organizationId: "org_abc", accountId: "admin_123", ... }

// Check an integration has organizationId
db.integrations.findOne({})
// Should see: { organizationId: "org_abc", accountId: "admin_123", ... }

// Check admin user has organizationId
db.users.findOne({role: 'admin'})
// Should see: { organizationId: "org_abc", role: "admin", ... }

// Check staff user has organizationId (same as admin)
db.users.findOne({role: 'staff', parent_account_id: "admin_123"})
// Should see: { organizationId: "org_abc", role: "staff", ... }
```

## Logs to Watch

After deployment, check logs for:

### Success Indicators
```
Found {N} conversations from organization {org_abc}
Retrieved {N} messages using organization context
Updated {N} messages for organization
```

### Potential Issues
```
organizationId not found for staff account
Unauthorized access attempt
Authorization check failed
```

## Troubleshooting

### "Staff still can't see admin's conversations"

1. **Check organizationId is populated**
   ```javascript
   db.users.findOne({accountId: "staff_456"})
   // Should have organizationId field
   ```

2. **Check integration has organizationId**
   ```javascript
   db.integrations.findOne({platform: 'facebook', oa_id: 'page_123'})
   // Should have organizationId matching the org
   ```

3. **Check logs for authorization errors**
   - Look for "Unauthorized access attempt" messages
   - Check if organizationId values are matching

### "Getting 403 errors after deployment"

This means the organization mismatch. Verify:
- Staff account's `organizationId` matches admin's
- Integration's `organizationId` matches the organization

### "Still getting 403 despite correct organizationId"

Check that you're using the new code:
```
server/routes/facebook.py - Should have "list_by_organization()" calls
server/routes/zalo.py - Should have "list_by_organization()" calls
```

If you see old code like `find_by_oa(oa_id, limit=100, account_id=account_id)` it means the deployment didn't work.

## Summary

After this fix:
- ✓ Staff can see admin's conversations
- ✓ Staff can see messages in those conversations
- ✓ Staff can mark messages as read
- ✓ Staff can send messages to customers
- ✓ Different organizations are isolated
- ✓ Full backward compatibility maintained

All through the magic of `organizationId`!

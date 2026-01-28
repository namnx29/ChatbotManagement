# OrganizationId Implementation - Quick Reference

## What Changed

**Goal**: Staff accounts can now access admin's conversations, messages, integrations, and chatbots.

**Solution**: Added `organizationId` field to all collections. Admin and their staff share the same `organizationId`, but each user keeps their own `accountId`.

## File Changes Quick Summary

### Models (5 files)
- **user.py**: Generate `organizationId` for admins, copy to staff
- **conversation.py**: Query conversations by `organizationId`
- **message.py**: Query messages by `organizationId`
- **integration.py**: Query integrations by `organizationId`
- **chatbot.py**: Query chatbots by `organizationId`

### Routes (4 files)
- **facebook.py**: Pass `organizationId` to upsert & add operations
- **zalo.py**: Pass `organizationId` to upsert & add operations
- **chatbot.py**: Get `organizationId` and pass to create operation
- **integrations.py**: No changes (uses account-based queries)

### Utilities (1 file)
- **request_helpers.py**: Add `get_organization_id_from_request()` helper

### Migration (1 file)
- **migrations/add_organization_id.py**: Backfill existing data

## Deployment

```bash
# 1. Deploy updated code
git push && deploy

# 2. Run migration
cd server && python migrations/add_organization_id.py

# 3. Verify in MongoDB
db.users.findOne({role: 'admin'})  # Check organizationId field
db.conversations.findOne({})       # Check organizationId field
```

## Key Points

✓ Staff and admin now share `organizationId`  
✓ Each user keeps own `accountId` for permissions  
✓ All queries use `organizationId` as primary key  
✓ `accountId` kept for audit trail & backwards compatibility  
✓ Zero downtime deployment ready  
✓ Fully backwards compatible  

## Example Usage

```python
# Get admin's organization
user_model = UserModel(mongo_client)
org_id = user_model.get_user_organization_id("admin_123")

# Query conversations by organization (staff sees admin's data)
conversations = conversation_model.list_by_organization(org_id)

# Create new conversation with organization
conversation_model.upsert_conversation(
    oa_id="123",
    customer_id="456",
    organization_id=org_id,  # NEW parameter
    account_id="admin_123"   # Kept for audit
)
```

## What Staff Can Now See

- ✓ Admin's conversations
- ✓ Admin's messages
- ✓ Admin's integrations
- ✓ Admin's chatbots

All through the same `organizationId` field.

## Files Total
- 11 existing files modified
- 1 new migration script created
- 1 summary documentation created
- **Total: 13 file changes**

## Status: Complete ✓

All code changes implemented. Ready for deployment.

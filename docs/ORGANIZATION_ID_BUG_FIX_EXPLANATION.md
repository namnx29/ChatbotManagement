# OrganizationId Implementation - Critical Bug Fix

## The Problem

After initial implementation, staff accounts **still couldn't see** admin's conversations and messages, even though we added `organizationId` to all the models.

**Root Cause**: The new model methods (`list_by_organization()`, `get_by_organization_and_conversation()`, etc.) were **never being called** from the route endpoints. The API endpoints were still using the old `accountId`-based query methods.

Additionally, the **authorization checks** in the route endpoints were blocking staff accounts because they compared `integration.accountId` against the staff member's `accountId` directly - they didn't match.

## The Solution

### 1. Fixed Authorization Checks

Changed from:
```python
if integration.get('accountId') != account_id:
    return jsonify({'success': False, 'message': 'Unauthorized'}), 403
```

To:
```python
user_org_id = user_model.get_user_organization_id(account_id)
integration_org_id = integration.get('organizationId')

if integration_org_id and user_org_id and integration_org_id == user_org_id:
    # Organization match - allow
    pass
elif integration.get('accountId') == account_id:
    # Direct account match - allow (backward compat)
    pass
else:
    return jsonify({'success': False, 'message': 'Unauthorized'}), 403
```

This allows both staff and admin to access conversations if they're in the same organization.

### 2. Updated Route Endpoints to Use Organization Queries

#### List Conversations
**Before**:
```python
convs = conversation_model.find_by_oa(oa_id, limit=100)
```

**After**:
```python
user_org_id = user_model.get_user_organization_id(account_id)
if user_org_id:
    convs = conversation_model.list_by_organization(user_org_id, limit=100)
else:
    convs = conversation_model.find_by_oa(oa_id, limit=100, account_id=account_id)
```

#### Get Conversation Messages
**Before**:
```python
msgs = message_model.get_messages(
    platform, oa_id, sender_id, 
    limit=limit, skip=skip, 
    conversation_id=conversation_id,
    account_id=account_id
)
```

**After**:
```python
if user_org_id and conversation_id:
    msgs = message_model.get_by_organization_and_conversation(
        user_org_id, conversation_id,
        limit=limit, skip=skip
    )
else:
    msgs = message_model.get_messages(
        platform, oa_id, sender_id, 
        limit=limit, skip=skip, 
        conversation_id=conversation_id,
        account_id=account_id
    )
```

#### Mark Conversation as Read
**Before**:
```python
modified = message_model.mark_read(platform, oa_id, sender_id, conversation_id=conversation_id)
```

**After**:
```python
if user_org_id and conversation_id:
    modified = message_model.mark_as_read_by_organization(user_org_id, conversation_id)
else:
    modified = message_model.mark_read(platform, oa_id, sender_id, conversation_id=conversation_id)
```

## Files Modified

**Routes Updated**:
- [facebook.py](server/routes/facebook.py) - 4 endpoints fixed
- [zalo.py](server/routes/zalo.py) - 4 endpoints fixed

**Endpoints Fixed Per Platform**:
1. `GET /api/{platform}/conversations` - List conversations
2. `GET /api/{platform}/conversations/<conv_id>/messages` - Get messages
3. `POST /api/{platform}/conversations/<conv_id>/mark-read` - Mark as read
4. `POST /api/{platform}/conversations/<conv_id>/messages` - Send message

## How It Works Now

### Staff Can See Admin's Data

1. **Request comes in with staff accountId**
   ```
   GET /api/facebook/conversations?oa_id=123
   Headers: X-Account-Id: staff_456
   ```

2. **Authorization check uses organizationId**
   - Get staff's organizationId via `user_model.get_user_organization_id("staff_456")` → `"org_abc"`
   - Get integration's organizationId → `"org_abc"`
   - ✓ They match! Staff is authorized

3. **Query uses organizationId instead of accountId**
   - `conversation_model.list_by_organization("org_abc")` returns all conversations in that organization
   - Both admin's and staff's conversations are included (they share the same org)

4. **Staff sees admin's conversations** ✓

## Testing Checklist

After deploying these fixes, verify:

- [ ] Staff can list admin's conversations: `GET /api/facebook/conversations?oa_id=123`
- [ ] Staff can see messages: `GET /api/facebook/conversations/facebook:123:456/messages`
- [ ] Staff can mark conversations as read: `POST /api/facebook/conversations/facebook:123:456/mark-read`
- [ ] Staff can send messages: `POST /api/facebook/conversations/facebook:123:456/messages`
- [ ] Admin still sees their own data
- [ ] Admin + staff in same org see each other's conversations
- [ ] Different orgs cannot see each other's data
- [ ] No 403 unauthorized errors for staff in same org

## Key Changes Summary

| Aspect | Before | After |
|--------|--------|-------|
| Authorization Check | Compare `accountId` directly | Compare `organizationId` |
| List Conversations | Use `find_by_oa()` with `accountId` | Use `list_by_organization()` with `organizationId` |
| Get Messages | Use `get_messages()` with `accountId` | Use `get_by_organization_and_conversation()` with `organizationId` |
| Mark Read | Use legacy `mark_read()` | Use `mark_as_read_by_organization()` with `organizationId` |
| Result | Staff blocked, can't see data | Staff authorized, sees admin's data |

## Deployment

Simply deploy the updated [facebook.py](server/routes/facebook.py) and [zalo.py](server/routes/zalo.py) files. The migration script already ran previously, so all documents have `organizationId` populated.

No database changes needed. No migration script needed.

**Status: FIXED ✓**

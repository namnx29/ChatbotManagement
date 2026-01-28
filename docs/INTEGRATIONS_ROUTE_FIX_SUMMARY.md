# Integrations Route Fixes - organizationId Integration

## Overview
Fixed all endpoints in `server/routes/integrations.py` to support organizationId, enabling staff accounts to access admin's integrations while maintaining security.

## Files Modified

### 1. `server/routes/integrations.py`

#### Endpoint 1: `list_integrations()` (Line 13)
**Change**: Now supports organizationId-based access
- **Before**: Only returned integrations for the requesting account
- **After**: Returns organization's integrations for staff, account's for admin
- **Key Change**: Imports UserModel to get organization context
  ```python
  user_org_id = user_model.get_user_organization_id(account_id)
  if user_org_id:
      items = model.find_by_organization(user_org_id, ...)  # Staff: org-level access
  else:
      items = model.find_by_account(account_id, ...)  # Admin: account-level access
  ```

#### Endpoint 2: `activate_integration()` (Line 33)
**Change**: Authorization check now supports organizationId
- **Before**: Only checked if `integration.accountId == account_id`
- **After**: Checks both organization match (for staff) and account match (for admin)
- **Authorization Logic**:
  ```python
  if user_org_id and existing.get('organizationId') == user_org_id:
      # Staff in same organization - allowed
  elif existing.get('accountId') != account_id:
      # Not admin's integration - rejected
  ```

#### Endpoint 3: `deactivate_integration()` (Line 47)
**Change**: Same as activate_integration
- Authorization check updated to support organizationId
- Staff can deactivate integrations in same organization

#### Endpoint 4: `delete_integration()` (Line 64)
**Change**: Authorization check now supports organizationId
- **Before**: Only allowed if `existing.accountId == account_id`
- **After**: Allows deletion if in same organization OR account matches
- **Authorization Pattern**: Same as activate/deactivate endpoints

#### Endpoint 5: `get_all_conversations()` (Line 105)
**Change**: Major refactor to support organizationId for conversation aggregation
- **Before**: Only aggregated conversations from requesting account's chatbots
- **After**: Aggregates conversations from organization's chatbots (for staff) or account's chatbots (for admin)
- **Key Changes**:
  1. Gets user's organizationId using UserModel
  2. Uses `list_chatbots_by_organization()` for organization-level access
  3. Passes `organization_id` parameter to `find_by_chatbot_id()`
  4. Staff sees admin's shared conversations and chatbots
  ```python
  user_org_id = user_model.get_user_organization_id(account_id)
  if user_org_id:
      account_chatbots = chatbot_model.list_chatbots_by_organization(user_org_id)
      conversations = conversation_model.find_by_chatbot_id(
          chatbot_id, 
          limit=2000, 
          organization_id=user_org_id  # <-- CRITICAL: Org-level filtering
      )
  ```

#### Endpoint 6: `update_conversation_nickname()` (Line 244)
**Change**: Authorization and update now support organizationId
- **Before**: Only updated if `account_id == account_id` (always true)
- **After**: Gets organization context and passes it to update method
- **Key Changes**:
  1. Imports UserModel to get organizationId
  2. Passes `organization_id` to `update_nickname()` method
  3. Staff can update nicknames in shared organization conversations
  4. Fixed incorrect `_serialize()` parameter (removed `current_user_id`)
  ```python
  user_org_id = user_model.get_user_organization_id(account_id)
  updated_conv = conv_model.update_nickname(
      oa_id=oa_id, 
      customer_id=customer_id, 
      user_id=account_id, 
      nick_name=nick_name,
      account_id=account_id,
      organization_id=user_org_id  # <-- NEW: Organization context
  )
  ```

### 2. `server/models/conversation.py`

#### Method 1: `find_by_chatbot_id()` (Line 290)
**Change**: Added `organization_id` parameter for org-level filtering
- **Before**: Only had `account_id` parameter
- **After**: 
  ```python
  def find_by_chatbot_id(self, chatbot_id, limit=2000, skip=0, account_id=None, organization_id=None):
      query = {'chatbot_id': chatbot_id}
      if organization_id:
          query['organizationId'] = organization_id  # Primary: org-level
      elif account_id:
          query['accountId'] = account_id  # Fallback: account-level
  ```

#### Method 2: `update_nickname()` (Line 307)
**Change**: Added `organization_id` parameter for org-level updates
- **Before**: Only supported account-level updates via `account_id`
- **After**: 
  ```python
  def update_nickname(self, oa_id, customer_id, user_id, nick_name, account_id=None, organization_id=None):
      query = {'oa_id': oa_id, 'customer_id': customer_id}
      if organization_id:
          query['organizationId'] = organization_id  # Primary: org-level
      elif account_id:
          query['accountId'] = account_id  # Fallback: account-level
  ```

## Security Impact

### Staff Account Capabilities (After Fix)
✅ Staff can now access:
1. Admin's shared chatbots (via `list_chatbots_by_organization()`)
2. Admin's shared conversations (via `find_by_chatbot_id(organization_id=...)`)
3. Conversation details (read, timestamps, messages)
4. Update conversation nicknames
5. Activate/deactivate integrations (with organization match)

### Data Isolation Maintained
✅ Isolation enforced by:
1. organizationId-based queries (primary)
2. Authorization checks comparing organizationId
3. Fallback to accountId for backward compatibility
4. Staff can only access data in their assigned organization

## Testing Checklist

### Test Staff Access
- [ ] Staff can call `GET /api/integrations` and see admin's integrations
- [ ] Staff can call `GET /api/integrations/conversations/all` and see admin's conversations
- [ ] Staff can call `POST /api/integrations/conversations/nickname` and update nicknames
- [ ] Staff can call `POST /api/integrations/<id>/activate` and activate integrations (if in same org)

### Test Admin Access (Unchanged)
- [ ] Admin can still list own integrations
- [ ] Admin can still list own conversations
- [ ] Admin can still update own conversation nicknames
- [ ] Admin can still manage own integrations

### Test Authorization
- [ ] Staff from Organization A cannot access Organization B's data
- [ ] Staff cannot activate/delete integrations outside their organization
- [ ] Admin can access all their own data regardless of organization

## Implementation Pattern Summary

**Consistent pattern across all endpoints:**
```python
# 1. Get user's organization context
user_org_id = user_model.get_user_organization_id(account_id)

# 2. Use organization-based methods if available, fallback to account-based
if user_org_id:
    data = model.list_by_organization(user_org_id, ...)  # Staff path
else:
    data = model.find_by_account(account_id, ...)  # Admin path

# 3. Pass organization_id to methods that support it
model.update_method(..., organization_id=user_org_id)
```

## Backward Compatibility

All changes maintain backward compatibility:
- Old account-based methods still exist and work
- organizationId is used when available, falls back to accountId
- No breaking changes to API contracts

## Related Files

The following supporting files are already implemented:
- `server/models/user.py` - `get_user_organization_id()` method
- `server/models/chatbot.py` - `list_chatbots_by_organization()` method
- `server/models/integration.py` - `find_by_organization()` method
- `server/migrations/add_organization_id.py` - Data migration script

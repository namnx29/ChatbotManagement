# Integration Routes Testing Guide

## Quick Test Checklist

### Setup
- [ ] Have admin account ID ready
- [ ] Have staff account ID ready (from same organization as admin)
- [ ] Have staff account ID from different organization
- [ ] Start server: `python app.py`

### Test Commands

#### Test 1: Staff Lists Admin's Integrations
```bash
# Staff from Admin's Organization
curl -X GET "http://localhost:5000/api/integrations" \
  -H "Authorization: Bearer $STAFF_TOKEN"

# Expected: Returns admin's integrations (organizationId-based query)
# HTTP 200
# [
#   {
#     "id": "...",
#     "platform": "facebook",
#     "oa_id": "...",
#     "accountId": "<admin_id>",
#     "organizationId": "<org_id>"
#   }
# ]
```

#### Test 2: Staff Gets All Conversations
```bash
curl -X GET "http://localhost:5000/api/integrations/conversations/all" \
  -H "Authorization: Bearer $STAFF_TOKEN"

# Expected: Returns conversations from admin's chatbots (organizationId-based query)
# HTTP 200
# [
#   {
#     "id": "...",
#     "customer_id": "...",
#     "oa_id": "...",
#     "platform": "facebook",
#     "name": "Customer Name"
#   }
# ]
```

#### Test 3: Staff Activates Admin's Integration
```bash
INTEGRATION_ID="<admin_integration_id>"

curl -X POST "http://localhost:5000/api/integrations/${INTEGRATION_ID}/activate" \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json"

# Expected: Integration activated (organizationId authorization check passed)
# HTTP 200
# {
#   "success": true,
#   "data": { "id": "...", "active": true }
# }
```

#### Test 4: Staff Deactivates Admin's Integration
```bash
curl -X POST "http://localhost:5000/api/integrations/${INTEGRATION_ID}/deactivate" \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json"

# Expected: Integration deactivated (organizationId authorization check passed)
# HTTP 200
# {
#   "success": true,
#   "data": { "id": "...", "active": false }
# }
```

#### Test 5: Staff Updates Conversation Nickname
```bash
curl -X POST "http://localhost:5000/api/integrations/conversations/nickname" \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "oa_id": "<oa_id>",
    "customer_id": "<customer_id>",
    "nick_name": "VIP Customer"
  }'

# Expected: Nickname updated (organizationId-based update)
# HTTP 200
# {
#   "success": true,
#   "data": { "id": "...", "nicknames": { "<staff_id>": "VIP Customer" } }
# }
```

#### Test 6: Staff Deletes Admin's Integration
```bash
curl -X DELETE "http://localhost:5000/api/integrations/${INTEGRATION_ID}" \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json"

# Expected: Integration deleted (organizationId authorization check passed)
# HTTP 200
# {
#   "success": true,
#   "data": { "deleted": true }
# }
```

#### Test 7: Cross-Organization Staff CANNOT Access
```bash
# Staff from Organization B trying to access Organization A's data
STAFF_ORG_B_TOKEN="..."
INTEGRATION_FROM_ORG_A="..."

curl -X POST "http://localhost:5000/api/integrations/${INTEGRATION_FROM_ORG_A}/activate" \
  -H "Authorization: Bearer $STAFF_ORG_B_TOKEN" \
  -H "Content-Type: application/json"

# Expected: Forbidden (organizationId mismatch)
# HTTP 403
# {
#   "success": false,
#   "message": "Not authorized"
# }
```

## Detailed Testing Scenarios

### Scenario A: Full Staff Workflow

**Setup**:
- Admin account: `admin_001`
- Staff account: `staff_001` (in admin_001's organization)
- Integration: Facebook page with ID `facebook_integration_123`
- Conversation: Customer conversation with ID `conv_001`

**Steps**:
1. Admin logs in, creates Facebook integration
2. Admin creates conversation with customer
3. Staff logs in (auto-assigned to admin's organization)
4. Staff calls `GET /api/integrations`
   - ✅ Should see the Facebook integration
5. Staff calls `GET /api/integrations/conversations/all`
   - ✅ Should see the customer conversation
6. Staff calls `POST /api/integrations/<id>/activate`
   - ✅ Should succeed (staff in same org)
7. Staff calls `POST /api/integrations/conversations/nickname`
   - ✅ Should update nickname (organizationId matches)
8. Staff calls `DELETE /api/integrations/<id>`
   - ✅ Should succeed (staff in same org)

### Scenario B: Admin Workflow (Unchanged)

**Setup**:
- Admin account: `admin_001`
- Integration: Facebook page with ID `facebook_integration_123`

**Steps**:
1. Admin calls `GET /api/integrations`
   - ✅ Should see own integrations (accountId-based, no org restriction)
2. Admin calls `GET /api/integrations/conversations/all`
   - ✅ Should see own conversations (accountId-based)
3. Admin calls `POST /api/integrations/<id>/activate`
   - ✅ Should succeed (accountId matches)
4. Admin calls `POST /api/integrations/conversations/nickname`
   - ✅ Should update nickname (accountId matches)
5. Admin calls `DELETE /api/integrations/<id>`
   - ✅ Should succeed (accountId matches)

### Scenario C: Cross-Organization Rejection

**Setup**:
- Organization A: Admin `admin_a_001`, Staff `staff_a_001`
- Organization B: Admin `admin_b_001`, Staff `staff_b_001`
- Integration in Org A: `integration_a_123`

**Steps**:
1. Staff B calls `POST /api/integrations/integration_a_123/activate`
   - ❌ Should fail with 403 (organizationId mismatch)
   - Expected message: "Not authorized"
2. Staff B calls `GET /api/integrations`
   - ✅ Should see only Org B's integrations, not Org A's
3. Staff B calls `DELETE /api/integrations/integration_a_123`
   - ❌ Should fail with 403 (organizationId mismatch)

## Expected HTTP Status Codes

| Endpoint | Success | Auth Failed | Not Found |
|----------|---------|-------------|-----------|
| GET /api/integrations | 200 | 400* | N/A |
| GET /api/integrations/conversations/all | 200 | 400* | N/A |
| POST .../activate | 200 | 403 | 404 |
| POST .../deactivate | 200 | 403 | 404 |
| POST .../conversations/nickname | 200 | 403 | 404 |
| DELETE /api/integrations/<id> | 200 | 403 | 404 |

*Note: Missing Account ID returns 400, not 403

## Code Changes Summary (For Debugging)

If tests fail, check these specific changes:

### integrations.py
- Lines 13-30: `list_integrations()` should check `user_org_id` first
- Lines 35-60: `activate_integration()` should compare `organizationId`
- Lines 63-88: `deactivate_integration()` should compare `organizationId`
- Lines 91-116: `delete_integration()` should compare `organizationId`
- Lines 132-242: `get_all_conversations()` should use `find_by_chatbot_id(organization_id=...)`
- Lines 244-280: `update_conversation_nickname()` should pass `organization_id=user_org_id`

### conversation.py
- Line 290: `find_by_chatbot_id()` should have `organization_id=None` parameter
- Line 307: `update_nickname()` should have `organization_id=None` parameter

## Troubleshooting

### Staff Can't See Admin's Data
**Check**:
1. Does staff account have `organizationId` field set to admin's organizationId?
   ```python
   # In MongoDB
   db.users.find({"_id": "staff_001"}).pretty()
   # Should show: "organizationId": "<admin_org_id>"
   ```
2. Is the model method being called with `organization_id` parameter?
   ```python
   # Check logs for:
   # "Found X chatbots for organization <org_id>"
   ```
3. Are documents in database populated with `organizationId`?
   ```python
   # In MongoDB
   db.integrations.findOne({"_id": "integration_123"})
   # Should have: "organizationId": "<org_id>"
   ```

### Cross-Org Access Not Blocked
**Check**:
1. Is authorization check comparing `organizationId`?
   ```python
   if user_org_id and existing.get('organizationId') == user_org_id:
   ```
2. Are the `organizationId` values different between staff and resource?
3. Check response: should be 403 with "Not authorized"

### Method Not Found Error
**Check**:
1. Is UserModel imported: `from models.user import UserModel`?
2. Is method `get_user_organization_id()` defined in models/user.py?
3. Is `list_chatbots_by_organization()` defined in models/chatbot.py?
4. Is `find_by_organization()` defined in models/integration.py?

## Performance Considerations

### Indexes Recommended
```python
# MongoDB indexes for performance
db.integrations.createIndex({"organizationId": 1})
db.conversations.createIndex({"organizationId": 1, "chatbot_id": 1})
db.chatbots.createIndex({"organizationId": 1})
```

### Expected Performance
- `list_integrations()`: ~10-50ms (depends on number of integrations)
- `get_all_conversations()`: ~100-500ms (aggregates multiple chatbots)
- `update_nickname()`: ~10-20ms (single document update)

## Log Patterns to Watch

### Success Logs
```
INFO: Found X chatbots for organization <org_id>
INFO: Found Y conversations for account <account_id>
INFO: Successfully updated conversation nickname
```

### Error Logs
```
WARNING: Not authorized - organizationId mismatch
WARNING: Integration not found for <integration_id>
ERROR: Error updating nickname: <exception>
```

## Related Endpoints Not Modified

The following endpoints were NOT modified (still account-based):
- POST /api/integrations/create - Admin only
- PUT /api/integrations/<id> - Admin only
- GET /api/integrations/stats - Admin only (if exists)

These remain account-based as they're admin-only operations.

# Complete Security Fix Summary: Cross-Account Data Leakage

## Overview

Implemented a **two-layer security fix** for cross-account conversation data leakage:

1. **API Layer:** Account ownership validation on all conversation endpoints
2. **WebSocket Layer:** Account-based room filtering for real-time broadcasts

---

## The Vulnerability (FIXED ✅)

### Scenario
- **Account A** integrates Facebook Page "XYZ"
- **Account B** could see conversations from Page "XYZ" in real-time
- Messages would appear via WebSocket, disappear after page reload

### Root Causes

**Layer 1: API Endpoints** - No account validation
- Endpoint accepted `oa_id` without checking if account owned it
- Example: `GET /api/facebook/conversations?oa_id=XYZ` without account check

**Layer 2: WebSocket Broadcasts** - Unfiltered to all clients
- Webhook broadcasts to ALL connected clients
- No filtering by account_id

---

## Implementation Summary

### Layer 1: API-Level Authorization (Account Validation)

**Protected Endpoints:**

| Endpoint | Platform | Fix |
|----------|----------|-----|
| GET /api/facebook/conversations | Facebook | ✅ Validate account owns oa_id |
| GET /api/facebook/conversations/<conv_id>/messages | Facebook | ✅ Validate account owns oa_id |
| POST /api/facebook/conversations/<conv_id>/mark-read | Facebook | ✅ Validate account owns oa_id |
| GET /api/zalo/conversations | Zalo | ✅ Validate account owns oa_id |
| GET /api/zalo/conversations/<conv_id>/messages | Zalo | ✅ Validate account owns oa_id |
| POST /api/zalo/conversations/<conv_id>/mark-read | Zalo | ✅ Validate account owns oa_id |

**Check Pattern:**
```python
# Before: No check
convs = conversation_model.find_by_oa(oa_id)

# After: Account ownership validated
integration = integration_model.find_by_platform_and_oa(platform, oa_id)
if not integration or integration.get('accountId') != account_id:
    return jsonify({'success': False, 'message': 'Unauthorized'}), 403
convs = conversation_model.find_by_oa(oa_id)
```

### Layer 2: WebSocket Room Filtering (Account Isolation)

**Modified Functions:**

| File | Function | Change |
|------|----------|--------|
| server/routes/facebook.py | `_emit_socket()` | Updated to support `account_id` parameter |
| server/routes/zalo.py | `_emit_socket_to_account()` | New function for account-aware emits |
| server/app.py | `@socketio.on('connect')` | New handler to join account rooms |

**Emit Pattern:**
```python
# Before: Broadcast to all
socketio.emit('update-conversation', payload, broadcast=True)

# After: Emit to account room only
socketio.emit('update-conversation', payload, room=f"account:{account_id}")
```

**Connection Flow:**
```
1. User logs in → account_id = "user_123"
2. WebSocket connects → connect handler fires
3. Handler joins room → f"account:user_123"
4. All future events sent to "account:user_123" room
5. Only users in that room receive events
```

---

## Files Modified

### 1. server/routes/facebook.py
- **_emit_socket()** - Enhanced with account_id parameter for room-based filtering
- **webhook_event()** - Extract account_id from integration and pass to emits
- **send_conversation_message()** - Pass account_id to socket emits
- All conversation list endpoints - Added account ownership validation

### 2. server/routes/zalo.py
- **_emit_socket_to_account()** - New function for account-aware emits
- **webhook_event()** - Extract account_id from integration and use new emit function
- **send_conversation_message()** - Use account-aware emits
- All conversation list endpoints - Added account ownership validation

### 3. server/app.py
- **@socketio.on('connect')** - New handler to automatically join account-specific rooms
- Extracts authenticated user's account_id
- Joins room: `account:{account_id}`

---

## Security Benefits

### Before Fix
```
WebSocket Connection (User B)
↓
Webhook triggers (Customer message to Account A's page)
↓
socketio.emit('update-conversation', ..., broadcast=True)
↓
BROADCAST TO ALL CONNECTED CLIENTS ← VULNERABILITY
↓
User B sees conversation appear in sidebar ← DATA LEAK
```

### After Fix
```
WebSocket Connection (User B) → Joins room "account:B"
↓
Webhook triggers (Customer message to Account A's page)
↓
socketio.emit('update-conversation', ..., room="account:A")
↓
EVENT SENT ONLY TO ACCOUNT A'S ROOM ← SECURE
↓
User B does NOT receive event ← DATA LEAK BLOCKED
```

---

## Testing the Fix

### Test 1: API Authorization
```bash
# Try to access Account A's conversation as Account B
curl -H "X-Account-Id: account_b" \
     "http://localhost:5000/api/facebook/conversations?oa_id=page_by_a"

# Expected: 403 Unauthorized
# {
#   "success": false,
#   "message": "Unauthorized access to this page"
# }
```

### Test 2: WebSocket Isolation
```javascript
// Browser 1: Account A
const socket1 = io('http://localhost:5000', {
  auth: { account_id: 'account_a' }
});
// → Joins room "account:account_a"

// Browser 2: Account B  
const socket2 = io('http://localhost:5000', {
  auth: { account_id: 'account_b' }
});
// → Joins room "account:account_b"

// Send message to Account A's page
// ✅ Socket1 receives update
// ✅ Socket2 does NOT receive update
```

### Test 3: Real-Time Behavior
1. **Login as Account A** with Account A's page
2. **Open Account B in another window** with Account A's page (unauthorized)
3. **Send message from customer to Account A's page**
   - ✅ Appears in Account A's UI
   - ✅ Does NOT appear in Account B's UI
4. **Reload Account B's page**
   - ✅ Conversation does NOT appear (API blocks)
5. **Real-time isolation maintained** ✅

---

## Response Codes

| Scenario | Status | Response |
|----------|--------|----------|
| Unauthorized account accessing oa_id | 403 | `{"success": false, "message": "Unauthorized access..."}` |
| Integration not found | 404 | `{"success": false, "message": "Integration not found"}` |
| Authorization check fails | 500 | `{"success": false, "message": "Authorization check failed"}` |
| Valid access | 200 | Conversation data returned |

---

## Deployment Notes

### Requirements
- Flask-SocketIO installed (already in requirements.txt)
- `join_room` import available from flask_socketio
- MongoDB accounts properly set up with accountId field

### Configuration
No configuration changes needed. Room names are automatically generated as:
```
room = f"account:{account_id}"
```

### Backward Compatibility
- Old WebSocket connections without authentication will not be added to rooms (safe)
- API calls without account_id header are already rejected (safe)
- No breaking changes to existing APIs

---

## Monitoring

### Server Logs
Look for:
```
INFO: User user_123 connected and joined room account:user_123
INFO: Emitted new-message to room account:user_123
WARNING: Unauthorized access attempt: account account_b tried to access oa_id page_a_id owned by account_a
```

### Metrics to Monitor
- Unauthorized access attempts (should be 0 for legitimate usage)
- WebSocket connections per account
- Room broadcast frequency

---

## Future Enhancements

1. **Chatbot-Level Isolation** - Further isolate by chatbotId if needed
2. **Rate Limiting** - Add rate limits on unauthorized attempts
3. **Audit Logging** - Log all failed authorization attempts
4. **WebSocket Auth** - Use token-based WebSocket authentication
5. **Conversation Encryption** - Encrypt conversation data in transit

---

## Related Documentation

- [SECURITY_FIXES_ACCOUNT_ISOLATION.md](SECURITY_FIXES_ACCOUNT_ISOLATION.md) - API-level fixes
- [WEBSOCKET_SECURITY_FIX.md](WEBSOCKET_SECURITY_FIX.md) - WebSocket implementation details

---

## Summary

✅ **Cross-Account Data Leakage: FIXED**
- API endpoints now validate account ownership
- WebSocket broadcasts filtered by account room
- Defense-in-depth approach prevents data leakage at multiple layers
- No legitimate access is blocked
- All conversation data properly isolated by account

# Widget Messaging Issues - Detailed Root Cause & Comprehensive Fixes

## Problem Summary

You reported THREE interconnected issues:

1. **Messages from website (staff) to widget are NOT received by the widget**
2. **After first message from widget, subsequent messages return 400 BAD REQUEST**
3. **When reloading the message page, messages sent FROM widget show up as if sent BY website** ❌

The third issue indicates a **message direction problem** in addition to the conversation ID problem.

---

## Root Cause Analysis

### Issue #1 & #2: Socket Listener & Conversation ID Mismatch

**Root Cause:** The socket listener was incorrectly configured in the widget component:

```javascript
useEffect(() => {
    if (!orgId || !accountId) return;
    socketRef.current = io(...);
    socketRef.current.on('new-message', (payload) => {
        if (payload.direction === 'out' && conversationId) {
            // Try to match...
        }
    });
    return () => {
        socketRef.current.disconnect();  // ❌ PROBLEM: This disconnects on EVERY conversationId change
    };
}, [orgId, accountId, conversationId]);  // ❌ Socket recreated when conversationId changes
```

**Problems:**
1. Socket is **recreated every time conversationId changes** (too many times!)
2. When socket is destroyed and recreated, it loses its room memberships
3. The listener capture `conversationId` in a closure, but it may be `null` initially
4. When `conversationId` finally loads from localStorage or API response, the listener isn't updated because the socket already disconnected

**The Fix Applied:**
- Split into **TWO separate useEffects**:
  - **Effect #1**: Initialize socket ONCE (only when orgId/accountId change)
  - **Effect #2**: Register message listener (update when conversationId changes, without recreating socket)

```javascript
// Effect 1: Socket stays alive for entire widget lifetime
useEffect(() => {
    if (!orgId || !accountId) return;
    if (socketRef.current) return;  // Only create once
    
    socketRef.current = io(...);
    return () => {
        // Don't disconnect - just remove old listeners
        socketRef.current?.off('new-message');
    };
}, [orgId, accountId]);

// Effect 2: Re-register listener when conversationId changes
useEffect(() => {
    if (!socketRef.current || !conversationId) return;
    
    const handleNewMessage = (payload) => {
        if (payload.direction === 'out' && payload.conv_id === conversationId) {
            // Add message
        }
    };
    
    socketRef.current.on('new-message', handleNewMessage);
    return () => socketRef.current?.off('new-message', handleNewMessage);
}, [conversationId]);
```

### Issue #3: Messages Show Direction Reversed on Reload

**Root Cause:** The messages are being stored WITH the correct direction in the database, but when reloading, there might be an issue with how the direction is being displayed or interpreted.

Looking at your screenshot: messages from widget user "K" showing "abcc" appear on the LEFT side (bot messages), then staff messages appear on the RIGHT side (user messages). This suggests:

1. Either the **direction is reversed in the database**
2. Or the **sender/receiver logic in the dashboard is flipped**

Since this is happening on reload, not in real-time, the issue is likely in the **GET /messages endpoint** or how the dashboard displays messages.

Let me check the widget lead endpoint again - specifically the `direction` of messages:

```python
message_doc = msg_model.add_message(
    platform='widget',
    oa_id=oa_id,
    sender_id=customer_id,  # Customer sending
    direction='in',  # ✅ Correct: incoming to staff
    text=message,
    ...
)
```

When staff replies:

```python
message_doc = message_model.add_message(
    platform='widget',
    oa_id=oa_id,
    sender_id=sender_id,  # ⚠️ Problem: This is the CUSTOMER_ID, not staff_id!
    direction='out',  # Outgoing from staff
    text=text,
    ...
)
```

**Found it!** When staff sends a message in `send_conversation_message()`:

```python
sender_id=sender_id,  # This comes from the URL parameter: widget:oa_id:customer_uuid
```

So the message is stored with:
- `sender_id = widget:uuid` (customer)
- `direction = 'out'` (from staff)

This is **semantically wrong**! The `sender_id` should be the staff member, not the customer. The direction is correct, but the `sender_id` is misleading.

This explains why when you reload:
- **Widget messages** have `sender_id=widget:uuid`, `direction='in'` → Display as "from customer" ✅
- **Staff messages** have `sender_id=widget:uuid`, `direction='out'` → Display as "from customer" but marked outgoing → **Looks like it came from staff but appears on customer's side** ❌

---

## Fixes Applied

### Fix #1: Split Socket Effects (✅ DONE)

**File:** `client/app/widget/lead-form/page.jsx`

- Socket is initialized once and kept alive
- Message listener is registered separately with conversationId dependency
- Added extensive console logging to debug issues

### Fix #2: Return formatted conv_id from API (✅ DONE)

**File:** `server/routes/widget.py`

```python
conv_id_formatted = f"widget:{oa_id}:{customer_id.replace('widget:', '')}"
return jsonify({
    'success': True,
    'conversation_id': conversation_id_str,
    'conv_id': conv_id_formatted,  # ← Added this
    ...
})
```

### Fix #3: Use formatted conv_id in client (✅ DONE)

**File:** `client/app/widget/lead-form/page.jsx`

- Store `data.conv_id` (formatted) instead of `data.conversation_id` (ObjectId)
- Use it for API calls and socket matching

### Fix #4: Fix sender_id in staff outgoing messages (🔧 NEEDS IMPLEMENTATION)

**Issue:** When staff sends a message, `sender_id` should be the staff member, not the customer

**Current code** (widget.py line 345):

```python
message_doc = message_model.add_message(
    platform='widget',
    oa_id=oa_id,
    sender_id=sender_id,  # ❌ This is customer_uuid, should be staff_id
    direction='out',
    text=text,
    ...
)
```

**Should be:**

```python
message_doc = message_model.add_message(
    platform='widget',
    oa_id=oa_id,
    sender_id=account_id,  # Staff ID, not customer
    direction='out',
    text=text,
    ...
)
```

---

## Implementation Status

| Fix | Status | File | Notes |
|-----|--------|------|-------|
| #1 Socket split | ✅ APPLIED | `client/app/widget/lead-form/page.jsx` | New implementation with better logging |
| #2 Return conv_id | ✅ APPLIED | `server/routes/widget.py` | Lead endpoint returns formatted ID |
| #3 Use conv_id | ✅ APPLIED | `client/app/widget/lead-form/page.jsx` | Stores and uses formatted ID |
| #4 Fix sender_id | 🔧 PENDING | `server/routes/widget.py` line 345 | Need to change to staff's account_id |

---

## Remaining Issue to Fix

In `server/routes/widget.py`, around line 340-350, change:

```python
# BEFORE:
message_doc = message_model.add_message(
    platform='widget',
    oa_id=oa_id,
    sender_id=sender_id,  # ❌ This is customer_uuid
    direction='out',
    text=text,
    metadata=metadata,
    is_read=True,
    conversation_id=conversation_id,
    organization_id=org_id,
    account_id=account_id
)

# AFTER:
message_doc = message_model.add_message(
    platform='widget',
    oa_id=oa_id,
    sender_id=account_id,  # ✅ Use staff's account_id
    direction='out',
    text=text,
    metadata=metadata,
    is_read=True,
    conversation_id=conversation_id,
    organization_id=org_id,
    account_id=account_id
)
```

---

## Testing Checklist

After applying the remaining fix:

- [ ] Send message FROM widget → should receive 200 OK (not 400)
- [ ] Send first message → conversation created with formatted conv_id
- [ ] Send subsequent messages → all return 200 OK
- [ ] Staff sends message to widget → widget receives via socket in real-time
- [ ] Reload message page → messages show on correct side (customer left, staff right)
- [ ] Socket reconnection → properly handles reconnects without losing messages

---

## Console Logging Added

The new widget code includes detailed logging to help debug:

```javascript
Console output when working correctly:
✅ Socket connected: socket_id
📨 Registering message listener for conversationId: widget:widget:abc123
📨 Socket new-message event received: {direction: "out", conv_id: "widget:widget:abc123"}
Comparing conv_ids: {incoming: "widget:widget:abc123", stored: "widget:widget:abc123", match: true}
✅ Adding staff message to chat: {text: "...", sender: "bot"}
```

If something is wrong:

```javascript
⚠️ Socket not initialized yet
⚠️ conversationId not set yet
❌ Skipped: conversation ID mismatch
❌ API error: 400
```

Check browser console to debug further issues.

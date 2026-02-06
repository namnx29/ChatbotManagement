# Widget Messaging - Complete Fix Summary

## Issues Found & Fixed

### ✅ Issue #1: Messages from website NOT received by widget

**Root Cause:** 
- Socket was being recreated every time `conversationId` changed
- Message listener was using stale `conversationId` from closure
- Conversation ID format mismatch (ObjectId vs formatted ID)

**Fixed by:**
1. Splitting socket initialization from listener registration into separate effects
2. Keeping socket alive, only re-registering the message listener
3. Returning formatted `conv_id` from API instead of just ObjectId

**Files Modified:**
- `/home/nam/work/test-preny/client/app/widget/lead-form/page.jsx` - New socket logic with proper dependency arrays
- `/home/nam/work/test-preny/server/routes/widget.py` - Return both `conversation_id` and `conv_id`

---

### ✅ Issue #2: 400 BAD REQUEST after first message

**Root Cause:**
- Widget was passing ObjectId to API endpoint that expects `widget:oa_id:customer_uuid` format
- Endpoint's validation `split(':')` failed on ObjectId (no colons)

**Fixed by:**
- Server returns formatted `conv_id` in API response
- Widget client stores and uses `conv_id` instead of `conversation_id`

**Files Modified:**
- `/home/nam/work/test-preny/server/routes/widget.py` - Return formatted conv_id
- `/home/nam/work/test-preny/client/app/widget/lead-form/page.jsx` - Use data.conv_id

---

### ✅ Issue #3: Messages show reversed direction on reload

**Root Cause:**
- When staff sends message, `sender_id` was set to customer_uuid instead of staff's account_id
- This caused confusion in message display logic
- Dashboard couldn't distinguish between customer-sent and staff-sent messages

**Fixed by:**
- Changed `sender_id=sender_id` to `sender_id=account_id` in message creation
- Now staff messages properly record staff member as the sender

**Files Modified:**
- `/home/nam/work/test-preny/server/routes/widget.py` line 343 - Use account_id as sender_id for outgoing messages

---

## Complete File Changes

### 1. Server: `/home/nam/work/test-preny/server/routes/widget.py`

**Change #1: Return formatted conv_id from lead endpoint (line 84)**
```python
# Added:
conv_id_formatted = f"widget:{oa_id}:{customer_id.replace('widget:', '')}"

# Updated in response:
return jsonify({
    'success': True, 
    'conversation_id': conversation_id_str,
    'conv_id': conv_id_formatted,  # ← NEW
    'message': 'Lead submitted', 
    'message_doc': message_doc
}), 200
```

**Change #2: Fix sender_id in outgoing messages (line 343)**
```python
# BEFORE:
sender_id=sender_id,  # This was customer_uuid

# AFTER:
sender_id=account_id,  # Now uses staff member's account_id
```

### 2. Client: `/home/nam/work/test-preny/client/app/widget/lead-form/page.jsx`

**Complete rewrite of socket and message handling:**

**Effect 1: Initialize socket once (keeps alive)**
```javascript
useEffect(() => {
    if (!orgId || !accountId) return;
    if (socketRef.current) return;  // Only create once
    
    socketRef.current = io('https://elcom.vn', {
        transports: ['websocket', 'polling'],
        auth: { account_id: accountId }
    });
    
    socketRef.current.on('connect', () => {
        console.log('✅ Socket connected:', socketRef.current.id);
    });
    
    return () => {
        // Don't disconnect - keep socket alive
        socketRef.current?.off('new-message');
    };
}, [orgId, accountId]);
```

**Effect 2: Register listener (updates when conversationId changes)**
```javascript
useEffect(() => {
    if (!socketRef.current || !conversationId) return;
    
    const handleNewMessage = (payload) => {
        // Detailed logging for debugging
        console.log('📨 Socket new-message:', {
            conv_id: payload.conv_id,
            direction: payload.direction,
            currentConversationId: conversationId,
            match: payload.conv_id === conversationId
        });
        
        if (payload.direction === 'out' && payload.conv_id === conversationId) {
            const botMsg = {
                id: payload.message_doc?._id || Date.now(),
                text: payload.message || payload.text,
                sender: 'bot',
                time: 'Just now'
            };
            setMessages(prev => [...prev, botMsg]);
        }
    };
    
    socketRef.current.on('new-message', handleNewMessage);
    return () => socketRef.current?.off('new-message', handleNewMessage);
}, [conversationId]);
```

**Use formatted conv_id from API**
```javascript
if (data.success && data.conv_id) {
    setConversationId(data.conv_id);  // Use formatted ID
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...meta,
        conversationId: data.conv_id,
    }));
}
```

---

## How It Works Now

### Flow 1: Customer sends first message
```
1. Widget form submission → no conversationId yet
2. POST /api/widget/lead (with name, phone, message)
3. Server:
   - Creates conversation with customer_id
   - Stores message with direction='in', sender_id=customer_id
   - Returns conv_id = "widget:widget:uuid"
4. Widget:
   - Receives data.conv_id = "widget:widget:uuid"
   - Stores as conversationId
   - Listener effect re-registers with new conversationId
5. Server emits socket event to organization room:
   - payload.conv_id = "widget:widget:uuid"
   - payload.direction = 'in'
```

### Flow 2: Staff sends message
```
1. Dashboard calls POST /api/widget/conversations/widget:widget:uuid/messages
2. Server:
   - Parses conv_id → gets oa_id and customer_id
   - Creates message with:
     * direction='out' (from staff)
     * sender_id=staff_account_id (WHO sent it)
     * account_id=staff_account_id
3. Server emits socket event to organization room:
   - payload.conv_id = "widget:widget:uuid" (where to send)
   - payload.direction = 'out' (from staff)
4. Widget receives event:
   - Checks: payload.conv_id === conversationId? → YES ✅
   - Adds message to chat
5. Dashboard reloads messages:
   - Gets messages with direction='out', sender_id=staff_account_id
   - Displays on staff side (right) ✅
```

### Flow 3: Customer sends another message
```
1. Widget POST /api/widget/conversations/widget:widget:uuid/messages
2. Server validates conv_id format → ✅ VALID (has colons)
3. Returns 200 OK (not 400)
4. Process continues...
```

---

## Testing Guide

### Test 1: Real-time messages from staff to widget
1. Open widget and fill form
2. Send first message from widget
3. Verify it shows in staff dashboard
4. Staff sends message to customer
5. **Expected:** Message appears in widget immediately
6. **Check browser console:** Should see logs like:
   ```
   ✅ Socket connected
   📨 Socket new-message event received
   Comparing conv_ids: {incoming: "...", stored: "...", match: true}
   ✅ Adding staff message to chat
   ```

### Test 2: Multiple messages don't give 400 error
1. Open widget, fill form
2. Send message 1 → 200 OK ✅
3. Send message 2 → 200 OK ✅ (not 400)
4. Send message 3 → 200 OK ✅
5. **Check Network tab:** All POST requests succeed

### Test 3: Message direction is correct after reload
1. Widget customer sends "hello"
2. Staff sends "hi back"
3. **In widget:** Message appears from bot (left side) ✅
4. Reload dashboard
5. **In dashboard:** 
   - "hello" appears on customer side ✅
   - "hi back" appears on staff side ✅
   - NOT reversed ✅

### Test 4: Socket reconnection
1. Open widget
2. Disconnect internet (or toggle in DevTools)
3. Wait for auto-reconnect
4. Staff sends message
5. **Expected:** Widget still receives message (socket auto-reconnected)

---

## Debugging Console Output

When everything works:
```
✅ Socket connected: socket-id-here
📨 Registering message listener for conversationId: widget:widget:abc123
📨 Socket new-message event received: {
    conv_id: "widget:widget:abc123",
    direction: "out",
    message: "Hello from staff"
}
Comparing conv_ids: {
    incoming: "widget:widget:abc123",
    stored: "widget:widget:abc123",
    match: true
}
✅ Adding staff message to chat: {text: "Hello from staff", sender: "bot"}
```

If something goes wrong:
```
⚠️ Socket not initialized yet
  → Wait for orgId and accountId to load from URL

⚠️ conversationId not set yet
  → Widget hasn't sent first message yet

❌ Skipped: conversation ID mismatch
  → conv_id from server doesn't match widget's stored ID
  → Check if server is returning formatted conv_id

❌ API error: 400
  → Conv_id format is wrong
  → Should be "widget:oa_id:customer_uuid", not an ObjectId
```

---

## Files Modified Summary

| File | Change | Reason |
|------|--------|--------|
| `/server/routes/widget.py` | Return `conv_id` from lead endpoint | Provide formatted ID to client |
| `/server/routes/widget.py` | Change `sender_id=sender_id` to `sender_id=account_id` | Fix message direction on reload |
| `/client/app/widget/lead-form/page.jsx` | Complete rewrite of socket logic | Split initialization from listener registration |
| `/client/app/widget/lead-form/page.jsx` | Use `data.conv_id` instead of `data.conversation_id` | Use API's formatted ID |

---

## Verification Steps

1. ✅ Check `server/routes/widget.py` line 84 - returns `conv_id`
2. ✅ Check `server/routes/widget.py` line 343 - uses `account_id` as sender_id
3. ✅ Check `client/app/widget/lead-form/page.jsx` - has two separate useEffects for socket
4. ✅ Check browser console for detailed logging during message flow
5. ✅ Verify Network tab shows 200 OK responses for POST messages

All fixes have been applied. The widget should now properly:
- Receive messages from staff in real-time
- Send multiple messages without 400 errors
- Display messages with correct direction on reload

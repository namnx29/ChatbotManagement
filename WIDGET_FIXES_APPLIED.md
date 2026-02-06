# Widget Multiple Conversations & Real-time Messages Fix

## Issues Fixed

### 1. Multiple Conversations Created (FIXED ✅)
**Problem**: Each message from widget customer was creating a new conversation instead of updating the existing one.

**Root Cause**: The lead form was sending ALL messages to the `/api/widget/lead` endpoint, which is designed to create a new conversation.

**Solution Implemented**:
- Modified `handleSendMessage()` in [client/app/widget/lead-form/page.jsx](client/app/widget/lead-form/page.jsx#L133) to check if `conversationId` exists:
  - **First message** (no conversationId): Send to `/api/widget/lead` endpoint → Creates new conversation
  - **Subsequent messages** (has conversationId): Send to `/api/widget/conversations/<conv_id>/messages` endpoint → Updates existing conversation

**Code Changes**:
```javascript
if (conversationId) {
    // Use message endpoint if conversation already exists
    const messageUrl = `http://103.7.40.236:5002/api/widget/conversations/${encodeURIComponent(conversationId)}/messages`;
    // Send to this endpoint for subsequent messages
} else {
    // First message - use lead endpoint to create conversation
    const leadUrl = 'http://103.7.40.236:5002/api/widget/lead';
    // After creation, save the conversation_id
}
```

### 2. Widget No Real-time Messages from Staff (FIXED ✅)
**Problem**: Widget customers couldn't see replies sent by staff in real-time.

**Root Cause**: The widget iframe had no Socket.IO connection to listen for incoming messages.

**Solution Implemented**:
- Added Socket.IO client initialization in [client/app/widget/lead-form/page.jsx](client/app/widget/lead-form/page.jsx#L39)
- Socket connects to the server with `account_id` authentication
- Added listener for `new-message` events that filters for:
  - Messages with `direction === 'out'` (sent from staff/dashboard)
  - Messages matching the current conversation ID
  - Displays staff replies in real-time

**Code Changes**:
```javascript
// Setup socket.io connection for real-time messages
useEffect(() => {
    if (!orgId || !accountId) return;

    socketRef.current = io('https://elcom.vn', {
        transports: ['websocket', 'polling'],
        auth: {
            account_id: accountId,
        }
    });

    socketRef.current.on('new-message', (payload) => {
        if (payload.direction === 'out' && conversationId) {
            // Add staff message to chat
            const botMsg = {
                id: payload.message_doc?._id || payload.id || Date.now(),
                text: payload.message || payload.text,
                sender: 'bot',
                time: 'Just now'
            };
            setMessages(prev => [...prev, botMsg]);
        }
    });
}, [orgId, accountId, conversationId]);
```

## How It Works End-to-End

### Customer Initiates Chat:
1. Customer fills lead form (name, phone, first message)
2. First message sent to `/api/widget/lead` endpoint
3. Server creates new conversation with ID `widget:org_id:customer_id`
4. Server returns `conversation_id` in response
5. Widget stores `conversation_id` in localStorage and component state

### Customer Sends Follow-up Messages:
1. Widget checks if `conversationId` exists (it does)
2. Message sent to `/api/widget/conversations/<conv_id>/messages` endpoint
3. Same conversation is updated (no new conversation created)
4. Message appears in staff dashboard

### Staff Sends Reply:
1. Staff types reply in dashboard and sends it
2. Server emits `new-message` event with `direction: 'out'` to the organization Socket.IO room
3. Widget iframe receives event via Socket.IO
4. Event is filtered for matching conversation ID
5. Staff message displayed in real-time in widget chat

## Files Modified

- [client/app/widget/lead-form/page.jsx](client/app/widget/lead-form/page.jsx)
  - Added socket.io-client import (line 6)
  - Added orgId and accountId state (lines 22-23)
  - Added Socket.IO connection useEffect (lines 39-64)
  - Updated handleSendMessage to route based on conversationId (lines 133-195)

## Testing the Fix

### Test Scenario 1: Multiple Conversations Bug
1. Open widget on demo site
2. Send first message → Creates conversation
3. Send second message → Should update SAME conversation (not create new one)
4. Check dashboard → Should see only 1 conversation, not multiple

**Expected**: Dashboard shows 1 "Test" conversation with 2+ messages

### Test Scenario 2: Real-time Messages
1. Widget customer sends message
2. Staff replies in dashboard
3. Widget should display staff reply in real-time
4. No refresh needed

**Expected**: Staff reply appears immediately in widget chat

## Configuration

- Socket.IO server: `https://elcom.vn`
- API server: `http://103.7.40.236:5002`
- Organization ID: Passed via URL parameter `organizationId`
- Account ID: Passed via URL parameter `accountId`

## Notes

- Conversation ID is stored in localStorage for persistence across page refreshes
- Socket connection is only initialized if both orgId and accountId are provided
- Messages from customers (direction='in') are not displayed via socket; only staff replies (direction='out')
- Customer messages are displayed optimistically when sent, then confirmed by server response

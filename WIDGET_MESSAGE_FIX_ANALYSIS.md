# Widget Messaging Issues - Root Cause Analysis & Fixes

## Summary
Two critical issues were found and fixed in the widget messaging system:
1. **Messages from website (staff) to widget are NOT received by the widget**
2. **After the first message, sending from widget to website returns 400 BAD REQUEST**

Both issues stem from **conversation ID format mismatch** between the backend API and the client.

---

## Issue 1: Messages from Website to Widget Not Received

### Root Cause
The widget was listening for incoming messages via Socket.io with the event `new-message`. However, the matching logic was flawed:

**Before fix (page.jsx line 53-56):**
```javascript
if (payload.direction === 'out' && conversationId) {
    const msgConvId = payload.conv_id || payload.conversation_id;
    if (msgConvId && String(msgConvId).includes(String(conversationId))) {
        // Add message...
    }
}
```

**Problems:**
- The `conversationId` stored by the widget was the **MongoDB ObjectId** (returned from `/api/widget/lead`)
- The `payload.conv_id` from socket was formatted as **`widget:oa_id:customer_id`** (different format!)
- The `.includes()` comparison was unreliable - it could match unrelated conversations by chance

**Example:**
- Widget stores: `conversationId = "67a8c9d2e1f4a5b6c7d8e9f0"`
- Socket sends: `payload.conv_id = "widget:widget:5f8a9c7d4e5b3a2c"`
- String match fails because they're completely different formats

### The Fix
The widget now properly compares the **formatted conversation ID** from the API response with the socket message:

**Changes made:**
1. **Server (widget.py)** - Return the formatted `conv_id` in the lead endpoint response:
   ```python
   conv_id_formatted = f"widget:{oa_id}:{customer_id.replace('widget:', '')}"
   return jsonify({'success': True, 'conversation_id': conversation_id_str, 'conv_id': conv_id_formatted, ...})
   ```

2. **Client (page.jsx)** - Store and use the formatted `conv_id`:
   ```javascript
   if (data.success && data.conv_id) {
       setConversationId(data.conv_id);  // Store formatted ID instead of conversation_id
   }
   ```

3. **Socket listener (page.jsx)** - Use exact comparison:
   ```javascript
   const msgConvId = payload.conv_id;
   if (msgConvId && msgConvId === conversationId) {  // Exact match
       // Add message...
   }
   ```

**Result:** Now when staff sends a message from the website, the socket payload's `conv_id` exactly matches the widget's stored `conversationId`, and the message is properly displayed.

---

## Issue 2: 400 BAD REQUEST After First Message

### Root Cause
The `/api/widget/conversations/<path:conv_id>/messages` endpoint expects the conversation ID in a specific format: `widget:oa_id:customer_uuid`

**Backend endpoint (widget.py line 278):**
```python
@widget_bp.route('/api/widget/conversations/<path:conv_id>/messages', methods=['POST'])
def send_conversation_message(conv_id):
    parts = conv_id.split(':')
    if len(parts) < 3 or parts[0] != 'widget':
        return jsonify({'success': False, 'message': 'Invalid conversation id format'}), 400
    platform, oa_id, sender_id = parts
```

**What was happening:**
1. First message: Widget calls `/api/widget/lead` → Backend returns `conversation_id` (ObjectId like "67a8c9d2e1f4a5b6c7d8e9f0")
2. **Bug:** Widget stored this ObjectId and tried to use it directly in subsequent API calls
3. Second message: Widget tries POST to `/api/widget/conversations/67a8c9d2e1f4a5b6c7d8e9f0/messages`
4. Backend's `split(':')` on ObjectId returns only 1 part, not 3 → **400 BAD REQUEST**

**Before fix (page.jsx line 150-160):**
```javascript
if (data.success && data.conversation_id) {
    setConversationId(data.conversation_id);  // Stores ObjectId, not formatted ID!
}
// Later, when sending next message:
const messageUrl = `http://103.7.40.236:5002/api/widget/conversations/${encodeURIComponent(conversationId)}/messages`;
// ❌ Sends ObjectId instead of widget:oa_id:customer_uuid
```

### The Fix
Now the server returns the formatted `conv_id` which the client uses for subsequent API calls:

1. **Server returns both IDs:**
   ```python
   return jsonify({
       'success': True, 
       'conversation_id': conversation_id_str,  # ObjectId for reference
       'conv_id': conv_id_formatted,  # Formatted ID for API use: widget:oa_id:customer_uuid
       ...
   })
   ```

2. **Client uses the formatted ID:**
   ```javascript
   if (data.success && data.conv_id) {
       setConversationId(data.conv_id);  // Store formatted ID
   }
   // Later, messageUrl will be:
   // http://103.7.40.236:5002/api/widget/conversations/widget:widget:abc123def456/messages ✅
   ```

**Result:** API calls now have the correct conversation ID format and return 200 OK instead of 400 BAD REQUEST.

---

## Technical Details

### Conversation ID Formats in the System

| Format | Example | Used By | Purpose |
|--------|---------|---------|---------|
| **MongoDB ObjectId** | `67a8c9d2e1f4a5b6c7d8e9f0` | Database | Unique document identifier |
| **Formatted conv_id** | `widget:widget:5f8a9c7d4e5b3a2c` | API URLs & Socket | Routing & filtering |

### API Endpoint Expectations

The `/api/widget/conversations/<path:conv_id>/messages` endpoint:
- **Expects:** `conv_id` in format `widget:oa_id:customer_id`
- **Parses:** Splits on `:` to extract platform, oa_id, and sender_id
- **Validates:** Checks that format is correct (3+ parts, first part = "widget")
- **Use:** Queries database using `find_by_oa_and_customer(oa_id, customer_id)`

---

## Files Modified

1. **[server/routes/widget.py](server/routes/widget.py)**
   - Modified `/api/widget/lead` endpoint to return `conv_id` in formatted format
   - Changed response to include both `conversation_id` (ObjectId) and `conv_id` (formatted)

2. **[client/app/widget/lead-form/page.jsx](client/app/widget/lead-form/page.jsx)**
   - Updated to store and use `data.conv_id` instead of `data.conversation_id`
   - Fixed socket listener to use exact string comparison instead of `.includes()`

---

## Testing the Fix

### Test Case 1: Message from Widget to Website
1. Open widget and fill in form (name, phone)
2. Send first message
3. **Expected:** Message is sent successfully (not 400 BAD REQUEST)
4. Second message should also work

### Test Case 2: Message from Website to Widget
1. Staff logs into website dashboard
2. Find the widget conversation
3. Send a message to the widget customer
4. **Expected:** Widget receives the message in real-time via socket and displays it

### Debug Hints
- Check browser console for socket events: `Socket: new-message received`
- Check API request headers and URL format in Network tab
- Verify conversation ID format in localStorage under key `widget_lead_form_v1`
- Check server logs for endpoint routing and validation

---

## Summary of Changes

| Issue | Cause | Fix |
|-------|-------|-----|
| Messages not received | Incorrect conversation ID matching | Return formatted `conv_id` from API, use exact comparison |
| 400 BAD REQUEST | ObjectId passed instead of formatted ID | Use `conv_id` instead of `conversation_id` in API calls |

Both issues are now resolved. The widget and website dashboard can now exchange messages correctly.

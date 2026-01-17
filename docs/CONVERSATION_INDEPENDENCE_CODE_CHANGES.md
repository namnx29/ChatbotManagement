# Conversation Independence - Detailed Code Changes

## Overview
This document contains the exact code modifications needed for each file.

---

## Backend Changes

### 1. FILE: `server/routes/facebook.py`

**Function**: `list_conversations()` (around line 555)

**Current Code** (lines 555-650):
```python
@facebook_bp.route('/api/facebook/conversations', methods=['GET'])
def list_conversations():
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    oa_id = request.args.get('oa_id') or (request.get_json(silent=True) or {}).get('oa_id')
    if not oa_id:
        return jsonify({'success': False, 'message': 'oa_id is required'}), 400

    try:
        from models.conversation import ConversationModel
        from models.customer import CustomerModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        customer_model = CustomerModel(current_app.mongo_client)
        
        # Get conversations from new structure
        convs = conversation_model.find_by_oa(oa_id, limit=100)
        logger.info(f"Found {len(convs)} conversations from new structure for oa_id {oa_id}")
        if len(convs) == 0:
            # Try legacy method as fallback
            logger.info(f"No conversations in new structure, trying legacy method")
            from models.message import MessageModel
            message_model = MessageModel(current_app.mongo_client)
            convs_legacy = message_model.get_conversations_for_oa('facebook', oa_id)
            # ... rest of the fallback code
```

**Changes Needed**:
After getting `convs` and converting them to the output format, add platform status:

**Insert After**: The section where conversations are enriched and formatted (around line 630-650)

**Code to Add**:
```python
    # ADD THIS SECTION - Check integration status
    try:
        integration_model = IntegrationModel(current_app.mongo_client)
        integration = integration_model.find_by_platform_and_oa('facebook', oa_id)
        is_connected = bool(integration and integration.get('is_active', True))
        disconnected_at = None
        if not is_connected and integration:
            disconnected_at = integration.get('updated_at')  # or use disconnected_at if available
    except Exception as e:
        logger.error(f"Error checking integration status: {e}")
        is_connected = False
        disconnected_at = None
    
    # Add platform_status to each conversation
    for conv in out:
        conv['platform_status'] = {
            'is_connected': is_connected,
            'disconnected_at': disconnected_at.isoformat() + 'Z' if disconnected_at else None
        }
```

**Full Context** (what to replace, lines ~560-650):
The entire `list_conversations()` function should be modified to add the platform_status section after the conversation enrichment but before the final return.

---

### 2. FILE: `server/routes/zalo.py`

**Function**: `list_conversations()` (around line 920)

**Changes**: Same as Facebook endpoint

**Code Structure**:
```python
@zalo_bp.route('/api/zalo/conversations', methods=['GET'])
def list_conversations():
    # ... existing code to get conversations ...
    
    # ADD AT THE END - before return jsonify:
    
    # Check integration status
    try:
        integration = model.find_by_platform_and_oa('zalo', oa_id)
        is_connected = bool(integration and integration.get('is_active', True))
        disconnected_at = None
        if not is_connected and integration:
            disconnected_at = integration.get('updated_at')
    except Exception as e:
        logger.error(f"Error checking integration status: {e}")
        is_connected = False
        disconnected_at = None
    
    # Add platform_status to conversations
    for conv in out:
        conv['platform_status'] = {
            'is_connected': is_connected,
            'disconnected_at': disconnected_at.isoformat() + 'Z' if disconnected_at else None
        }
    
    return jsonify({'success': True, 'data': out}), 200
```

---

## Frontend Changes

### 3. FILE: `client/lib/components/chat/ConversationItem.js`

**Location**: The component rendering section

**Current Imports** (lines 1-5):
```javascript
import { Avatar, Dropdown } from 'antd';
import { MoreOutlined, TagFilled } from '@ant-design/icons';
import { useState, useEffect } from 'react';
```

**Change to**:
```javascript
import { Avatar, Dropdown, Tooltip } from 'antd';
import { MoreOutlined, TagFilled, DisconnectOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
```

**Platform Icons Section** (lines 7-23):
Keep as is, but we'll add styling based on disconnected status.

**Main Component JSX** (around line 90-150):
Currently the platform icon is displayed like:
```javascript
{platformIcons[c.platform]}
```

**Change to**:
```javascript
const isDisconnected = !conversation.platform_status?.is_connected;

<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
  <Tooltip 
    title={isDisconnected ? "Nền tảng không được kết nối" : ""}
    trigger={isDisconnected ? "hover" : ""}
  >
    <div style={{ 
      position: 'relative',
      opacity: isDisconnected ? 0.5 : 1
    }}>
      {platformIcons[conversation.platform]}
      {isDisconnected && (
        <DisconnectOutlined 
          style={{
            position: 'absolute',
            right: '-6px',
            top: '-6px',
            fontSize: '12px',
            color: '#ff4d4f',
            backgroundColor: 'white',
            borderRadius: '50%',
            padding: '2px',
            border: '1px solid #ff4d4f'
          }}
        />
      )}
    </div>
  </Tooltip>
</div>
```

**Full Component Update** (add this check at top of component function):
```javascript
export default function ConversationItem({ conversation, isSelected, onClick, isUnread }) {
  const [relativeTime, setRelativeTime] = useState(formatRelativeTime(conversation.time));
  
  // ADD THIS LINE:
  const isDisconnected = !conversation.platform_status?.is_connected;
  
  // ... rest of code
```

---

### 4. FILE: `client/lib/components/chat/ChatBox.js`

**Imports** (lines 1-15):
```javascript
import { Avatar, Input, Button, Switch, Image } from 'antd';
```

**Change to**:
```javascript
import { Avatar, Input, Button, Switch, Image, Alert } from 'antd';
```

**Component Function** (around line 60):
```javascript
export default function ChatBox({ conversation, onSendMessage, onLoadMore }) {
```

**Add After Function Declaration**:
```javascript
export default function ChatBox({ conversation, onSendMessage, onLoadMore }) {
  const [imageLoaded, setImageLoaded] = useState({});
  const [message, setMessage] = useState('');
  const [autoReply, setAutoReply] = useState(true);
  const [messages, setMessages] = useState(conversation.messages || []);
  
  // ADD THIS LINE:
  const isDisconnected = !conversation.platform_status?.is_connected;
  
  // ... rest of code
```

**Find the Input Component** (around line 350):
Currently looks like:
```javascript
<Input
  type="text"
  placeholder="Gõ tin nhắn..."
  value={message}
  onChange={(e) => setMessage(e.target.value)}
  onPressEnter={handleSendMessage}
/>
```

**Change to**:
```javascript
<Input
  type="text"
  placeholder={isDisconnected ? "Nền tảng không được kết nối" : "Gõ tin nhắn..."}
  value={message}
  onChange={(e) => setMessage(e.target.value)}
  onPressEnter={!isDisconnected ? handleSendMessage : null}
  disabled={isDisconnected}
  style={{
    opacity: isDisconnected ? 0.6 : 1,
    cursor: isDisconnected ? 'not-allowed' : 'text'
  }}
/>
```

**Find the Send Button** (around line 365):
Currently looks like:
```javascript
<Button 
  type="primary" 
  onClick={handleSendMessage}
  disabled={!message.trim()}
>
  <SendOutlined /> Gửi
</Button>
```

**Change to**:
```javascript
<Button 
  type="primary" 
  onClick={handleSendMessage}
  disabled={!message.trim() || isDisconnected}
>
  <SendOutlined /> Gửi
</Button>
```

**Find the Message Container** (around line 200-350, before the Input section):
Add the disconnection alert at the top of the message area:

**Add Before Input Section**:
```javascript
{isDisconnected && (
  <Alert
    type="warning"
    showIcon
    message="Nền tảng không được kết nối"
    description="Bạn không thể gửi tin nhắn vì nền tảng này đã bị ngắt kết nối. Hãy kết nối lại nền tảng này trong phần tích hợp để tiếp tục nhắn tin."
    style={{ marginBottom: '12px' }}
  />
)}
```

---

### 5. FILE: `client/app/dashboard/messages/page.js`

**Existing Conversation Loading** (lines 300-370):
The current `loadConversations` function fetches per-integration.

**Current Code**:
```javascript
useEffect(() => {
    let mounted = true;

    const loadConversations = async () => {
      if (!accountId) return;

      try {
        setLoading(true);
        const result = await listIntegrations(accountId);
        const integrations = result?.data || [];

        const conversationPromises = integrations.map(async (integration) => {
          try {
            if (integration.platform === 'facebook') {
              const res = await listFacebookConversations(accountId, integration.oa_id);
              return (res?.data || []).map(c => ({
                id: c.id,
                name: c?.name || 'Khách hàng',
                avatar: c.avatar,
                platform: 'facebook',
                lastMessage: c.lastMessage,
                time: c.time,
                isUnread: (c.unreadCount || 0) > 0,
                messages: [],
                oa_id: integration.oa_id,
              }));
            }
            // ... similar for zalo ...
          } catch (error) {
            console.error(`Failed to load conversations for ${integration.oa_id}:`, error);
            return [];
          }
        });
        // ... rest of code
```

**Modification**: The code is actually fine as-is! The `listFacebookConversations` and `listZaloConversations` functions will now receive the `platform_status` field from the backend, which we can pass through:

**Change in Mapping** (around line 324):
```javascript
// OLD:
return (res?.data || []).map(c => ({
  id: c.id,
  name: c?.name || 'Khách hàng',
  avatar: c.avatar,
  platform: 'facebook',
  lastMessage: c.lastMessage,
  time: c.time,
  isUnread: (c.unreadCount || 0) > 0,
  messages: [],
  oa_id: integration.oa_id,
}));

// NEW - ADD platform_status:
return (res?.data || []).map(c => ({
  id: c.id,
  name: c?.name || 'Khách hàng',
  avatar: c.avatar,
  platform: 'facebook',
  lastMessage: c.lastMessage,
  time: c.time,
  isUnread: (c.unreadCount || 0) > 0,
  messages: [],
  oa_id: integration.oa_id,
  platform_status: c.platform_status || { is_connected: true, disconnected_at: null }
}));
```

**Same change for Zalo** (around line 345):
```javascript
return (res?.data || []).map(c => ({
  id: c.id,
  name: c?.name || 'Khách hàng',
  avatar: c.avatar,
  platform: 'zalo',
  lastMessage: c.lastMessage,
  time: c.time,
  isUnread: (c.unreadCount || 0) > 0,
  messages: [],
  oa_id: integration.oa_id,
  platform_status: c.platform_status || { is_connected: true, disconnected_at: null }
}));
```

**Also in Socket Handler** (around line 170):
When new conversations are created from socket messages:

```javascript
// ADD platform_status to new conversation:
return [{
  id: convId,
  ...profileInfo,
  platform: payload.platform,
  lastMessage: payload.message,
  time: new Date().toISOString(),
  isUnread: payload.direction !== 'out',
  messages: [],
  oa_id: payload.oa_id,
  platform_status: { is_connected: true, disconnected_at: null }  // NEW
}, ...prev];
```

---

## Summary of Files Modified

| File | Changes | Priority |
|------|---------|----------|
| `server/routes/facebook.py` | Add platform_status to conversation response | **HIGH** |
| `server/routes/zalo.py` | Add platform_status to conversation response | **HIGH** |
| `client/lib/components/chat/ConversationItem.js` | Add disconnected indicator UI | **HIGH** |
| `client/lib/components/chat/ChatBox.js` | Disable input + add alert | **HIGH** |
| `client/app/dashboard/messages/page.js` | Pass through platform_status field | **MEDIUM** |

---

## Testing Each Change

### After Backend Changes
```bash
# Test Facebook conversations with disconnection
curl -X GET "http://localhost:5000/api/facebook/conversations?oa_id=123456" \
  -H "X-Account-Id: test_account"

# Should see platform_status in response:
# "platform_status": { "is_connected": true, "disconnected_at": null }
```

### After Frontend Changes
1. Open messages page
2. Verify conversations load with platform_status
3. Disconnect an integration (delete it)
4. Refresh conversation list
5. Verify conversation still appears with warning icon
6. Click conversation
7. Verify input is disabled with tooltip
8. Verify warning banner appears
9. Verify send button is disabled

---

## Rollback Instructions

If issues arise, to rollback:

### Backend Rollback:
1. Remove the platform_status section from both Facebook and Zalo routes
2. Conversations will still be fetched, just without the status field

### Frontend Rollback:
1. ConversationItem: Remove the DisconnectOutlined icon and opacity changes
2. ChatBox: Remove the Alert component and disabled state
3. messages/page.js: Remove the platform_status field assignments
4. No data loss, feature just disabled

---

## Additional Notes

### Integration Status Flow
Currently the integration model uses `is_active` field:
- `true` = currently connected and in use
- `false` = deactivated (kept for history)

When an integration is **deleted** (not deactivated), we should:
- Either keep a soft-delete flag
- Or use `is_active = false` and set `disconnected_at` timestamp
- Current implementation deletes records, which is why conversations disappear

**Optional**: Consider adding soft-delete to integrations for better history tracking.

### Error Handling
If integration lookup fails during conversation list fetch:
- Current code catches exception and returns `is_connected = false`
- Conversations still show with warning indicator
- Better safe than breaking the conversation list entirely

### Performance Notes
- Adding integration status lookup doesn't add queries per conversation
- One lookup per oa_id per platform
- Could cache for 5-10 minutes if needed
- Indexes already exist for fast lookups

---

## File Structure Reference

```
server/
├── routes/
│   ├── facebook.py          ← MODIFY list_conversations()
│   ├── zalo.py              ← MODIFY list_conversations()
│   └── ...

client/
├── app/dashboard/messages/
│   └── page.js              ← MODIFY loadConversations()
├── lib/
│   ├── components/chat/
│   │   ├── ConversationItem.js    ← MODIFY platform icon rendering
│   │   └── ChatBox.js             ← MODIFY input/button state
│   └── ...
```

---

## Code Change Checklist

- [ ] Add platform_status to Facebook conversation endpoint response
- [ ] Add platform_status to Zalo conversation endpoint response
- [ ] Add DisconnectOutlined icon to ConversationItem imports
- [ ] Add Tooltip component to ConversationItem
- [ ] Add disconnected indicator rendering with icon
- [ ] Add Alert to ChatBox imports
- [ ] Add isDisconnected state variable to ChatBox
- [ ] Add disconnection alert banner to ChatBox
- [ ] Disable Input when disconnected
- [ ] Disable Send Button when disconnected
- [ ] Update conversation mapping in messages/page.js to include platform_status
- [ ] Test Facebook disconnection flow
- [ ] Test Zalo disconnection flow
- [ ] Verify messaging still works for connected platforms
- [ ] Verify conversation list shows all conversations

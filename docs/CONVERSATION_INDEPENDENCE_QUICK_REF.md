# Conversation Independence - Quick Reference Guide

## TL;DR (The Essential Changes)

### What's Changing?
- **Before**: Conversations disappear when you disconnect a platform
- **After**: Conversations stay visible, but messaging is disabled with a clear warning

### Where to Make Changes?

| File | What to Change | Why |
|------|---|---|
| `server/routes/facebook.py` | Add `platform_status` to each conversation in response | So frontend knows if platform is connected |
| `server/routes/zalo.py` | Add `platform_status` to each conversation in response | So frontend knows if platform is connected |
| `client/lib/components/chat/ConversationItem.js` | Show disconnected icon if `platform_status.is_connected === false` | Visual indicator that platform is disconnected |
| `client/lib/components/chat/ChatBox.js` | Disable input + show warning if `platform_status.is_connected === false` | Prevent user from trying to send messages |
| `client/app/dashboard/messages/page.js` | Pass `platform_status` through the conversation object | Data flows from backend to UI |

---

## Code Snippets - Copy & Paste Ready

### Backend: Add to Facebook Routes (after line 630)

```python
# Check integration status
try:
    integration_model = IntegrationModel(current_app.mongo_client)
    integration = integration_model.find_by_platform_and_oa('facebook', oa_id)
    is_connected = bool(integration and integration.get('is_active', True))
    disconnected_at = None
    if not is_connected and integration:
        disconnected_at = integration.get('updated_at')
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

### Backend: Add to Zalo Routes (same code as above)

```python
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

# Add platform_status to each conversation
for conv in out:
    conv['platform_status'] = {
        'is_connected': is_connected,
        'disconnected_at': disconnected_at.isoformat() + 'Z' if disconnected_at else None
    }
```

### Frontend: Update ConversationItem.js

**Add to imports**:
```javascript
import { Avatar, Dropdown, Tooltip } from 'antd';
import { MoreOutlined, TagFilled, DisconnectOutlined } from '@ant-design/icons';
```

**Add inside component**:
```javascript
const isDisconnected = !conversation.platform_status?.is_connected;

// Replace platform icon rendering with:
<Tooltip 
  title={isDisconnected ? "Nền tảng không được kết nối" : ""}
  trigger={isDisconnected ? "hover" : ""}
>
  <div style={{ 
    position: 'relative',
    opacity: isDisconnected ? 0.5 : 1,
    display: 'inline-block'
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
```

### Frontend: Update ChatBox.js

**Add to imports**:
```javascript
import { Avatar, Input, Button, Switch, Image, Alert } from 'antd';
```

**Add inside component (after line 60)**:
```javascript
const isDisconnected = !conversation.platform_status?.is_connected;
```

**Replace Input element with**:
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

**Replace Send Button with**:
```javascript
<Button 
  type="primary" 
  onClick={handleSendMessage}
  disabled={!message.trim() || isDisconnected}
>
  <SendOutlined /> Gửi
</Button>
```

**Add before Input (Alert warning)**:
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

### Frontend: Update messages/page.js

**In conversation mapping (around line 324)**:
```javascript
// Change from:
return (res?.data || []).map(c => ({
  id: c.id,
  name: c?.name || 'Khách hàng',
  // ...
}));

// Change to:
return (res?.data || []).map(c => ({
  id: c.id,
  name: c?.name || 'Khách hàng',
  // ... existing fields ...
  platform_status: c.platform_status || { is_connected: true, disconnected_at: null }
}));
```

**Do the same for Zalo (around line 345)**:
```javascript
return (res?.data || []).map(c => ({
  id: c.id,
  name: c?.name || 'Khách hàng',
  // ... existing fields ...
  platform_status: c.platform_status || { is_connected: true, disconnected_at: null }
}));
```

---

## Testing Instructions

### Test 1: Backend Change
```bash
# 1. Start server
python server/app.py

# 2. Create a conversation with Facebook
# (Send a message through the UI or API)

# 3. Test endpoint returns platform_status
curl -H "X-Account-Id: your_account_id" \
  "http://localhost:5000/api/facebook/conversations?oa_id=your_oa_id"

# 4. Verify response includes:
# "platform_status": { "is_connected": true }

# 5. Delete the integration
# (Go to integrations page and delete Facebook integration)

# 6. Call same endpoint again
# Should still return conversations but with:
# "platform_status": { "is_connected": false }
```

### Test 2: Frontend Changes
```
1. Open messages page in browser
2. Verify all conversations load (connected and disconnected)
3. Check conversation with disconnected platform:
   - Platform icon should be dimmed (50% opacity)
   - Small ❌ icon visible on platform icon
   - Tooltip shows "Nền tảng không được kết nối" on hover
4. Click on disconnected conversation:
   - ChatBox should show warning banner
   - Input should be disabled (gray, not clickable)
   - Send button should be disabled
   - Message: "Nền tảng không được kết nối"
5. Click on connected conversation:
   - No warning banner
   - Input should be enabled
   - Send button should be enabled
   - Messaging should work normally
6. Reconnect the platform:
   - Disconnect message should disappear
   - Input should be enabled
   - Messaging should work
```

---

## Visual Checklist

- [ ] **Disconnected conversation in list**:
  - Platform icon has 50% opacity
  - Red ❌ badge on platform icon
  - Hovering shows tooltip "Nền tảng không được kết nối"

- [ ] **ChatBox for disconnected conversation**:
  - Yellow ⚠️ alert appears at top
  - Alert says "Nền tảng không được kết nối"
  - Input field is grayed out and not clickable
  - Send button is grayed out and not clickable
  - Placeholder text shows "Nền tảng không được kết nối"

- [ ] **ChatBox for connected conversation**:
  - No alert/warning
  - Input field is active and clickable
  - Send button is active
  - Can type and send messages normally

---

## Common Issues & Solutions

### Issue: Conversations don't appear in list
**Solution**: Ensure `find_by_oa()` is being called for each oa_id. Check backend logs.

### Issue: platform_status field is missing
**Solution**: Verify you added the code to both Facebook AND Zalo endpoints.

### Issue: Disconnected icon doesn't show
**Solution**: 
1. Verify ConversationItem.js has `DisconnectOutlined` import
2. Verify `isDisconnected` variable is calculated correctly
3. Check browser console for errors

### Issue: Input still works when disconnected
**Solution**: 
1. Verify `isDisconnected` variable is calculated in ChatBox
2. Verify Input has `disabled={isDisconnected}`
3. Hard refresh browser (Ctrl+F5)

### Issue: Warning banner doesn't appear
**Solution**:
1. Verify Alert component is imported from antd
2. Verify Alert is rendered before Input
3. Check browser console for errors

---

## Rollback if Needed

### Rollback Backend:
1. Remove the `platform_status` block from Facebook routes
2. Remove the `platform_status` block from Zalo routes
3. Restart server
4. Conversations will still appear (just without status field)

### Rollback Frontend:
1. Remove DisconnectOutlined icon from ConversationItem
2. Remove Alert and disabled states from ChatBox
3. Remove platform_status assignments from messages/page.js
4. Refresh browser

**No data will be lost - all conversations and integrations stay in database.**

---

## Database Check

Verify your database has the required data:

```javascript
// In MongoDB console:

// Check conversations exist
db.conversations.find({ oa_id: "YOUR_OA_ID" }).limit(1)

// Check integration tracking
db.integrations.find({ 
  oa_id: "YOUR_OA_ID", 
  platform: "facebook" 
})

// Should see:
// - conversations collection: has oa_id, customer_id, updated_at
// - integrations collection: has oa_id, platform, is_active
```

---

## Feature Complete Checklist

- [ ] Backend Facebook endpoint returns platform_status
- [ ] Backend Zalo endpoint returns platform_status
- [ ] Frontend ConversationItem shows disconnected icon
- [ ] Frontend ChatBox disables input when disconnected
- [ ] Frontend ChatBox shows warning when disconnected
- [ ] All conversations appear in list (connected & disconnected)
- [ ] Messaging works for connected platforms
- [ ] Messaging disabled for disconnected platforms
- [ ] Clear error message explains why messaging is disabled
- [ ] No data loss after implementation
- [ ] Reconnecting platform re-enables messaging automatically

---

## Questions?

Reference these docs for detailed info:
- **Full Plan**: `CONVERSATION_INDEPENDENCE_PLAN.md`
- **Code Details**: `CONVERSATION_INDEPENDENCE_CODE_CHANGES.md`
- **Visuals & Flows**: `CONVERSATION_INDEPENDENCE_VISUALS.md`
- **Summary**: `CONVERSATION_INDEPENDENCE_SUMMARY.md`

All docs in `/home/nam/work/test-preny/docs/`

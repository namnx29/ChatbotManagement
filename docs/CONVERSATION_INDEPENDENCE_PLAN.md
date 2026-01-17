# Conversation Independence Feature Plan

## Overview
Currently, conversations are dependent on integrated platforms. This plan transforms the system to:
1. **Store conversations in database independently** - conversations persist regardless of platform integration status
2. **Show all conversations** - even if the platform is no longer integrated
3. **Indicate disconnected platforms** - add visual indicators when a platform is disconnected
4. **Disable messaging for disconnected platforms** - prevent sending messages on disconnected platforms
5. **Notify users** - show clear messages about why they can't send messages

## Current Architecture Analysis

### Current Flow
1. **Frontend** → Lists integrations from `/api/integrations`
2. **Frontend** → For each integration, fetches conversations from `/api/facebook/conversations?oa_id=X` or `/api/zalo/conversations?oa_id=X`
3. **Backend** → Conversation endpoints check if platform is currently integrated and only return conversations for ACTIVE integrations
4. **Problem**: If an integration is deleted, conversations disappear immediately

### Database Models
- **integrations**: stores platform credentials and status
  - Fields: `accountId`, `platform`, `oa_id`, `is_active`, `access_token`, etc.
- **conversations**: stores conversation data
  - Fields: `oa_id`, `customer_id`, `platform` (implicit from oa_id), `updated_at`, `last_message`, etc.
- **messages**: stores individual messages

## Implementation Plan

### Phase 1: Backend Modifications

#### 1.1 Update Integration Model
**File**: `server/models/integration.py`

Add method to check if integration is still active:
```python
def is_active(self, integration_id) -> bool:
    """Check if an integration is currently active"""
    # Already has is_active field, just need getter
    
def get_platform_status(self, platform, oa_id) -> dict:
    """Get platform status and integration details"""
    # Returns: { 'is_connected': bool, 'integration': {...}, 'disconnected_at': datetime }
```

#### 1.2 Update Conversation Routes - Facebook
**File**: `server/routes/facebook.py`

Modify `/api/facebook/conversations` endpoint:
- Change from: "get conversations from platform IF integration exists"
- Change to: "get conversations from database + enrich with platform status"

Key changes:
```python
def list_conversations():
    # Get conversations from database (not filtered by integration)
    convs = conversation_model.find_by_oa(oa_id, limit=100)
    
    # Check if platform is currently integrated
    integration = IntegrationModel.find_by_platform_and_oa('facebook', oa_id)
    is_connected = bool(integration and integration.get('is_active', True))
    
    # Add platform status to each conversation
    for conv in convs:
        conv['platform_status'] = {
            'is_connected': is_connected,
            'platform': 'facebook',
            'disconnected_at': None  # if not integration, add timestamp
        }
    
    return convs
```

#### 1.3 Update Conversation Routes - Zalo
**File**: `server/routes/zalo.py`

Same changes as Facebook endpoint.

#### 1.4 Create Unified Conversations Endpoint (Optional)
**File**: `server/routes/chatbot.py` or new file

Add endpoint: `/api/conversations` 
- Gets ALL conversations for an account (from database)
- Includes platform status for each
- Allows frontend to load conversations once, then filter by platform
- Better performance than current approach

### Phase 2: Frontend Modifications

#### 2.1 Update Conversation Listing Logic
**File**: `client/app/dashboard/messages/page.js`

Current approach (loads per integration):
```javascript
// Current - loads conversations per integration
const integrations = await listIntegrations(accountId);
for each integration:
  - fetch conversations for that integration
```

New approach (loads from database):
```javascript
// New - load all conversations from database
const conversations = await getAllConversations(accountId);
// Each conversation has: id, platform, is_connected, platform_status
```

#### 2.2 Update API Endpoints
**File**: `client/lib/api.js`

Add new function:
```javascript
export async function getAllConversations(accountId) {
  // GET /api/conversations?accountId=X
  // Returns conversations with platform_status
}
```

Keep existing functions for backward compatibility:
- `listFacebookConversations` - still works
- `listZaloConversations` - still works

#### 2.3 Update ConversationItem Component
**File**: `client/lib/components/chat/ConversationItem.js`

Add visual indicator for disconnected platforms:
```javascript
// If conversation.platform_status.is_connected === false:
// - Add a small disconnected icon overlay
// - Change opacity or add striped pattern
// - Show tooltip "Platform disconnected" on hover
```

Visual options:
1. **Small red X icon** over the platform icon
2. **Striped overlay** on the platform icon
3. **Gray out the platform icon**
4. **Add "Disconnected" badge** next to conversation name

#### 2.4 Update ChatBox Component
**File**: `client/lib/components/chat/ChatBox.js`

Add checks for platform status:
```javascript
const isDisconnected = !conversation.platform_status?.is_connected;

// 1. Disable message input if disconnected
<Input
  disabled={isDisconnected}
  placeholder={isDisconnected ? "Nền tảng không được kết nối" : "Gõ tin nhắn..."}
/>

// 2. Disable send button if disconnected
<Button 
  disabled={isDisconnected || !message.trim()}
/>

// 3. Add notification banner if disconnected
{isDisconnected && (
  <Alert
    type="warning"
    message="Platform không được kết nối"
    description="Bạn không thể gửi tin nhắn vì nền tảng đã bị ngắt kết nối. Hãy kết nối lại trong phần tích hợp."
    showIcon
  />
)}
```

## Database Changes Required

### 1. Verify Conversation Model Structure
The `conversations` collection should already have:
- `oa_id` (required)
- `customer_id` (required)
- `platform` (optional, can be derived from oa_id lookup in integrations)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `last_message` (text)

No schema changes needed - just ensure data is being saved properly.

### 2. Integration Model Status
The `integrations` collection should track:
- `is_active`: boolean (true = currently connected)
- `connected_at`: datetime (when first connected)
- `disconnected_at`: datetime (when connection was removed, optional)

### 3. Query Optimization
Add indexes if not present:
```python
# In _create_indexes():
self.collection.create_index([('accountId', 1), ('platform', 1), ('is_active', 1)])
self.collection.create_index([('oa_id', 1), ('is_active', 1)])
```

## Implementation Steps

### Step 1: Database & Model Changes
- [ ] Verify conversation model `find_by_oa()` method works correctly
- [ ] Verify integration model has `is_active` field
- [ ] Add indexes for performance

### Step 2: Backend Route Changes
- [ ] Update Facebook `/api/facebook/conversations` endpoint
- [ ] Update Zalo `/api/zalo/conversations` endpoint
- [ ] Test endpoints return conversations with platform status
- [ ] (Optional) Create unified `/api/conversations` endpoint

### Step 3: Frontend API Changes
- [ ] Add `getAllConversations()` function to API
- [ ] Test new endpoint works
- [ ] Keep backward compatibility

### Step 4: Frontend UI Changes - Conversation List
- [ ] Modify `messages/page.js` to use new conversation listing
- [ ] Update filtering logic
- [ ] Test conversation list displays all conversations
- [ ] Test platform filtering still works

### Step 5: Frontend UI Changes - Conversation Item
- [ ] Update `ConversationItem.js` to show disconnected indicator
- [ ] Add visual styling for disconnected conversations
- [ ] Add tooltip/help text
- [ ] Test rendering

### Step 6: Frontend UI Changes - ChatBox
- [ ] Disable input for disconnected platforms
- [ ] Disable send button for disconnected platforms
- [ ] Add warning notification/banner
- [ ] Add helpful message about reconnecting
- [ ] Test functionality

### Step 7: Testing
- [ ] Create/have conversation on Facebook
- [ ] Remove Facebook integration
- [ ] Verify conversation still shows in list
- [ ] Verify disconnected indicator shows
- [ ] Verify chatbox is disabled
- [ ] Verify reconnecting the platform re-enables messaging
- [ ] Repeat for Zalo
- [ ] Test conversation filtering still works
- [ ] Test message sending on connected platforms still works

## UI Design Details

### Disconnected Indicator Options

#### Option A: Red X Badge (Recommended)
```
[Facebook Icon] + [Small Red X]
```
- Pros: Clear, familiar, obvious
- Cons: Takes up more space

#### Option B: Striped Pattern
```
[Facebook Icon with diagonal stripes]
```
- Pros: Subtle, doesn't add elements
- Cons: Harder to notice at a glance

#### Option C: Opacity Change
```
[Facebook Icon at 50% opacity]
```
- Pros: Subtle, minimal changes
- Cons: Might not be noticeable enough

**Recommended**: Option A with tooltip on hover

### Banner/Notification in ChatBox
Location: Above message input
Type: Alert (warning level)
Icon: ⚠️ or ℹ️
Title: "Nền tảng không được kết nối"
Description: "Bạn không thể gửi tin nhắn vì nền tảng này đã bị ngắt kết nối. Hãy kết nối lại trong phần tích hợp để tiếp tục nhắn tin."
CTA: Link to integrations page (optional)

## Data Flow Diagram

### Current Flow (Problematic)
```
User → Frontend (messages/page.js)
        ↓
        List Integrations (/api/integrations)
        ↓
        For Each Integration:
          GET /api/facebook/conversations?oa_id=X
          GET /api/zalo/conversations?oa_id=X
        ↓
        Backend checks: "Is this integration active?"
        → If YES: return conversations
        → If NO: return empty array
        ↓
        Conversation disappears if platform deleted
```

### New Flow (Solution)
```
User → Frontend (messages/page.js)
        ↓
        GET /api/conversations (all conversations from database)
        ↓
        Backend:
          1. Query conversations collection
          2. For each conversation:
             - Look up integration status (platform active?)
             - Add platform_status to conversation
          3. Return enriched conversations
        ↓
        Frontend displays all conversations:
          - Active platform: normal display, messaging enabled
          - Disconnected platform: gray icon + warning, messaging disabled
```

## Backward Compatibility
- Existing endpoints (`/api/facebook/conversations`, `/api/zalo/conversations`) will continue to work
- They will now include `platform_status` field in responses
- Frontend will gradually migrate to new unified endpoint
- No breaking changes to existing API contracts

## Error Handling
1. **Conversation without integration**: Show conversation with "Unknown Platform" status
2. **Database error fetching conversations**: Show generic error message
3. **Network error checking integration status**: Show conversation but with "Status Unknown" status
4. **Message send on disconnected platform**: Show error "Platform is not connected. Please reconnect and try again."

## Performance Considerations
- New endpoint should use same pagination as old endpoints
- Consider adding caching on integration status (5-10 minute TTL)
- Index conversations by `(oa_id, updated_at)` for fast sorting
- Index integrations by `(accountId, platform, is_active)` for status checks

## Future Enhancements
1. **Auto-reconnect notification**: Notify user when platform comes back online
2. **Bulk action**: Re-integrate all previous platforms
3. **Archive old conversations**: Option to archive conversations from disconnected platforms
4. **Conversation history**: Show when platform was connected/disconnected
5. **Platform connection history**: Track connection timeline for each conversation

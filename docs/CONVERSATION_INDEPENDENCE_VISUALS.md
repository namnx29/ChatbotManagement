# Conversation Independence - Visual Diagrams & Flows

## 1. Data Flow Comparison

### Current Flow (Problem)
```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                            │
│            (Messages / Conversations Page)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ "Load conversations"
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           1. LIST INTEGRATIONS                               │
│     GET /api/integrations?accountId=X                        │
│     Returns: [                                               │
│       { platform: 'facebook', oa_id: '123', is_active: true},│
│       { platform: 'facebook', oa_id: '456', is_active: false}│
│     ]                                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
    (for each active integration)
┌────────────────────┐      ┌────────────────────┐
│ Facebook (oa 123)  │      │ Facebook (oa 456)  │
│ SKIPPED!           │      │ GET /api/facebook/ │
│ is_active=false    │      │ conversations?...  │
└────────────────────┘      └────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│     PROBLEM: Conversations for oa_id 456 don't appear       │
│     because integration was deleted (is_active=false)        │
└─────────────────────────────────────────────────────────────┘
```

### New Flow (Solution)
```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                            │
│            (Messages / Conversations Page)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ "Load conversations"
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           1. LIST INTEGRATIONS                               │
│     GET /api/integrations?accountId=X                        │
│     Returns: [                                               │
│       { platform: 'facebook', oa_id: '123', is_active: true},│
│       { platform: 'facebook', oa_id: '456', is_active: false}│
│     ]                                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
  (FOR EACH oa_id - regardless of is_active)
┌────────────────────┐      ┌────────────────────┐
│ Facebook (oa 123)  │      │ Facebook (oa 456)  │
│ GET /api/facebook/ │      │ GET /api/facebook/ │
│ conversations?...  │      │ conversations?...  │
└────────────────────┘      └────────────────────┘
        │                             │
        ▼                             ▼
┌────────────────────────────────────────────┐
│ Backend: Query conversations table for:    │
│   - oa_id = 123 → platform_status: {       │
│     is_connected: true                     │
│   }                                        │
│   - oa_id = 456 → platform_status: {       │
│     is_connected: false    ← ADDED!        │
│   }                                        │
└────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│   SOLUTION: All conversations appear:                        │
│   - oa_id 123: Normal display, messaging enabled            │
│   - oa_id 456: Gray icon, warning indicator, disabled input │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Conversation Item Rendering

### Current UI
```
┌─────────────────────────────────────┐
│ [Facebook] John Doe                 │
│ Last message... — 2 hours ago        │
│ [Read/Unread indicator]              │
└─────────────────────────────────────┘
```

### New UI (Connected)
```
┌─────────────────────────────────────┐
│ [Facebook] John Doe                 │
│ Last message... — 2 hours ago        │
│ [Read/Unread indicator]              │
│                                      │
│ [Tooltip: "Nhấp để mở"]              │
└─────────────────────────────────────┘
```

### New UI (Disconnected)
```
┌─────────────────────────────────────┐
│ [Facebook] ❌ John Doe               │
│ Last message... — 2 hours ago        │
│ [Read/Unread indicator]              │
│                                      │
│ [Tooltip: "Nền tảng không được..."]  │
│ [Icon opacity 50%]                   │
└─────────────────────────────────────┘
```

---

## 3. ChatBox States

### State 1: Platform Connected (Normal)
```
┌──────────────────────────────────────────────────┐
│ John Doe              [Facebook]                  │
├──────────────────────────────────────────────────┤
│                                                  │
│ Mes: Hi, how can I help?                        │
│ John: I need help with my order                 │
│ Mes: Sure! What's the order number?             │
│                                                  │
├──────────────────────────────────────────────────┤
│ [Type a message...              ] [✓ Gửi]       │
│                                                  │
│ ☐ Auto reply                                    │
├──────────────────────────────────────────────────┤
│ [Normal state - input active, button enabled]    │
└──────────────────────────────────────────────────┘
```

### State 2: Platform Disconnected (New)
```
┌──────────────────────────────────────────────────┐
│ John Doe          [Facebook ❌ (disconnected)]   │
├──────────────────────────────────────────────────┤
│                                                  │
│ Mes: Hi, how can I help?                        │
│ John: I need help with my order                 │
│ Mes: Sure! What's the order number?             │
│                                                  │
│ ⚠️  Nền tảng không được kết nối                 │
│     Bạn không thể gửi tin nhắn vì nền tảng      │
│     đã bị ngắt kết nối.                         │
│                                                  │
├──────────────────────────────────────────────────┤
│ [Nền tảng không được kết nối] [✗ Gửi (disabled)]│
│                                                  │
│ ☐ Auto reply                                    │
├──────────────────────────────────────────────────┤
│ [Disabled state - gray input, button disabled]   │
│ [Clear warning message about disconnection]      │
└──────────────────────────────────────────────────┘
```

---

## 4. Database Schema (No Changes Needed)

### Current Tables - Already Have Required Data

#### conversations collection
```json
{
  "_id": ObjectId,
  "oa_id": "123456789",              ✓ Already exists
  "customer_id": "facebook:cust123",  ✓ Already exists
  "created_at": ISODate,              ✓ Already exists
  "updated_at": ISODate,              ✓ Already exists
  "last_message": {
    "text": "Hi there!",              ✓ Already exists
    "created_at": ISODate
  },
  "customer_info": {                  ✓ Already exists
    "name": "John Doe",
    "avatar": "https://..."
  },
  "unread_count": 2                   ✓ Already exists
}
```

#### integrations collection
```json
{
  "_id": ObjectId,
  "accountId": "user123",             ✓ Already exists
  "platform": "facebook",             ✓ Already exists
  "oa_id": "123456789",               ✓ Already exists
  "is_active": true,                  ✓ Already exists
  "access_token": "...",              ✓ Already exists
  "refresh_token": "...",             ✓ Already exists
  "created_at": ISODate,              ✓ Already exists
  "connected_at": ISODate,            ✓ Already exists
  "updated_at": ISODate               ✓ Already exists
}
```

**Note**: No schema migration needed! All required fields already exist.

---

## 5. Query Execution Flow

### Backend: Getting Conversations with Status

```
┌─────────────────────────────────────────────────┐
│ Request: GET /api/facebook/conversations?oa_id  │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ Step 1: Query Conversations DB                  │
│ db.conversations.find({                         │
│   oa_id: "123456"                              │
│ }).sort({updated_at: -1}).limit(100)           │
│                                                 │
│ Returns: [conv1, conv2, conv3, ...]            │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ Step 2: Lookup Integration Status               │
│ db.integrations.findOne({                       │
│   platform: "facebook",                         │
│   oa_id: "123456"                              │
│ })                                              │
│                                                 │
│ Returns: integration document (or null)         │
└────────────────┬────────────────────────────────┘
                 │
                 ├─────────────┬─────────────┐
                 │             │             │
          Found &         Found &      Not found
          active          inactive       │
            │               │            │
            ▼               ▼            ▼
      is_connected:   is_connected:  is_connected:
        true          false           false
            │           │              │
            └─────┬─────┴──────┬───────┘
                  │            │
                  ▼            ▼
         ┌──────────────────────────┐
         │ Step 3: Add Status Field │
         │ to Each Conversation     │
         │                          │
         │ conv.platform_status = { │
         │   is_connected: <bool>   │
         │ }                        │
         └──────────────┬───────────┘
                        │
                        ▼
         ┌──────────────────────────┐
         │ Step 4: Return Response  │
         │ {                        │
         │   success: true,         │
         │   data: [               │
         │     {..., platform_     │
         │      status: {...}}     │
         │   ]                      │
         │ }                        │
         └──────────────────────────┘
```

---

## 6. State Management Flow (Frontend)

```
Initial Load
    │
    ▼
┌──────────────────────────────┐
│ loadConversations()          │
│ - Get integrations           │
│ - For each oa_id:            │
│   GET /api/.../conversations │
│   Platform_status now in     │
│   response                   │
└──────────────────┬───────────┘
                   │
                   ▼
        ┌────────────────────────┐
        │ Map to React State:    │
        │ [                      │
        │   {                    │
        │     id: "...",         │
        │     platform: "...",   │
        │     name: "...",       │
        │     platform_status: { │
        │       is_connected: T/F│
        │     }                  │
        │   }                    │
        │ ]                      │
        └────────────┬───────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
    ┌─────────────┐        ┌──────────────┐
    │ Render      │        │ When user    │
    │ Conv List   │        │ clicks conv: │
    │             │        │              │
    │ Check:      │        │ Check:       │
    │ is_connected│        │ is_connected │
    │ T: normal   │        │ T: enabled   │
    │ F: disabled │        │ F: disabled  │
    └─────────────┘        └──────────────┘
```

---

## 7. Message Sending Flow

### Scenario 1: Connected Platform
```
User types message
        │
        ▼
Is platform_status.is_connected = true?
        │
      YES
        │
        ▼
Send button enabled ✓
User clicks send
        │
        ▼
POST /api/facebook/conversations/ID/messages
        │
        ▼
Message sent to platform ✓
        │
        ▼
Message appears in conversation
```

### Scenario 2: Disconnected Platform
```
User types message
        │
        ▼
Is platform_status.is_connected = true?
        │
       NO
        │
        ▼
Send button DISABLED ✗
Input shows: "Nền tảng không được kết nối"
        │
        ▼
User cannot click send button
        │
        ▼
Warning banner explains why
User goes to integrations to reconnect
```

---

## 8. State Lifecycle Diagram

```
┌──────────────────────────────┐
│ INTEGRATION CONNECTED        │
│ is_active = true             │
│ Conversations visible: YES   │
│ Messaging enabled: YES       │
└────────────┬─────────────────┘
             │
             │ User removes integration
             │ DELETE /api/integrations/id
             ▼
┌──────────────────────────────┐
│ INTEGRATION DEACTIVATED      │
│ is_active = false            │
│ Conversations visible: YES ← NEW!
│ Messaging enabled: NO ← NEW!
│ (showing warning)            │
└────────────┬─────────────────┘
             │
             │ User reconnects
             │ POST /api/integrations/auth/callback
             ▼
┌──────────────────────────────┐
│ INTEGRATION RECONNECTED      │
│ is_active = true             │
│ Conversations visible: YES   │
│ Messaging enabled: YES ← AUTOMATIC!
│ (warning removed)            │
└──────────────────────────────┘
```

---

## 9. Component Render Tree

```
ChatManagementPage (messages/page.js)
├── Sider (Left Sidebar)
│   ├── SearchBox
│   ├── FilterButtons
│   └── ConversationList
│       └── ConversationItem (for each)  ← MODIFIED
│           ├── Avatar
│           ├── Platform Icon
│           ├── Disconnected Badge ← NEW!
│           │   └── DisconnectOutlined
│           ├── Name
│           └── LastMessage
│
└── Content (Right Chat Area)
    ├── ChatHeader
    └── ChatBox ← MODIFIED
        ├── Alert (Platform Disconnected) ← NEW!
        ├── MessagesList
        │   ├── Message (incoming)
        │   └── Message (outgoing)
        ├── MessageInput ← MODIFIED (disabled state)
        └── SendButton ← MODIFIED (disabled when disconnected)
```

---

## 10. Error Handling Flow

```
Fetch conversations from DB
        │
        ├─ Success
        │   └─→ Proceed
        │
        └─ Error
            └─→ Log error
                └─→ Return empty array
                    └─→ Show "No conversations" message

Lookup integration status
        │
        ├─ Found & Active
        │   └─→ is_connected = true
        │
        ├─ Found & Inactive
        │   └─→ is_connected = false
        │
        ├─ Not found
        │   └─→ is_connected = false
        │
        └─ Error in lookup
            └─→ is_connected = false (safe default)
                └─→ Show warning indicator
                    └─→ Disable messaging
```

---

## 11. Before/After Screenshots Text Description

### Before Implementation
```
CONVERSATION LIST:
  [Facebook] John Doe
  [Facebook] Jane Smith
  [Zalo] Michael Brown
  
  (If Facebook disconnected, these disappear!)
  
CHATBOX (Open Conversation):
  [Normal conversation view]
  [Input active, send button enabled]
  [Can send message regardless of platform status]
```

### After Implementation
```
CONVERSATION LIST:
  [Facebook] John Doe
  [Facebook] Jane Smith
  [Facebook ❌] Old Customer (DISCONNECTED - still visible!)
  [Zalo] Michael Brown
  
  (Disconnected conversations still visible with warning icon!)
  
CHATBOX (Open Connected Conversation):
  [Normal conversation view]
  [Input active, send button enabled]
  [Can send message]
  
CHATBOX (Open Disconnected Conversation):
  ⚠️ Nền tảng không được kết nối
     Bạn không thể gửi tin nhắn vì nền tảng...
  [Input disabled]
  [Send button disabled]
  [Cannot send message - clear reason shown]
```

---

## 12. Implementation Checklist with Diagram

```
BACKEND
  ├─ ✓ Conversation model - already has find_by_oa()
  ├─ ✓ Integration model - already tracks is_active
  ├─ ☐ Facebook endpoint - ADD platform_status
  │  └─ Query conversations by oa_id (no filter by is_active)
  │  └─ Lookup integration and add status field
  └─ ☐ Zalo endpoint - ADD platform_status
     └─ Same as Facebook

FRONTEND
  ├─ ☐ ConversationItem.js
  │  ├─ Import DisconnectOutlined, Tooltip
  │  ├─ Add isDisconnected variable
  │  └─ Render disconnected indicator
  │
  ├─ ☐ ChatBox.js
  │  ├─ Import Alert
  │  ├─ Add isDisconnected variable
  │  ├─ Disable Input when disconnected
  │  ├─ Disable Send Button when disconnected
  │  └─ Show Alert when disconnected
  │
  └─ ☐ messages/page.js
     ├─ Pass platform_status through conversaton object
     └─ Socket handler - include platform_status in new conversations

TESTING
  ├─ ☐ Test Facebook endpoints return platform_status
  ├─ ☐ Test Zalo endpoints return platform_status
  ├─ ☐ Test conversation list shows disconnected conversations
  ├─ ☐ Test disconnected indicator appears
  ├─ ☐ Test ChatBox disables input for disconnected
  ├─ ☐ Test ChatBox shows warning for disconnected
  ├─ ☐ Test reconnecting platform re-enables messaging
  └─ ☐ Test connected platforms still work normally
```

---

## 13. Time Estimation

```
Backend Changes
  ├─ Facebook endpoint modification     30 min
  ├─ Zalo endpoint modification         20 min
  ├─ Testing backend changes            30 min
  └─ Subtotal:                          80 min

Frontend Changes
  ├─ ConversationItem.js modification   20 min
  ├─ ChatBox.js modification            30 min
  ├─ messages/page.js modification      15 min
  ├─ Testing frontend changes           60 min
  └─ Subtotal:                          125 min

TOTAL ESTIMATED TIME: 3-4 hours
```

This includes:
- Code writing
- Testing
- Minor debugging
- Does NOT include: Complex debugging, architecture changes, or major refactoring

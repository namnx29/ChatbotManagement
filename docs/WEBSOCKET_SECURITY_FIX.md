# WebSocket Security Fix: Account-Based Room Isolation

## Issue Addressed

While the API endpoints were fixed to prevent unauthorized conversation list access, the **real-time WebSocket broadcasts** were still leaking data to all connected clients. When a new message arrived:

1. The webhook handler would broadcast `update-conversation` events
2. ALL connected users would receive the event (unfiltered)
3. User B would see the conversation pop up in their sidebar, even if they don't own the integration
4. After reload, the API-level check would hide it

## Solution: Account-Based Room Filtering

### Architecture Changes

**Before (VULNERABLE):**
```python
socketio.emit('update-conversation', payload, broadcast=True)  # Sent to ALL clients
```

**After (SECURE):**
```python
socketio.emit('update-conversation', payload, room=f"account:{account_id}")  # Sent only to account's room
```

---

## Implementation Details

### 1. Updated Socket Emit Functions

#### Facebook Route (`server/routes/facebook.py`)

Modified `_emit_socket()` to support account-based rooms:

```python
def _emit_socket(event, payload, account_id=None, to_room=None):
    """Emit a socket event to a specific account room or broadcast.
    
    Args:
        event: Event name
        payload: Event payload
        account_id: If provided, emit only to this account's room (SECURITY FIX)
        to_room: Optional specific room name (for advanced use)
    """
    try:
        socketio = getattr(current_app, 'socketio', None)
        if not socketio:
            return False
        
        # SECURITY FIX: If account_id provided, emit to account-specific room
        if account_id:
            room = to_room or f"account:{account_id}"
            socketio.emit(event, payload, room=room)
            logger.debug(f"Emitted {event} to room {room}")
        else:
            # Legacy: broadcast to all (use only for public events)
            socketio.emit(event, payload, broadcast=True)
            logger.debug(f"Broadcasted {event} to all clients")
        
        return True
    except Exception as e:
        logger.error(f"Socket emit failed: {e}")
        return False
```

#### Zalo Route (`server/routes/zalo.py`)

Added new `_emit_socket_to_account()` helper:

```python
def _emit_socket_to_account(event, payload, account_id):
    """Emit a socket event to a specific account's room (SECURITY FIX).
    This ensures only authenticated users of the owning account receive the event.
    Prevents cross-account data leakage via WebSocket broadcasts.
    """
    try:
        socketio = getattr(current_app, 'socketio', None)
        if not socketio:
            return False
        
        room = f"account:{account_id}"
        socketio.emit(event, payload, room=room)
        logger.debug(f"Emitted {event} to account room {room}")
        return True
    except Exception as e:
        logger.error(f"Socket emit to account failed: {e}")
        return False
```

### 2. Webhook Emit Calls Updated

All webhook message handlers now extract the account_id from the integration and pass it:

#### Facebook Webhook (`server/routes/facebook.py`)
```python
# SECURITY FIX: Emit socket events only to the account that owns this integration
account_id_owner = integration.get('accountId')

# Emit new message event (unless deduped by outgoing echo)
_emit_socket('new-message', payload, account_id=account_id_owner)

# Emit conversation update event (for sidebar refresh)
_emit_socket('update-conversation', {...}, account_id=account_id_owner)
```

#### Zalo Webhook (`server/routes/zalo.py`)
```python
# SECURITY FIX: Emit socket events only to the account that owns this integration
account_id_owner = integration.get('accountId')

# Emit only to the account's room
_emit_socket_to_account('new-message', payload, account_id_owner)
_emit_socket_to_account('update-conversation', {...}, account_id_owner)
```

### 3. WebSocket Connection Handler (`server/app.py`)

Added connection handler to automatically join account-specific rooms:

```python
# SECURITY FIX: Register WebSocket connection handler to join account-specific rooms
@app.socketio.on('connect')
def handle_connect():
    """Handle WebSocket connection and join account-specific room."""
    try:
        from flask_login import current_user
        
        # Get account_id from authenticated user
        if current_user and current_user.is_authenticated:
            account_id = current_user.get_id()
            room = f"account:{account_id}"
            
            # Join the account-specific room
            from flask_socketio import join_room
            join_room(room)
            
            logger.info(f"User {account_id} connected and joined room {room}")
        else:
            logger.warning("Unauthenticated WebSocket connection attempt")
    except Exception as e:
        logger.error(f"Error in WebSocket connect handler: {e}")
```

**How it works:**
1. User authenticates and receives `account_id`
2. WebSocket connection is established
3. `connect` handler fires automatically
4. User is added to room: `account:{account_id}`
5. All future events sent to that room only reach that account's users

---

## Updated Endpoints

### Facebook Routes
- ✅ `/webhooks/facebook` (POST) - Webhook handler - now emits to account room
- ✅ `/api/facebook/conversations/<conv_id>/messages` (POST) - Send message - now emits to account room

### Zalo Routes
- ✅ `/webhook` (POST) - Webhook handler - now emits to account room
- ✅ `/api/zalo/conversations/<conv_id>/messages` (POST) - Send message - now emits to account room

---

## Security Benefits

| Scenario | Before | After |
|----------|--------|-------|
| Customer messages OA owned by Account A | Message shown to ALL connected users | Message shown only to Account A's users |
| User B views sidebar in real-time | Conversation appears for Account A's OA | No conversation appears (user not in room) |
| User B reloads page | API blocks access (403) | Already prevented by room filtering |
| New integrations are added | Updates broadcast to all users | Updates broadcast only to owning account |

---

## Testing Recommendations

1. **Test room isolation:**
   ```javascript
   // Client-side test with two browser windows
   // Window 1: Login as Account A
   // Window 2: Login as Account B
   
   // Send message to Account A's page
   // Verify it appears in Window 1's sidebar
   // Verify it does NOT appear in Window 2's sidebar
   ```

2. **Test connection:**
   ```bash
   # Check server logs for room join messages
   tail -f logs/server.log | grep "joined room"
   ```

3. **Monitor broadcasts:**
   - All `emit()` calls now include account_id
   - Check for "Emitted {event} to room account:{id}" log messages
   - No more "Broadcasted {event} to all clients" for conversation updates

---

## Files Modified

1. **server/routes/facebook.py**
   - Updated `_emit_socket()` function to support account-based rooms
   - Updated webhook handler to pass account_id to all emits
   - Updated send message handler to pass account_id to emits

2. **server/routes/zalo.py**
   - Added `_emit_socket_to_account()` helper function
   - Updated webhook handler to use account-aware emits
   - Updated send message handler to use account-aware emits

3. **server/app.py**
   - Added WebSocket `@connect` handler to join account-specific rooms
   - Extracts account_id from authenticated user
   - Joins room `account:{account_id}` automatically

---

## Backward Compatibility

- Legacy emit calls without `account_id` still work (broadcast to all)
- Recommended only for public events (not conversation data)
- All conversation-related events now use account-aware filtering

---

## Related Documentation

- See `SECURITY_FIXES_ACCOUNT_ISOLATION.md` for API-level authorization fixes
- Combined with API-level checks, provides defense-in-depth security

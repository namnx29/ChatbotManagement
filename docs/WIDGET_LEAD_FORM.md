Widget Lead Form — Implementation Notes

Overview
- Adds an embeddable "Chat Widget" that provides a small Lead Form for third-party sites.
- Widget SDK: `client/public/widget-sdk.js` — drop-in script exposing `window.ChatWidget.init({ organizationId, baseUrl })`.
- Lead form page: `/widget/lead-form` (`client/app/widget/lead-form/page.jsx`) — collects name, phone, message and persists form state to `localStorage`.
- Server endpoint: `POST /api/widget/lead` (`server/routes/widget.py`) — creates a `Conversation` and `Message` in MongoDB and emits `new-message`/`update-conversation` events to `organization:<id>` room so staff dashboards receive the lead.

Key Features & Fixes (v1.2 - Full Client Integration)
- **Conversation Persistence**: Each widget lead gets a unique `conversation_id` on first message, stored in localStorage to prevent duplicate conversations for subsequent messages.
- **Customer Info Display**: Customer name from form is now properly persisted and displayed in staff dashboard (no longer shows generic "Khách hàng").
- **Message Grouping**: All messages from the same lead are grouped into a single conversation (not a new one for each message).
- **Widget Conversation Retrieval**: Widget conversations are now included in the `/api/conversations/all` endpoint, filtered by organization_id.
- **conversation_id Handling**: conversation_id is properly converted to string before being sent to frontend to avoid ObjectId serialization errors.
- **Socket display_name**: Socket events now include `display_name` field so staff dashboard updates customer name immediately without reload.
- **Widget Message Endpoints**: Added full message endpoints similar to Facebook/Zalo:
  - `GET /api/widget/conversations/<conv_id>/messages` - Retrieve messages from a conversation
  - `POST /api/widget/conversations/<conv_id>/mark-read` - Mark messages as read
  - `POST /api/widget/conversations/<conv_id>/messages` - Send staff reply to customer
- **Client-Side Widget Support** (v1.2 NEW):
  - Added `getWidgetConversationMessages`, `markWidgetConversationRead`, `sendWidgetConversationMessage`, `sendWidgetConversationAttachment` functions in `lib/api.js`
  - Updated Messages page (`app/dashboard/messages/page.js`) to detect `platform === 'widget'` and route to widget endpoints
  - Added widget to filter options and conversation list displays
  - Added Widget icon (SVG) for consistent UI representation
  - Widget conversations now appear in the staff dashboard with full message support (no more "unsupported platform" error)
  - Mark-as-read, message sending, and attachment support fully functional for widget platform

Important Security Notes
- The endpoint currently trusts `X-Organization-ID` header or `organizationId` in the request body. This is convenient for testing but not secure for production.
- Recommendation: add an organization-scoped widget key, require it in an `X-Widget-Key` header, and validate it server-side before creating conversations.
- CORS / embedding: ensure your server CORS settings and `X-Frame-Options` / CSP allow embedding of `/widget/lead-form` into the provider's site.

Next Steps
- Add widget key management in organization settings and validation in `submit_lead` endpoint.
- Optionally add a dedicated socket.io namespace for widgets to support real-time replies and allow the iframe to connect reliably (current Socket.IO connection rejects unauthenticated clients).
- Add front-end tests and E2E tests to verify the full flow: SDK inject -> open iframe -> submit lead -> DB entry -> socket events -> staff dashboard updates -> staff reply -> widget receives message.

Usage Example

Drop this minimal snippet on the third-party site (replace `https://your-app.example` and `org_123`):

```html
<script src="https://your-app.example/widget-sdk.js"></script>
<script>
  // Initialize the widget, toggles FAB + iframe
  window.ChatWidget && window.ChatWidget.init({ organizationId: 'org_123', baseUrl: 'https://your-app.example' })
</script>
```

Local development (if frontend and API are on different ports):

- Serve the Next.js app (e.g., http://localhost:3000) and the backend API (e.g., http://localhost:5000).
- Open the iframe with an explicit `apiBase` to point the form to your API during development:

```html
<script src="http://localhost:3000/widget-sdk.js"></script>
<script>
  window.ChatWidget && window.ChatWidget.init({ organizationId: 'org_123', baseUrl: 'http://localhost:3000' })
</script>

<!-- In the iframe URL you can pass apiBase as well for the form, e.g. -->
<!-- http://localhost:3000/widget/lead-form?organizationId=org_123&apiBase=http://localhost:5000 -->
```

Testing Checklist
- [ ] Submit a lead via widget → Verify conversation appears in staff dashboard with correct customer name and phone.
- [ ] Send multiple messages from the widget → Verify they all belong to the same conversation (no duplicates).
- [ ] Refresh the staff dashboard → Verify widget leads persist and are still visible.
- [ ] Check server logs → Verify no "invalid conversation_id" errors when marking read or sending messages.
- [ ] Test localStorage → Verify form data persists across page reloads in the widget.
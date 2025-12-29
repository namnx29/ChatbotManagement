# Chatbot API (Deprecated)

The chatbot API and training features have been deprecated and removed from the project to focus on platform integrations such as Zalo OA. The server-side chatbot endpoints are no longer available; if chatbot functionality is reintroduced in the future, new documentation will be provided.

For now, please use the Integrations page to connect and manage platform accounts (Zalo, Facebook, etc.).

Endpoints

- `GET /api/chatbots`
  - Headers: `X-Account-Id: <accountId>`
  - Response: `{ success: true, data: [ { id, name, avatar_url, purpose, greeting, fields, created_at, updated_at } ] }`

- `POST /api/chatbots`
  - Headers: `X-Account-Id: <accountId>`
  - Body (JSON): `{ name, purpose, greeting, fields (array), avatar_url (optional) }`
  - Response: `{ success: true, data: { id, name, avatar_url, purpose, greeting, fields, created_at, updated_at } }`

- `POST /api/chatbots/avatar`
  - Headers: `X-Account-Id: <accountId>`
  - FormData: `avatar` file (image). Optional `chatbotId` to update existing chatbot avatar.
  - Response: `{ success: true, data: { avatar_url: '/uploads/avatars/<filename>' } }`

- `DELETE /api/chatbots/<id>`
  - Headers: `X-Account-Id: <accountId>`
  - Response: `{ success: true, message: 'Chatbot deleted' }`

- `GET /api/chatbots/<id>`
  - Headers: `X-Account-Id: <accountId>`
  - Response: `{ success: true, data: { id, name, avatar_url, purpose, greeting, fields, created_at, updated_at } }`

- `PUT /api/chatbots/<id>`
  - Headers: `X-Account-Id: <accountId>`
  - Body (JSON): `{ name, purpose, greeting, fields, avatar_url }` (only provided fields will be updated)
  - Response: `{ success: true, data: { id, name, avatar_url, purpose, greeting, fields, created_at, updated_at } }`

How to test locally

1. Start the server

```bash
# from repository root
python3 server/app.py
```

2. Ensure MongoDB is running and `MONGODB_URI` (or default) is correct in `server/config.py`.

3. Ensure frontend points to the server: set `NEXT_PUBLIC_API_URL=http://localhost:5000` in the client environment.

4. Provide an `accountId` for authenticated calls. For quick local testing, store it in browser localStorage (e.g. in browser console):

```js
localStorage.setItem('accountId', '<your-account-id>');
```

5. Open the training chatbot page in the client, click `Tạo chatbot`, choose an avatar (predefined or upload), fill in fields and submit. The new bot should appear in the list.

Notes

- Uploaded avatar files are saved to `server/uploads/avatars` and served by the Flask app at `/uploads/avatars/<filename>`.
- The client helper `client/lib/api.js` exposes `createChatbot`, `listChatbots`, `uploadChatbotAvatar`, and `deleteChatbot`.

UI Notes

- On the training chatbot pages, the sidebar shows the currently selected bot with its avatar and name. You can:
  - Click the avatar to upload/change the bot avatar (uses `POST /api/chatbots/avatar` with `chatbotId`)
  - Use the select box next to the name to switch between bots (this updates the URL and reloads the content for the selected bot)
  - Click "Chỉnh sửa tên" to open a modal and change the bot name (sends `PUT /api/chatbots/:id`)

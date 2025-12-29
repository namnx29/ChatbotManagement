# Zalo OA Integration Guide

This document describes how to configure and test the Zalo OA integration in this project (mock flows supported).

## Environment variables

- ZALO_APP_ID - Your Zalo App ID
- ZALO_APP_SECRET - Your Zalo App Secret
- ZALO_REDIRECT_URI - Callback URI (default `http://localhost:5000/api/zalo/callback`)
- ZALO_VERIFICATION_TOKEN - Verification token you set in Zalo Developer console
- ZALO_API_BASE - API base URL (default `https://openapi.zalo.me`)
- REDIS_URL - Redis server URL for PKCE storage (optional, the code falls back to in-memory store for local dev)
- AI_PROVIDER - `mock` (default) or `openai`
- AI_API_KEY - API key for your AI provider (OpenAI)

## Local testing mode using mocks

- If you don't have a Zalo app during development, the server will mock token exchange and sending messages.
- To test end-to-end:
  - Start the backend: `python server/app.py`
  - Ensure `client` is running: `npm run dev` in `client/`
  - In the admin dashboard, go to the integration page and click connect for Zalo. The button will request `/api/zalo/auth-url` (with `X-Account-Id` header) and redirect to Zalo. If not configured, the auth flow will be mocked.
  - To simulate a webhook POST directly, run:

```bash
curl -X POST http://localhost:5000/webhooks/zalo -H 'Content-Type: application/json' -d '{"data": {"type": "user_send_text", "text": "Hello from user", "sender": "user_123", "oa_id": "mock_oa_..."}}'
```

- The backend will emit a `new-message` event via Socket.IO and attempt to generate a reply using the configured AI provider (mock by default). The message will be displayed in the Next.js dashboard in real-time.

## Production notes

- Use Redis for PKCE storage and ensure the `REDIS_URL` is set.
- Run the app under a process manager and behind HTTPS for real Zalo integrations.
- Schedule and monitor token refresh jobs; verify logs for refresh failures.


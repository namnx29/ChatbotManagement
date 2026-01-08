# Facebook Page Integration Guide

This document describes how to configure and test Facebook Page integration in this project (mock flows supported).

## Environment variables

- FB_APP_ID - Your Facebook App ID
- FB_APP_SECRET - Your Facebook App Secret
- FB_REDIRECT_URI - Callback URI (default `https://your-ngrok-or-production-url.ngrok-free.dev/api/facebook/callback`)
- FB_VERIFICATION_TOKEN - Verification token you set in Facebook App Webhook settings
- FB_API_BASE - API base URL (default `https://graph.facebook.com`)
- FB_API_VERSION - Graph API version to use (default `v17.0`)
- FB_SCOPE - OAuth scopes to request from the user (default `pages_show_list,pages_messaging,pages_read_engagement`)

## Local testing mode using mocks

- If you don't have a Facebook App during development, the server will fallback to mock tokens for many flows.
- To test end-to-end locally:
  - Start the backend: `python server/app.py`
  - Ensure `client` is running: `npm run dev` in `client/`
  - In the admin dashboard, go to the Integrations page and click connect for Facebook. The button will request `/api/facebook/auth-url` (with `X-Account-Id` header) and redirect to Facebook. If not configured or permissions are insufficient, the server may fall back to a mock-page flow.

- To simulate a webhook POST directly, run:

```bash
curl -X POST http://localhost:5000/webhooks/facebook -H 'Content-Type: application/json' -d '{"entry":[{"id":"mock_page_123","messaging":[{"sender":{"id":"user_psid_123"},"recipient":{"id":"mock_page_123"},"message":{"text":"Hello from user"}}]}]}'
```

- The backend will emit a `new-message` event via Socket.IO and attempt to generate a reply using the configured AI provider (mock by default).

## Production notes

- Use HTTPS and configure the `FB_REDIRECT_URI` and webhook `callback URL` in your Facebook App Dashboard.
- Configure the Webhooks product to use the `FB_VERIFICATION_TOKEN` and subscribe to `messages` and `messaging_postbacks` (and other page events as needed).
- Monitor token refresh behavior — long-lived tokens and page tokens have specific lifetimes and may need manual handling or re-authorization.

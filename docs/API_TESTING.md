# API Testing Guide

Test the authentication endpoints using curl or Postman.

## Base URL

```
http://localhost:5000/api
```

## Health Check

```bash
curl -X GET http://localhost:5000/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "environment": "development"
}
```

## 1. Register User

```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "confirmPassword": "TestPass123!"
  }'
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account."
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Email already registered"
}
```

## 2. Login User

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "email": "test@example.com",
    "accountId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

**Error Response (403) - Email Not Verified:**
```json
{
  "success": false,
  "message": "Email not verified. Please check your email for verification link."
}
```

## 3. Check User Status

```bash
curl -X GET "http://localhost:5000/api/user-status?email=test@example.com"
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "email": "test@example.com",
    "is_verified": false,
    "accountId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## 4. Verify Email

**Note:** You need to get the verification token from the backend logs or email.

```bash
# Replace TOKEN, EMAIL, ACCOUNT_ID with actual values
curl -X GET "http://localhost:5000/api/verify-email?token=YOUR_TOKEN&email=test@example.com&accountId=ACCOUNT_ID"
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Link outdated or invalid"
}
```

## 5. Resend Verification Email

```bash
curl -X POST http://localhost:5000/api/resend-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification email resent. Please check your email."
}
```

**Error Response (404):**
```json
{
  "success": false,
  "message": "User not found"
}
```

## Testing Workflow

### Step 1: Register

```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "confirmPassword": "TestPass123!"
  }'
```

**Note:** Copy the email and check backend logs for verification token

### Step 2: Check Status (Before Verification)

```bash
curl -X GET "http://localhost:5000/api/user-status?email=test@example.com"
```

Should return `is_verified: false`

### Step 3: Verify Email

Get the token from backend logs, then:

```bash
curl -X GET "http://localhost:5000/api/verify-email?token=COPIED_TOKEN&email=test@example.com&accountId=ACCOUNT_ID"
```

### Step 4: Check Status (After Verification)

```bash
curl -X GET "http://localhost:5000/api/user-status?email=test@example.com"
```

Should return `is_verified: true`

### Step 5: Login

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

Should return user data

## Using Postman

1. Create a new Postman collection
2. Add requests with the endpoints above
3. Set `http://localhost:5000/api` as base URL
4. Use environment variables for email, token, accountId
5. Test the complete flow

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | Success | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Check input validation |
| 401 | Unauthorized | Invalid credentials |
| 403 | Forbidden | Email not verified |
| 404 | Not Found | User not found |
| 500 | Server Error | Check backend logs |

## Development Tips

1. **Check Backend Logs:** Flask logs all API calls and errors
2. **Database Inspection:** Use MongoDB Compass to view database state
3. **Token Debugging:** Tokens are logged in backend for development
4. **CORS Issues:** Check browser console for CORS errors
5. **Email Testing:** In development, emails are logged to console

## Sample Test Data

```
Email: test@example.com
Password: TestPass123!
Confirm: TestPass123!
```

**Password Requirements:**
- Minimum 6 characters
- At least 1 number
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 special character (!@#$%^&*(),.?":{}|<>)

## Troubleshooting

### "Email already registered"
- User already exists in database
- Try with different email address

### "Link outdated or invalid"
- Token has expired (24 hour limit)
- Use `/api/resend-verification` to get new token

### "Invalid email or password"
- Email doesn't exist or password is wrong
- Check user status first to verify email exists

### "Email not verified"
- Email must be verified before login
- Click verification link from email

---

For more information, see README.md and docs/Work.md

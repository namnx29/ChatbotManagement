# Email Configuration Guide

## Issue Analysis

The email sending failure you encountered:
```
ERROR:utils.email_service:Failed to send email to namtapcode@gmail.com: (535, b'5.7.8 Username and Password not accepted...')
```

This indicates that Gmail's SMTP authentication failed. This is **normal behavior** - the application gracefully handles email failures in development mode and continues operation.

---

## Why Email Fails in Development

Gmail requires **App Passwords** (not your regular Gmail password) for SMTP access. Here's why:

1. **Security**: Google blocks "less secure" apps from accessing your account directly
2. **2FA**: If you have 2-factor authentication enabled, you must use an App Password
3. **Default Configuration**: The `.env` file has placeholder credentials that won't work

---

## Solution: Setup Gmail SMTP Authentication

### Step 1: Enable 2-Factor Authentication (if not already enabled)

1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Click **Security** in the left sidebar
3. Scroll down to "How you sign in to Google"
4. Enable **2-Step Verification** if not already enabled

### Step 2: Create an App Password

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. You may need to sign in again
3. Select:
   - **App**: Mail
   - **Device**: Windows/Mac/Linux (or your OS)
4. Click **Generate**
5. Google will show you a 16-character password like: `abcd efgh ijkl mnop`
6. **Copy this password** (without spaces)

### Step 3: Update Your `.env` File

Edit `server/.env`:

```env
FLASK_ENV=development
FLASK_DEBUG=True
SECRET_KEY=dev-secret-key
MONGODB_URI=mongodb://localhost:27017/preny_db
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=namtapcode@gmail.com          # Your Gmail address
SMTP_PASSWORD=abcdefghijklmnop           # Your 16-char app password (no spaces)
VERIFICATION_TOKEN_EXPIRY=86400
FRONTEND_URL=http://localhost:3000
```

### Step 4: Restart Your Flask Server

```bash
# Stop the current server (Ctrl+C)
# Then restart it
python app.py
```

### Step 5: Test Email Sending

1. Register a new user in the application
2. Check the terminal/logs - you should see:
   ```
   INFO:utils.email_service:Verification email sent to user@example.com
   ```
3. Check your email inbox for the verification email

---

## Fallback: Development Mode Without Email

If you don't want to setup Gmail SMTP, the application still works in **development mode**:

```python
# In server/utils/email_service.py (line 108-110)
if Config.FLASK_ENV == 'development':
    logger.warning("Email sending failed, but continuing in development mode")
    return True  # Continue even if email fails
```

**To verify email without Gmail:**

1. Register a user → copy the verification token from the terminal log
2. Manually visit: `http://localhost:3000/verify-email?token=YOUR_TOKEN&email=user@example.com&accountId=USER_ACCOUNT_ID`
3. This verifies the email without needing to send one

---

## For Production

In production, use a professional email service:

### Option 1: SendGrid (Recommended)
```env
SMTP_SERVER=smtp.sendgrid.net
SMTP_PORT=587
SMTP_EMAIL=apikey
SMTP_PASSWORD=SG.xxxxxxxxxxx  # Your SendGrid API key
```

### Option 2: AWS SES
```env
SMTP_SERVER=email-smtp.region.amazonaws.com
SMTP_PORT=587
SMTP_EMAIL=your-ses-email@domain.com
SMTP_PASSWORD=your-ses-password
```

### Option 3: Mailgun
```env
SMTP_SERVER=smtp.mailgun.org
SMTP_PORT=587
SMTP_EMAIL=postmaster@yourdomain.mailgun.org
SMTP_PASSWORD=your-mailgun-password
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `Username and Password not accepted` | Your app password is incorrect or has spaces. Regenerate in Step 2. |
| `Less secure app blocked` | You didn't follow Step 1 & 2 correctly. Make sure 2FA is enabled first. |
| `Connection timed out` | Check SMTP_SERVER and SMTP_PORT are correct. Gmail requires port 587. |
| `Empty reply from server` | Your internet connection might be blocking port 587. Try a different network. |

---

## Summary of Changes Made

✅ **Authentication Protection Added**:
- Dashboard (`/dashboard`) - now requires login
- Profile (`/dashboard/profile`) - now requires login
- Redirects to login page if user not authenticated

✅ **Email Service** - Already handles failures gracefully in development mode

✅ **Logout Functionality** - Clears localStorage and redirects to login

---

## Testing the Authentication

### Test 1: Access Dashboard Without Login
1. Clear browser localStorage: Open DevTools → Application → localStorage → Clear all
2. Try to access `http://localhost:3000/dashboard`
3. **Expected**: Redirect to login page ✅

### Test 2: Login and Access Dashboard
1. Register a user
2. Verify email (click link or manually)
3. Login with credentials
4. **Expected**: Access dashboard successfully ✅

### Test 3: Logout
1. Click logout button in dashboard
2. Try to access dashboard again
3. **Expected**: Redirect to login page ✅

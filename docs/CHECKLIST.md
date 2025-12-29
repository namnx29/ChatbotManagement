# Development & Deployment Checklist

## Pre-Development Setup

### Prerequisites
- [ ] Node.js v16+ installed
- [ ] Python 3.8+ installed
- [ ] MongoDB installed or Atlas account created
- [ ] Git configured
- [ ] Text editor/IDE ready

### Repository Setup
- [ ] Clone/navigate to project directory
- [ ] Review `QUICKSTART.md` for setup overview
- [ ] Review `README.md` for architecture understanding

---

## Backend Setup

### Installation
- [ ] Navigate to `server` directory
- [ ] Create virtual environment: `python -m venv venv`
- [ ] Activate virtual environment: `source venv/bin/activate`
- [ ] Install dependencies: `pip install -r requirements.txt`

### Configuration
- [ ] Copy `.env` file (already provided)
- [ ] Update `MONGODB_URI` in `.env`:
  - [ ] For local: `mongodb://localhost:27017/preny_db`
  - [ ] For Atlas: Update with your connection string
- [ ] Update `SMTP_EMAIL` and `SMTP_PASSWORD`:
  - [ ] Use Gmail account (generate app password)
  - [ ] Or use other SMTP service
- [ ] Update `FRONTEND_URL` if using different port
- [ ] Update `SECRET_KEY` for production

### Database Setup
- [ ] MongoDB running (local or Atlas accessible)
- [ ] Test connection: `mongosh` or MongoDB Compass
- [ ] Database will auto-create on first register

### Startup
- [ ] Start backend: `python app.py`
- [ ] Verify output shows startup info
- [ ] Check: `curl http://localhost:5000/api/health`
- [ ] Should return: `{"status": "healthy", "environment": "development"}`

---

## Frontend Setup

### Installation
- [ ] Navigate to `client` directory
- [ ] Install dependencies: `npm install`
- [ ] Verify `.env.local` exists and is correct

### Configuration
- [ ] Verify `NEXT_PUBLIC_API_URL` in `.env.local`
- [ ] Should be: `http://localhost:5000`
- [ ] Update if backend is on different URL

### Build & Run
- [ ] Run development server: `npm run dev`
- [ ] Wait for compilation complete
- [ ] Verify: `http://localhost:3000` is accessible
- [ ] Check console for any errors

---

## Feature Testing

### Registration Flow
- [ ] Navigate to `http://localhost:3000/register`
- [ ] Fill form:
  - [ ] Email: valid email (e.g., test@example.com)
  - [ ] Password: meets requirements (6+ chars, upper, lower, number, special)
  - [ ] Confirm: same as password
- [ ] Click submit
- [ ] Verify:
  - [ ] Success notification appears
  - [ ] Redirected to `/send-email`
  - [ ] No console errors

### Email Verification (Development)
Option A - Check backend logs:
- [ ] Find verification token in backend console output
- [ ] Copy token

Option B - Use endpoint:
```bash
curl -X GET "http://localhost:5000/api/user-status?email=test@example.com"
```

Then verify:
- [ ] Navigate to: `http://localhost:3000/verify-email?token=TOKEN&email=test@example.com&accountId=ACCOUNT_ID`
- [ ] Replace TOKEN and ACCOUNT_ID with actual values
- [ ] Should see success message
- [ ] Should redirect to login in 2 seconds

### Continue Button on Send-Email Page
- [ ] On `/send-email` page, click "Tiếp tục"
- [ ] Before verification: Should show error
- [ ] After verification: Should show success and redirect to login

### Resend Email
- [ ] On `/send-email` page, wait 60 seconds
- [ ] Click "Gửi lại email"
- [ ] Should see success notification
- [ ] New verification email sent (check backend logs)
- [ ] Countdown resets to 60 seconds

### Login Flow
- [ ] Navigate to `http://localhost:3000/login`
- [ ] Enter email and password used during registration
- [ ] Click "Đăng nhập"
- [ ] Verify:
  - [ ] Success notification appears
  - [ ] Redirected to `/dashboard`
  - [ ] Email stored in localStorage

### Error Cases
- [ ] Try registering with existing email → Error message
- [ ] Try login with wrong password → Error message
- [ ] Try login with unverified email → Error message
- [ ] Try accessing verify-email with wrong token → Error message

---

## Production Deployment Preparation

### Backend Preparation
- [ ] [ ] Change `FLASK_ENV` to `production`
- [ ] [ ] Set `FLASK_DEBUG` to `False`
- [ ] [ ] Generate strong `SECRET_KEY`
- [ ] [ ] Use production MongoDB (Atlas recommended)
- [ ] [ ] Set real SMTP credentials (Gmail, SendGrid, etc.)
- [ ] [ ] Update `FRONTEND_URL` to production domain
- [ ] [ ] Update `CORS_ORIGINS` with production URL
- [ ] [ ] Test with production settings locally

### Frontend Preparation
- [ ] Update `.env.local` with production API URL
- [ ] Build: `npm run build`
- [ ] Test build: `npm start`
- [ ] Verify production build works
- [ ] Remove debug code if any

### Security Checklist
- [ ] [ ] No hardcoded secrets in code
- [ ] [ ] All sensitive data in `.env` files
- [ ] [ ] `.env` files NOT committed to git
- [ ] [ ] `.gitignore` includes `.env` and `venv`
- [ ] [ ] CORS properly configured for production domain
- [ ] [ ] HTTPS enabled in production
- [ ] [ ] MongoDB credentials not in code
- [ ] [ ] SMTP credentials not in code
- [ ] [ ] SECRET_KEY is strong and random

### Database Preparation
- [ ] MongoDB Atlas cluster created
- [ ] Database user created with strong password
- [ ] IP whitelist configured
- [ ] Backups enabled
- [ ] Test connection from production environment

### Email Service
- [ ] Email provider account set up
- [ ] SMTP credentials obtained
- [ ] Test email sending works
- [ ] Email templates reviewed
- [ ] From email address configured

---

## Testing Commands

### Backend Health Check
```bash
curl -X GET http://localhost:5000/api/health
```

### Register User
```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","confirmPassword":"TestPass123!"}'
```

### Check User Status
```bash
curl -X GET "http://localhost:5000/api/user-status?email=test@example.com"
```

### Login User
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'
```

See `API_TESTING.md` for more examples.

---

## Troubleshooting

### MongoDB Connection Issues
- [ ] MongoDB is running (`mongod`)
- [ ] Connection string is correct in `.env`
- [ ] For Atlas, IP whitelist includes your IP
- [ ] Network connectivity verified

### Email Not Sending
- [ ] SMTP credentials correct
- [ ] Gmail: App Password used (not regular password)
- [ ] Gmail: "Less secure apps" enabled if needed
- [ ] Check backend logs for errors
- [ ] Test with development fallback mode

### CORS Errors
- [ ] Frontend and backend on correct ports
- [ ] Backend `CORS_ORIGINS` includes frontend URL
- [ ] Check browser console for CORS error details
- [ ] Clear browser cache and cookies
- [ ] Restart both servers

### Login Not Working
- [ ] Email verified in database
- [ ] Check backend logs for specific error
- [ ] Verify password hashing working
- [ ] Check user exists with correct email

### Verification Link Issues
- [ ] Token hasn't expired (24 hours)
- [ ] URL parameters correct (token, email, accountId)
- [ ] User exists in database
- [ ] Database connection working

---

## Monitoring & Maintenance

### Development
- [ ] Monitor backend console for errors
- [ ] Check browser console for client errors
- [ ] Review database occasionally (MongoDB Compass)
- [ ] Keep dependencies updated

### Production
- [ ] Set up application logging
- [ ] Monitor error rates
- [ ] Check email delivery rates
- [ ] Review database performance
- [ ] Regular backups verified
- [ ] Update dependencies regularly
- [ ] Monitor SMTP quota/limits

---

## Performance Optimization (Future)

- [ ] Implement rate limiting on endpoints
- [ ] Add database indexes for common queries
- [ ] Cache frequently accessed data
- [ ] Implement pagination for large results
- [ ] Optimize email service (queue/background jobs)
- [ ] Add request validation schemas
- [ ] Implement logging levels
- [ ] Add monitoring dashboards

---

## Feature Enhancements (Future)

- [ ] Password reset functionality
- [ ] Account deactivation
- [ ] Email preferences/notifications
- [ ] Two-factor authentication
- [ ] OAuth integration (Google, GitHub)
- [ ] Session management
- [ ] User profile management
- [ ] Account security audit log

---

## Documentation Review

- [ ] `IMPLEMENTATION_SUMMARY.md` - Read for overview
- [ ] `QUICKSTART.md` - Used for setup
- [ ] `README.md` - For detailed documentation
- [ ] `API_TESTING.md` - For API reference
- [ ] `docs/Work.md` - For implementation details

---

## Sign-Off

- [ ] All features tested and working
- [ ] No console errors in development
- [ ] Documentation reviewed and accurate
- [ ] Team trained on deployment process
- [ ] Monitoring set up for production
- [ ] Backup procedure documented
- [ ] Ready for production deployment

---

**Checklist Version:** 1.0  
**Last Updated:** December 9, 2025

---

## Notes Section

Use this space to document any specific configurations or issues found during setup:

```
[Your notes here]
```

# Project Overview & Architecture

## 🎯 What Was Built

A **complete, production-ready user authentication system** with:
- ✅ User Registration with validation
- ✅ Email Verification with 24-hour expiry tokens
- ✅ Secure Login with bcrypt password hashing
- ✅ Resend Verification Email functionality
- ✅ Status checking for email verification

---

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      USER'S BROWSER                          │
│           http://localhost:3000 (Next.js)                   │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Login     │  │  Register    │  │  Email Verify    │   │
│  │   Page      │  │   Page       │  │     Page         │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                │                    │              │
└─────────┼────────────────┼────────────────────┼──────────────┘
          │                │                    │
          │  HTTP API Calls (JSON)              │
          │                │                    │
┌─────────▼────────────────▼────────────────────▼──────────────┐
│              BACKEND API LAYER                               │
│        http://localhost:5000 (Flask)                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  /register   │  │   /login     │  │ /verify-email   │   │
│  │  /resend     │  │ /user-status │  │ /health         │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                    │              │
│         └─────────────────┼────────────────────┘              │
│                           │                                  │
│                    ┌──────▼──────┐                           │
│                    │  User Model  │                          │
│                    │  Validation  │                          │
│                    │  Password    │                          │
│                    │  Hashing     │                          │
│                    └──────┬───────┘                          │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
              ┌─────────────┼──────────────┐
              │             │              │
              ▼             ▼              ▼
        ┌─────────┐  ┌──────────┐  ┌─────────────┐
        │ MongoDB │  │ Bcrypt   │  │ Email SMTP  │
        │Database │  │ Hashing  │  │ Service     │
        └─────────┘  └──────────┘  └─────────────┘
```

---

## 📊 User Flow Diagram

### Registration to Login Journey

```
START
  │
  ▼
┌─────────────────────┐
│  User clicks        │
│  "Register"         │
│  on Login page      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ User fills registration form            │
│ - Email: user@example.com              │
│ - Password: SecurePass123!             │
│ - Confirm: SecurePass123!              │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ Frontend validates:                     │
│ ✓ Email format                          │
│ ✓ Password matches confirm              │
│ ✓ Password strength                     │
└──────────┬──────────────────────────────┘
           │
           ▼
    POST /api/register
    (email, password, confirmPassword)
           │
           ▼
┌─────────────────────────────────────────┐
│ Backend:                                │
│ 1. Validate input                       │
│ 2. Check email uniqueness               │
│ 3. Hash password with bcrypt            │
│ 4. Generate verification token          │
│ 5. Create user (is_verified: false)     │
│ 6. Send verification email              │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ Frontend: Show success                  │
│ - "Registration successful"             │
│ - Redirect to /send-email               │
│ - Store email in localStorage           │
└──────────┬──────────────────────────────┘
           │
           ▼
    ┌──────────────────────────────┐
    │ EMAIL VERIFICATION PROCESS   │
    │ (Two paths: Auto or Manual)  │
    └────────────┬─────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼ AUTO            ▼ MANUAL
    ┌─────────────┐   ┌──────────────────┐
    │ User clicks │   │ User on          │
    │ email link  │   │ /send-email page │
    │ from email  │   │ clicks "Continue"│
    └──────┬──────┘   └────────┬─────────┘
           │                   │
           ▼                   ▼
    URL params:      GET /api/user-status
    token, email,    ?email=...
    accountId        
           │                   │
           ▼                   ▼
    GET /api/verify-email   Check if
    ?token=...              is_verified
    &email=...
    &accountId=...
           │                   │
           ▼                   ▼
    ┌──────────────┐   ┌──────────────┐
    │ Backend      │   │ If true:     │
    │ validates    │   │ Redirect to  │
    │ token & ID   │   │ /login       │
    │ Sets         │   │              │
    │ is_verified: │   │ If false:    │
    │ true         │   │ Show error & │
    │              │   │ resend option│
    └──────┬───────┘   └──────┬───────┘
           │                  │
           ▼                  ▼
    ┌───────────────────────────────┐
    │ Frontend: Show success        │
    │ "Email verified"              │
    │ Redirect to /login after 2s   │
    └──────────────┬────────────────┘
                   │
                   ▼
    ┌─────────────────────────────┐
    │ User on /login page         │
    │ - Enters email              │
    │ - Enters password           │
    │ - Clicks "Đăng nhập"        │
    └──────────────┬──────────────┘
                   │
                   ▼
              POST /api/login
              (email, password)
                   │
                   ▼
    ┌─────────────────────────────┐
    │ Backend:                    │
    │ 1. Find user by email       │
    │ 2. Verify password hash     │
    │ 3. Check is_verified: true  │
    │ 4. Return user data         │
    └──────────────┬──────────────┘
                   │
                   ▼
    ┌─────────────────────────────┐
    │ Frontend:                   │
    │ - Show "Login successful"   │
    │ - Store user in localStorage│
    │ - Redirect to /dashboard    │
    └──────────────┬──────────────┘
                   │
                   ▼
                  END
            ✅ User logged in!
```

---

## 🔄 Component Interaction

### Data Flow

```
Frontend                    Backend                 Database
─────────────              ────────                ────────

Register Form    ──POST──▶  /api/register  ──▶  Create User
                           ├─ Hash Password       └─ is_verified: false
                           ├─ Generate Token
                           └─ Send Email

Send-Email Pg    ──GET──▶   /api/user-status  ──▶  Check Status
                           └─ Return is_verified

Verify-Email Pg  ──GET──▶   /api/verify-email  ──▶  Update User
                           └─ Validate Token        └─ is_verified: true

Resend Button    ──POST──▶  /api/resend-ver  ──▶  Update Token
                           └─ Send Email

Login Form       ──POST──▶  /api/login  ──▶  Check User
                           └─ Return user data
```

---

## 📱 Page Structure

### Frontend Pages

```
app/
├── login/page.js
│   ├── Form (email, password)
│   ├─ loginUser() API call
│   ├─ Success: Redirect to /dashboard
│   └─ Error: Show notification
│
├── register/page.js
│   ├── Form (email, password, confirm)
│   ├─ Password strength indicator
│   ├─ registerUser() API call
│   ├─ Success: Redirect to /send-email
│   └─ Error: Show notification
│
├── send-email/page.js
│   ├── Instructions to check email
│   ├── Continue Button
│   │   └─ getUserStatus() API call
│   │      ├─ If verified: Redirect to /login
│   │      └─ If not: Show error
│   └── Resend Email Button (60s delay)
│       └─ resendVerificationEmail() API call
│
└── verify-email/page.js (NEW)
    ├── Extract URL params (token, email, accountId)
    ├── verifyEmail() API call
    ├── Success: Show message + redirect to /login
    └── Error: Show message + link to /register
```

---

## 🛠️ Technology Stack Details

### Frontend Stack
```
Next.js 16 (App Router)
├─ React 19.2.1
├─ Ant Design 6.0.1
│  ├─ Form components
│  ├─ Input components
│  ├─ Button components
│  ├─ Message/Notification
│  └─ Result components
├─ TailwindCSS 4.1
├─ API Client (fetch-based)
└─ Router (useRouter, useSearchParams)
```

### Backend Stack
```
Flask 2.3.3
├─ Flask-CORS 4.0.0
├─ Flask-PyMongo 2.3.0
├─ PyMongo 4.5.0
│  └─ MongoDB connection
├─ Bcrypt 4.1.0
│  └─ Password hashing
├─ Python-dotenv 1.0.0
│  └─ Environment config
└─ SMTP (smtplib)
   └─ Email sending
```

### Database
```
MongoDB
├─ Collections: users
├─ Fields:
│  ├─ _id (ObjectId, auto)
│  ├─ email (string, unique)
│  ├─ password (string, hashed)
│  ├─ is_verified (boolean)
│  ├─ verification_token (string)
│  ├─ verification_token_expires_at (date)
│  ├─ accountId (string, unique)
│  ├─ created_at (date)
│  └─ updated_at (date)
└─ Indexes:
   ├─ email (unique)
   ├─ accountId (unique)
   └─ verification_token (sparse)
```

---

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────┐
│              SECURITY LAYERS                    │
├─────────────────────────────────────────────────┤
│                                                 │
│ 1. TRANSPORT LAYER                              │
│    └─ HTTPS (production)                        │
│                                                 │
│ 2. API LAYER                                    │
│    ├─ CORS (origin whitelist)                   │
│    ├─ Input validation                          │
│    └─ Error sanitization                        │
│                                                 │
│ 3. PASSWORD LAYER                               │
│    └─ Bcrypt hashing (10 rounds + salt)         │
│                                                 │
│ 4. TOKEN LAYER                                  │
│    ├─ 32-char random verification tokens        │
│    ├─ 24-hour expiry                            │
│    └─ One-time use                              │
│                                                 │
│ 5. DATABASE LAYER                               │
│    ├─ Unique email constraint                   │
│    ├─ Unique accountId                          │
│    ├─ Hashed passwords only                     │
│    └─ No sensitive data in logs                 │
│                                                 │
│ 6. SESSION LAYER                                │
│    └─ localStorage (client-side)                │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 📊 API Endpoint Overview

| Endpoint | Method | Purpose | Input | Auth |
|----------|--------|---------|-------|------|
| `/register` | POST | Register user | email, password | None |
| `/login` | POST | Login user | email, password | None |
| `/verify-email` | GET | Verify email | token, email, accountId | None |
| `/resend-verification` | POST | Resend email | email | None |
| `/user-status` | GET | Check status | email | None |
| `/health` | GET | Health check | None | None |

---

## 🚀 Deployment Architecture

### Development Setup
```
┌─────────────────────────────────────────┐
│         Development Machine             │
├─────────────────────────────────────────┤
│                                         │
│  ┌────────────────────────────────┐   │
│  │ Frontend: localhost:3000        │   │
│  │ (npm run dev)                   │   │
│  └────────────────────────────────┘   │
│                                         │
│  ┌────────────────────────────────┐   │
│  │ Backend: localhost:5000         │   │
│  │ (python app.py)                 │   │
│  └────────────────────────────────┘   │
│                                         │
│  ┌────────────────────────────────┐   │
│  │ MongoDB: localhost:27017        │   │
│  │ (mongod)                        │   │
│  └────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Production Setup (Recommended)
```
┌────────────────────────────────────────────────┐
│            Production Environment              │
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────────────────────────────────┐    │
│  │ Frontend: CDN/Vercel/Netlify         │    │
│  │ - Next.js static export              │    │
│  │ - Global CDN distribution            │    │
│  │ - Domain: preny.ai                   │    │
│  └──────────────────────────────────────┘    │
│                                                │
│  ┌──────────────────────────────────────┐    │
│  │ Backend: Heroku/AWS/DigitalOcean     │    │
│  │ - Gunicorn + Flask                   │    │
│  │ - SSL/TLS enabled                    │    │
│  │ - API: api.preny.ai                  │    │
│  └──────────────────────────────────────┘    │
│                                                │
│  ┌──────────────────────────────────────┐    │
│  │ Database: MongoDB Atlas               │    │
│  │ - Managed service                    │    │
│  │ - Automated backups                  │    │
│  │ - IP whitelist                       │    │
│  └──────────────────────────────────────┘    │
│                                                │
│  ┌──────────────────────────────────────┐    │
│  │ Email: SendGrid/Gmail Business       │    │
│  │ - SMTP credentials                   │    │
│  │ - Email templates                    │    │
│  │ - Bounce handling                    │    │
│  └──────────────────────────────────────┘    │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 📚 Documentation Files Map

```
Documentation Files:
├── 00_START_HERE.md ◄─── Read this first!
├── INDEX.md ◄─── Navigate all docs
├── QUICKSTART.md ◄─── 5-min setup
├── README.md ◄─── Complete documentation
├── API_TESTING.md ◄─── API examples
├── CHECKLIST.md ◄─── Setup & deployment
├── IMPLEMENTATION_SUMMARY.md ◄─── Project overview
└── docs/Work.md ◄─── Architecture details
```

---

## ✅ Implementation Checklist

- ✅ Backend API implemented
- ✅ MongoDB integration complete
- ✅ Bcrypt password hashing setup
- ✅ Email verification working
- ✅ Frontend API layer created
- ✅ All pages updated
- ✅ Error handling implemented
- ✅ Notifications configured
- ✅ Redirects working
- ✅ Documentation complete

---

## 🎯 Key Features

| Feature | Status | Implementation |
|---------|--------|-----------------|
| User Registration | ✅ | POST /api/register |
| Password Validation | ✅ | Frontend + Backend |
| Password Hashing | ✅ | Bcrypt (10 rounds) |
| Email Uniqueness | ✅ | MongoDB unique index |
| Email Verification | ✅ | Token-based (24hr) |
| Verification Email | ✅ | SMTP service |
| Resend Email | ✅ | POST /api/resend-verification |
| User Login | ✅ | POST /api/login |
| Verification Check | ✅ | GET /api/verify-email |
| Status Check | ✅ | GET /api/user-status |
| Error Notifications | ✅ | Ant Design message |
| Success Notifications | ✅ | Ant Design message |
| Loading States | ✅ | Button disabled state |
| Redirects | ✅ | useRouter navigation |
| localStorage | ✅ | User data persistence |

---

**Architecture Complete! Ready for Development, Testing, and Deployment.**

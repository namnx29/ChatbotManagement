# Full-Stack Integration: User Authentication & Email Verification

## 📊 Codebase Analysis Summary

### Client-Side Structure (Next.js/JavaScript/Ant Design)
- **Framework:** Next.js 16.0.7 with React 19.2.1
- **UI Library:** Ant Design 6.0.1
- **Styling:** TailwindCSS 4.1.17 + PostCSS
- **Path Config:** Supports `@/*` alias pointing to root directory

### Existing Page Structure
1. **`app/layout.js`** - Root layout with Geist fonts
2. **`app/page.js`** - Home/landing page (template)
3. **`app/login/page.js`** - Login form with email/password fields, "Forgot Password" link, and "Register" link (142 lines)
4. **`app/register/page.js`** - Registration form with password strength validator (349 lines)
5. **`app/send-email/page.js`** - Email verification instructional page with countdown timer for resend (149 lines)
6. **`app/forgot-password/page.js`** - Forgot password form (140 lines)
7. **`app/dashboard/page.js`** - Dashboard stub (currently empty)
8. **`app/dashboard/layout.js`** - Dashboard layout (exists)
9. **`app/dashboard/profile/page.js`** - Profile page stub (exists)

### Current State of Implementation
- **Login/Register pages:** UI fully designed with Ant Design components, no backend integration
- **Send-email page:** Has countdown timer logic but no backend integration for verification status checking
- **State Management:** Component-level state with `useState`
- **API Calls:** No API integration layer exists yet

---

## 🎯 Detailed Implementation Plan

### Phase 1: Backend Setup (Flask/MongoDB)

#### 1.1 Project Structure
```
server/
├── app.py
├── config.py
├── requirements.txt
├── models/
│   └── user.py
├── routes/
│   ├── __init__.py
│   ├── auth.py
│   └── email.py
├── utils/
│   ├── __init__.py
│   ├── email_service.py
│   └── token_generator.py
└── .env
```

#### 1.2 Core Components
- **Flask App Initialization** with CORS support for cross-origin requests from Next.js (localhost:3000)
- **MongoDB Connection** using Flask-PyMongo or PyMongo
- **User Schema** with fields:
  - `_id` (ObjectId, auto-generated)
  - `email` (string, unique, indexed)
  - `password` (string, hashed with bcrypt)
  - `is_verified` (boolean, default: false)
  - `verification_token` (string, unique)
  - `accountId` (string, unique identifier)
  - `created_at` (datetime)
  - `updated_at` (datetime)
  - `verification_token_expires_at` (datetime, for token expiration)

#### 1.3 API Endpoints to Implement

**POST /api/register**
- Input: `{ email, password, confirmPassword }`
- Output: `{ success: true, message: "Registration successful" }`
- Logic:
  - Validate email format and password strength
  - Check if email already exists
  - Hash password using bcrypt
  - Create user with `is_verified: false`, `verification_token` (random 32-char string), `accountId` (UUID)
  - Send verification email
  - Return success response

**POST /api/login**
- Input: `{ email, password }`
- Output: `{ success: true, message: "Login successful", user: { email, accountId } }` or error
- Logic:
  - Check if email exists in database
  - Verify password hash
  - Check if email is verified
  - Return success/error response

**GET /api/verify-email**
- Query Params: `token`, `email`, `accountId`
- Output: `{ success: true, message: "Email verified" }` or error
- Logic:
  - Find user by email and accountId
  - Verify token matches and hasn't expired
  - Set `is_verified: true`
  - Clear verification token
  - Return success response

**POST /api/resend-verification**
- Input: `{ email }`
- Output: `{ success: true, message: "Verification email resent" }` or error
- Logic:
  - Find user by email
  - Generate new verification token
  - Send verification email
  - Return success response

**GET /api/user-status**
- Query Params: `email`
- Output: `{ is_verified: true/false, email: "..." }`
- Logic:
  - Find user by email
  - Return verification status

#### 1.4 Email Service
- Implementation using `smtplib` (Python standard library)
- Dummy/test configuration if real credentials unavailable
- Email template with verification link format: `https://preny.ai/verify-email?token=[TOKEN]&email=[EMAIL]&accountId=[ACCOUNT_ID]`

#### 1.5 Security Measures
- Bcrypt for password hashing (minimum 10 rounds)
- Verification tokens expire after 24 hours
- CORS configured for Next.js development/production URLs
- Input validation on all endpoints
- Email uniqueness constraint at database level

---

### Phase 2: Frontend Integration (Next.js/Ant Design)

#### 2.1 Utility Layer
- Create `lib/api.js` with utility function:
  - `apiCall(method, endpoint, data)` - Centralized API caller for backend communication
  - Base URL configuration for backend (e.g., `http://localhost:5000`)

#### 2.2 Login Page Updates (`app/login/page.js`)
- **Form Integration:**
  - Email and password fields (already exist)
  - Form submission to call `POST /api/login`
  - Loading state during request
  
- **Success Handling:**
  - Show Ant Design `message.success("Đăng nhập thành công")` notification
  - Store user email in localStorage/state (optional)
  - Redirect to `/dashboard` using `useRouter`
  
- **Error Handling:**
  - Show Ant Design `message.error()` with error message from backend
  
- **UI Enhancements:**
  - "Don't have an account?" link already present (Register link)
  - Add disabled state to submit button during loading

#### 2.3 Registration Page Updates (`app/register/page.js`)
- **Form Integration:**
  - Email, password, confirm password fields (already exist)
  - Add validation for matching passwords
  - Form submission to call `POST /api/register`
  
- **Success Handling:**
  - On successful registration, immediately redirect to `/send-email`
  - Store email in localStorage/state for use on send-email page
  
- **Error Handling:**
  - Show Ant Design `message.error()` with error message
  - Handle duplicate email error
  
- **State Management:**
  - Track password field for strength indicator (already exists)
  - Add loading state for form submission

#### 2.4 Send-Email Page Updates (`app/send-email/page.js`)
- **Continue Button Logic:**
  - On click, call `GET /api/user-status?email=...`
  - If `is_verified: true` → show success notification and redirect to `/login`
  - If `is_verified: false` → show error notification
  
- **Resend Email Logic:**
  - On click, call `POST /api/resend-verification` with email
  - Reset countdown timer to 60 seconds
  - Show success notification
  
- **Data Retrieval:**
  - Retrieve email from localStorage or URL params (passed from registration)
  - Display user's email on page

#### 2.5 Verify Email Page (New)
- **Path:** `app/verify-email/page.js`
- **Functionality:**
  - Extract `token`, `email`, and `accountId` from URL query parameters using `useSearchParams()`
  - On component mount, automatically call `GET /api/verify-email?token=...&email=...&accountId=...`
  - **Success:** Show "Email Verified Successfully" notification, redirect to `/login` after 2 seconds
  - **Failure:** Show "Link outdated or invalid" notification, provide button to go back

#### 2.6 API Integration Layer
- Create `lib/api.js`:
  ```javascript
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  
  export async function apiCall(method, endpoint, data = null) {
    const config = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (data) config.body = JSON.stringify(data);
    
    const response = await fetch(`${API_BASE_URL}/api${endpoint}`, config);
    const result = await response.json();
    
    if (!response.ok) throw new Error(result.message || 'API Error');
    return result;
  }
  ```

#### 2.7 State & Navigation
- Use `useRouter()` from `next/navigation` for programmatic navigation
- Use `useSearchParams()` from `next/navigation` for URL parameter extraction
- Store email in localStorage during registration for send-email page
- Optional: Implement basic auth state context for user session management

---

### Phase 3: Environment Configuration

#### 3.1 Backend Environment (.env in server/)
```
MONGODB_URI=mongodb://localhost:27017/preny_db
FLASK_ENV=development
FLASK_DEBUG=True
SECRET_KEY=your-secret-key
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-app-password
VERIFICATION_TOKEN_EXPIRY=86400
FRONTEND_URL=http://localhost:3000
```

#### 3.2 Frontend Environment (.env.local in client/)
```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## 📋 Task Breakdown

### Backend Tasks (server/)
1. [ ] Create Flask project structure and `requirements.txt`
2. [ ] Set up MongoDB connection and configuration
3. [ ] Implement User model/schema in MongoDB
4. [ ] Create utility functions: `hash_password()`, `verify_password()`, `generate_verification_token()`
5. [ ] Implement email service with SMTP configuration
6. [ ] Create POST `/api/register` endpoint
7. [ ] Create POST `/api/login` endpoint
8. [ ] Create GET `/api/verify-email` endpoint
9. [ ] Create POST `/api/resend-verification` endpoint
10. [ ] Create GET `/api/user-status` endpoint
11. [ ] Configure CORS for Next.js frontend
12. [ ] Test all endpoints with Postman/curl

### Frontend Tasks (client/)
1. [ ] Create `lib/api.js` with centralized API caller
2. [ ] Update `app/login/page.js` with backend integration
3. [ ] Update `app/register/page.js` with backend integration
4. [ ] Update `app/send-email/page.js` with status checking logic
5. [ ] Create `app/verify-email/page.js` for email verification
6. [ ] Add `.env.local` with API base URL
7. [ ] Test full authentication flow end-to-end

### Deployment & Configuration
1. [ ] Add `server/.env` for backend configuration
2. [ ] Update `next.config.mjs` if needed for API routing
3. [ ] Document API endpoints and usage
4. [ ] Create startup scripts for both backend and frontend

---

## 🔄 User Flow Diagram

```
[HOME PAGE]
     ↓
[REGISTER PAGE] ← [LOGIN PAGE]
     ↓                ↑
 Register API         │
     ↓                │
[SEND-EMAIL PAGE] ← [User clicks login after verification]
     ↓
Check Email
(Continue button)
     ↓
[VERIFY-EMAIL PAGE] ← [User clicks email link]
     ↓
Email Verification API
     ↓
[LOGIN PAGE] ← [Redirect on success]
     ↓
Login API
     ↓
[DASHBOARD PAGE]
```

---

## 🚀 Implementation Priority

1. **High Priority:** Backend setup (DB, User model, Register/Login endpoints)
2. **High Priority:** Frontend API layer and login/register pages
3. **Medium Priority:** Email verification flow
4. **Medium Priority:** Send-email page integration
5. **Low Priority:** Error handling refinements and edge cases

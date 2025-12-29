# Preny Full-Stack Authentication Implementation

Complete user authentication and email verification system with Next.js frontend and Flask/MongoDB backend.

## 📁 Project Structure

```
test-preny/
├── client/                          # Next.js frontend
│   ├── app/
│   │   ├── login/page.js           # Login page with backend integration
│   │   ├── register/page.js        # Registration page with backend integration
│   │   ├── send-email/page.js      # Email verification instructional page
│   │   ├── verify-email/page.js    # Email verification link handler
│   │   ├── dashboard/page.js       # Dashboard (protected)
│   │   ├── forgot-password/page.js # Forgot password page
│   │   └── layout.js               # Root layout
│   ├── lib/
│   │   └── api.js                  # Centralized API client
│   ├── package.json
│   ├── .env.local                  # Frontend environment variables
│   └── ...
│
└── server/                          # Flask backend
    ├── app.py                       # Main Flask application
    ├── config.py                    # Configuration management
    ├── requirements.txt             # Python dependencies
    ├── .env                         # Backend environment variables
    ├── models/
    │   └── user.py                 # User model and database operations
    ├── routes/
    │   └── auth.py                 # Authentication endpoints
    └── utils/
        └── email_service.py        # Email sending service
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16+) for frontend
- **Python** (v3.8+) for backend
- **MongoDB** (local or Atlas)
- **Gmail Account** (for email verification, optional for development)

### Backend Setup

1. **Install dependencies:**
   ```bash
   cd server
   pip install -r requirements.txt
   ```

2. **Configure environment variables** in `server/.env`:
   ```env
   FLASK_ENV=development
   FLASK_DEBUG=True
   SECRET_KEY=your-secret-key
   MONGODB_URI=mongodb://localhost:27017/preny_db
   SMTP_SERVER=smtp.gmail.com
   SMTP_PORT=587
   SMTP_EMAIL=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   VERIFICATION_TOKEN_EXPIRY=86400
   FRONTEND_URL=http://localhost:3000
   ```

3. **Ensure MongoDB is running:**
   ```bash
   # Local MongoDB
   mongod
   
   # Or use MongoDB Atlas (update MONGODB_URI in .env)
   ```

4. **Start the Flask server:**
   ```bash
   python app.py
   ```
   Backend will run on `http://localhost:5000`

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd client
   npm install
   ```

2. **Configuration is already set in** `client/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000
   ```

3. **Start the Next.js development server:**
   ```bash
   npm run dev
   ```
   Frontend will run on `http://localhost:3000`

## 🔐 Authentication Flow

### User Registration

1. User fills registration form (email, password, confirm password)
2. Frontend validates and sends `POST /api/register` to backend
3. Backend:
   - Validates email uniqueness
   - Hashes password with bcrypt (10 rounds)
   - Creates user with `is_verified: false`
   - Generates 32-character verification token
   - Generates unique accountId (UUID)
   - Sends verification email with link
4. Frontend redirects to `/send-email`

### Email Verification

1. User receives verification email with link:
   ```
   https://preny.ai/verify-email?token=[TOKEN]&email=[EMAIL]&accountId=[ACCOUNT_ID]
   ```

2. User clicks link (or manually navigates to `/verify-email`)

3. Frontend extracts URL parameters and calls `GET /api/verify-email`

4. Backend:
   - Finds user by email and accountId
   - Validates token hasn't expired (24 hours)
   - Sets `is_verified: true` and clears token
   - Returns success

5. Frontend shows success message and redirects to login

### User Login

1. User enters email and password on login page
2. Frontend sends `POST /api/login`
3. Backend:
   - Verifies email exists
   - Compares password hash
   - Checks `is_verified: true`
   - Returns user data on success
4. Frontend shows success notification and redirects to dashboard
5. User info stored in localStorage

### Resend Verification Email

1. User on `/send-email` page clicks "Resend Email" after 60-second countdown
2. Frontend sends `POST /api/resend-verification` with email
3. Backend:
   - Finds user by email
   - Generates new verification token
   - Updates token expiry to 24 hours from now
   - Sends email with new verification link
4. Frontend resets countdown timer to 60 seconds

## 📡 API Endpoints

### POST `/api/register`

Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account."
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Email already registered"
}
```

### POST `/api/login`

Login user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "email": "user@example.com",
    "accountId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

### GET `/api/verify-email`

Verify email with token.

**Query Parameters:**
- `token` - Verification token from email
- `email` - User email
- `accountId` - User account ID

**Response (Success):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Link outdated or invalid"
}
```

### POST `/api/resend-verification`

Resend verification email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Verification email resent. Please check your email."
}
```

### GET `/api/user-status`

Get user verification status.

**Query Parameters:**
- `email` - User email

**Response:**
```json
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "is_verified": true,
    "accountId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## 🔧 Configuration

### Backend (.env)

- `FLASK_ENV` - Environment (development/production)
- `FLASK_DEBUG` - Debug mode
- `SECRET_KEY` - Secret key for session management
- `MONGODB_URI` - MongoDB connection string
- `SMTP_SERVER` - SMTP server address
- `SMTP_PORT` - SMTP port
- `SMTP_EMAIL` - Email account for sending
- `SMTP_PASSWORD` - Email password/app password
- `VERIFICATION_TOKEN_EXPIRY` - Token expiry in seconds (default: 86400 = 24 hours)
- `FRONTEND_URL` - Frontend URL for verification links

### Frontend (.env.local)

- `NEXT_PUBLIC_API_URL` - Backend API base URL

## 📝 Database Schema

### Users Collection

```javascript
{
  _id: ObjectId,
  email: String (unique),
  password: String (hashed),
  is_verified: Boolean,
  verification_token: String (unique, nullable),
  verification_token_expires_at: Date (nullable),
  accountId: String (unique),
  created_at: Date,
  updated_at: Date
}
```

## 🧪 Testing the Flow

### 1. Register a New Account
- Navigate to `http://localhost:3000/register`
- Fill in form with email, password, confirm password
- Click "Đăng ký" button
- Should redirect to `/send-email` with success message

### 2. Check Email Verification
- On `/send-email`, click "Tiếp tục" button
- Frontend checks if email is verified via `GET /api/user-status`
- Should show error (not yet verified)

### 3. Verify Email
- **Option A:** In development, directly visit the verification link format
  ```
  http://localhost:3000/verify-email?token=GENERATED_TOKEN&email=user@example.com&accountId=ACCOUNT_ID
  ```
- **Option B:** Check console logs in backend for the actual token and use it
- Click link or paste URL in browser
- Should show success message and redirect to login

### 4. Check Status Again
- Back on `/send-email`, click "Tiếp tục" button
- Should now show success (verified) and redirect to login

### 5. Login
- On `/login` page, enter email and password
- Click "Đăng nhập" button
- Should show success notification and redirect to `/dashboard`

## 🐛 Troubleshooting

### Backend Connection Issues

**MongoDB Connection Failed**
- Ensure MongoDB is running: `mongod`
- Check `MONGODB_URI` in `.env`
- For MongoDB Atlas, ensure IP whitelist includes your current IP

**CORS Errors**
- Frontend and backend CORS are configured
- Ensure backend CORS_ORIGINS include your frontend URL
- Clear browser cache if issues persist

### Email Issues

**Emails Not Sending**
- Check SMTP credentials in `.env`
- For Gmail, use App Password (not regular password)
- Enable "Less secure app access" if needed
- Check backend logs for specific errors

**Development/Testing**
- In development mode, backend logs email content to console
- Check `app.py` logs for email details
- Manually construct verification URLs using logged tokens

### Frontend Issues

**API Calls Failing**
- Verify `NEXT_PUBLIC_API_URL` is correct in `.env.local`
- Check browser DevTools Network tab
- Ensure backend is running on port 5000
- Check browser console for CORS errors

**Redirect Not Working**
- Ensure pages exist at target routes
- Check `useRouter` from `next/navigation` (not `next/router`)
- Verify Next.js version (requires v13+ with App Router)

## 🔒 Security Notes

1. **Password Hashing:** Uses bcrypt with 10 rounds (configurable)
2. **Token Expiry:** Verification tokens expire after 24 hours
3. **Email Validation:** Basic format validation + unique constraint
4. **CORS:** Restricted to configured origins only
5. **Environment Variables:** Sensitive data in `.env` files (not committed to git)
6. **Production Deployment:** Update `SECRET_KEY` and disable debug mode

## 📦 Dependencies

### Backend
- Flask 2.3.3
- Flask-PyMongo 2.3.0
- Flask-Cors 4.0.0
- python-dotenv 1.0.0
- bcrypt 4.1.0
- pymongo 4.5.0

### Frontend
- Next.js 16.0.7
- React 19.2.1
- Ant Design 6.0.1
- TailwindCSS 4.1.17

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Ant Design Components](https://ant.design/components/overview/)
- [Bcrypt Documentation](https://github.com/pyca/bcrypt)

## 📄 License

This project is part of the Preny platform.

---

**Last Updated:** December 9, 2025

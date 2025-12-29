# Quick Start Guide

## Prerequisites

Make sure you have installed:
- Node.js v16+
- Python 3.8+
- MongoDB (local or Atlas)

## 5-Minute Setup

### Step 1: Backend Setup (Terminal 1)

```bash
cd server

# Install Python dependencies
pip install -r requirements.txt

# Update .env with your configuration
# Edit server/.env and set:
# - MONGODB_URI (local or Atlas)
# - SMTP_EMAIL and SMTP_PASSWORD (optional for dev)

# Start Flask server
python app.py
```

**Expected Output:**
```
==================================================
Preny Authentication Backend
==================================================
Environment: development
Debug: True
API Base URL: http://localhost:5000
Frontend URL: http://localhost:3000
==================================================
```

### Step 2: Frontend Setup (Terminal 2)

```bash
cd client

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```

**Expected Output:**
```
  ▲ Next.js 16.0.7
  - Local:        http://localhost:3000
  
✓ Ready in 2.5s
```

### Step 3: Test the Application

Open browser to `http://localhost:3000`

1. **Register**: Click register link, fill form, submit
2. **Verify Email**: Check email or use verification link from backend logs
3. **Login**: Use credentials to login
4. **Dashboard**: Should see dashboard after successful login

## Environment Files

### `server/.env`
```env
FLASK_ENV=development
FLASK_DEBUG=True
SECRET_KEY=dev-secret-key
MONGODB_URI=mongodb://localhost:27017/preny_db
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-app-password
VERIFICATION_TOKEN_EXPIRY=86400
FRONTEND_URL=http://localhost:3000
```

### `client/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

## Common Issues

| Issue | Solution |
|-------|----------|
| MongoDB connection failed | Ensure `mongod` is running or check Atlas connection string |
| CORS errors | Check backend is running on port 5000 and CORS_ORIGINS include your URL |
| Email not sending | Use app password for Gmail, check SMTP settings in .env |
| API endpoint not found | Verify backend is running and NEXT_PUBLIC_API_URL is correct |

## API Health Check

```bash
# Test if backend is running
curl http://localhost:5000/api/health
```

Should return:
```json
{
  "status": "healthy",
  "environment": "development"
}
```

## Next Steps

- Read full documentation in `/docs/Work.md`
- See detailed README in `/README.md`
- Check API endpoints documentation in README.md
- Deploy to production (update SECRET_KEY, disable debug, use proper domain)

---

For detailed information, see `README.md` and `docs/Work.md`

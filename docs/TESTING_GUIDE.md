# Quick Start Guide - Profile Management Features

## Overview
This guide helps you test the newly implemented profile management and security features.

---

## Prerequisites

1. MongoDB server running
2. Flask backend running on `http://localhost:5000`
3. Next.js frontend running on `http://localhost:3000`

---

## Step 1: Start the Backend

```bash
cd server

# Install dependencies (if not already installed)
pip install -r requirements.txt

# Set environment variables
export FLASK_ENV=development
export MONGODB_URI=mongodb://localhost:27017/test_db

# Run Flask app
python app.py
```

**Expected Output:**
```
==================================================
Test Authentication Backend
==================================================
Environment: development
Debug: True
API Base URL: http://localhost:5000
Frontend URL: http://localhost:3000
==================================================
 * Running on http://0.0.0.0:5000
```

---

## Step 2: Start the Frontend

```bash
cd client

# Install dependencies (if not already installed)
npm install

# Run Next.js development server
npm run dev
```

**Expected Output:**
```
  ▲ Next.js 14.x
  - Local:        http://localhost:3000
  - Environments: .env.local
```

---

## Step 3: Test User Registration & Login

1. Open `http://localhost:3000`
2. Navigate to Register page
3. Create a new account with:
   - **Full Name:** Test User
   - **Email:** test@example.com
   - **Phone:** 0944392199
   - **Password:** TestPass123! (meets all requirements)
4. Verify email via link in console/email service
5. Login with created account

---

## Step 4: Test Profile Features

### Feature 1: Avatar Upload

1. Navigate to Dashboard → Thông tin cá nhân (Profile)
2. Scroll to "Hình đại diện" section
3. Click the avatar area (EditOutlined icon)
4. Select an image file (JPG, PNG, GIF, or WebP)
   - Max size: 1MB
   - Recommended: 720×720 pixels
5. **Verify:**
   - ✅ Image preview appears immediately
   - ✅ "Lưu thay đổi" button is now enabled
6. Click "Lưu thay đổi" button
7. **Verify:**
   - ✅ Success message appears
   - ✅ Avatar persists in profile
   - ✅ Sidebar avatar updates in real-time
   - ✅ Page reload maintains avatar

### Feature 2: Password Change

1. In the same Profile page, find "Mật khẩu" row
2. Click "Chỉnh sửa" link
3. Modal opens with three fields:
   - **Mật khẩu hiện tại** (Current password)
   - **Mật khẩu mới** (New password)
   - **Xác nhận mật khẩu mới** (Confirm new password)
4. **Test Case A - Valid Password Change:**
   - Current: `TestPass123!`
   - New: `NewPass456!`
   - Confirm: `NewPass456!`
   - Submit
   - **Verify:**
     - ✅ Success message appears
     - ✅ Modal closes
     - ✅ Password strength checker shows live feedback
     - ✅ All validation items appear
5. **Test Case B - Invalid Current Password:**
   - Current: `WrongPass123!`
   - New: `NewPass789!`
   - Confirm: `NewPass789!`
   - Submit
   - **Verify:**
     - ❌ Error: "Current password is incorrect"
     - ❌ Modal stays open
6. **Test Case C - Mismatched New Passwords:**
   - Current: `NewPass456!`
   - New: `Another123!`
   - Confirm: `Different456!`
   - Submit
   - **Verify:**
     - ❌ Error: "New passwords do not match"

### Feature 3: Profile Data Loading

1. Refresh the Profile page
2. **Verify:**
   - ✅ Phone number loads from database
   - ✅ Avatar persists and loads from database
   - ✅ No hardcoded values displayed
   - ✅ Loading spinner appears briefly during fetch

### Feature 4: Register Form

1. Navigate to Register page (`/register`)
2. Start typing a password in the password field
3. **Verify:**
   - ✅ Password strength bar updates in real-time
   - ✅ Bar color changes: Gray → Red → Orange → Green
   - ✅ Validation checklist shows progress
   - ✅ Text indicates strength level
4. Test various password combinations
5. Password must meet ALL 5 requirements to show as "mạnh"

---

## Step 5: API Testing (Optional - Using cURL or Postman)

### Test Profile Fetch
```bash
curl -X GET http://localhost:5000/api/user/profile \
  -H "X-Account-Id: <your-account-id>" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "email": "test@example.com",
    "name": "Test User",
    "accountId": "uuid...",
    "phone_number": "0944392199",
    "avatar_url": "/uploads/avatars/uuid_timestamp.jpg",
    "is_verified": true
  }
}
```

### Test Avatar Upload
```bash
curl -X POST http://localhost:5000/api/user/avatar \
  -H "X-Account-Id: <your-account-id>" \
  -F "avatar=@/path/to/image.jpg"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Avatar uploaded successfully",
  "data": {
    "avatar_url": "/uploads/avatars/new_uuid_timestamp.jpg"
  }
}
```

### Test Password Change
```bash
curl -X POST http://localhost:5000/api/user/change-password \
  -H "X-Account-Id: <your-account-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "TestPass123!",
    "newPassword": "NewPass456!",
    "confirmNewPassword": "NewPass456!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## Error Testing

### Test 1: Missing Account ID
```bash
curl -X GET http://localhost:5000/api/user/profile \
  -H "Content-Type: application/json"
```
**Expected:** `400 - Account ID is required`

### Test 2: Invalid File Type
Upload a `.txt` file as avatar
**Expected:** `400 - File type not allowed`

### Test 3: File Too Large
Upload a file > 1MB
**Expected:** `400 - File size exceeds 1.0MB limit`

### Test 4: Wrong Current Password
Submit password change with incorrect current password
**Expected:** `401 - Current password is incorrect`

---

## File Locations

After successful avatar upload, files are stored at:
```
server/uploads/avatars/
  └── <uuid>_<timestamp>.jpg (e.g., abc123def_1733745600.0.jpg)
```

These are served via:
```
GET http://localhost:5000/uploads/avatars/<filename>
```

---

## Troubleshooting

### Issue: "Failed to load profile data"
- [ ] Check MongoDB connection
- [ ] Verify accountId is correct and in localStorage
- [ ] Check Flask server console for errors

### Issue: Avatar not uploading
- [ ] Verify file size is < 1MB
- [ ] Verify file type is allowed (JPG, PNG, GIF, WebP)
- [ ] Check `server/uploads/avatars/` directory exists
- [ ] Verify directory has write permissions

### Issue: Password change fails
- [ ] Verify current password is exactly correct
- [ ] Ensure new password meets all 5 requirements
- [ ] Check that new passwords match

### Issue: Sidebar avatar not updating
- [ ] Check browser console for errors
- [ ] Verify `avatarUpdated` event is firing
- [ ] Clear localStorage and refresh page

### Issue: File upload to Flask fails
- [ ] Ensure `server/uploads/avatars/` directory exists
- [ ] Check Flask logs for detailed error
- [ ] Verify CORS is configured correctly
- [ ] Check Content-Type headers

---

## Database Inspection

To verify changes in MongoDB:

```bash
mongo
> use test_db
> db.users.findOne({email: "test@example.com"})
```

**Verify:**
```json
{
  "_id": ObjectId(...),
  "email": "test@example.com",
  "phone_number": "0944392199",
  "avatar_url": "/uploads/avatars/uuid_timestamp.jpg",
  "is_verified": true,
  // ... other fields
}
```

---

## Performance Notes

- Avatar upload may take 1-2 seconds depending on image size
- Profile data loads in < 500ms
- Sidebar avatar updates in real-time without page reload
- Password change processes in < 1 second

---

## Browser Developer Tools

### Network Tab
- Monitor API requests to `/api/user/*`
- Verify file upload via FormData
- Check response times

### Console Tab
- Look for `avatarUpdated` event messages
- Check for any API errors
- Monitor form submission logs

### Application Tab (IndexedDB/LocalStorage)
- `userEmail`
- `accountId`
- `userName`
- `userAvatar` (newly added)

---

## Success Criteria

✅ All features working when:
- [ ] Avatar uploads and saves to database
- [ ] Avatar displays in profile and sidebar
- [ ] Avatar persists on page reload
- [ ] Password change succeeds with correct credentials
- [ ] Error messages display for invalid inputs
- [ ] Register form uses new password component
- [ ] Password strength checker works in all forms
- [ ] API endpoints respond with correct status codes
- [ ] Files are accessible via /uploads/avatars/
- [ ] No console errors or warnings

---

## Next Steps

After testing, consider:
1. Run automated test suite (if available)
2. Test across different browsers
3. Test mobile responsiveness
4. Load test with multiple concurrent uploads
5. Test with large image files
6. Verify security with common attack vectors

---

## Support & Documentation

For detailed API documentation, see: `IMPLEMENTATION_SUMMARY.md`
For architecture overview, see: `docs/ARCHITECTURE.md`

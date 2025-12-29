# Enhanced User Profile Management and Security - Implementation Summary

## Overview
Successfully implemented advanced profile editing features with avatar management and secure password updates across the Next.js/Ant Design frontend and Flask/MongoDB backend.

---

## 🔧 Backend Implementation

### 1. Database Schema Updates (`server/models/user.py`)

**New Fields Added to User Document:**
- `phone_number` (String, default: `null`)
- `avatar_url` (String, default: `null`)

These fields are initialized when a new user is created and can be updated through dedicated endpoints.

### 2. New API Endpoints (`server/routes/user.py`)

#### **GET /api/user/profile**
- **Purpose:** Retrieve authenticated user's profile data
- **Authentication:** Required via `X-Account-Id` header
- **Returns:** Non-sensitive profile data including:
  - `email`, `name`, `accountId`
  - `phone_number`, `avatar_url`
  - `is_verified` status
- **Usage:** Called on Profile page load to fetch current user data

**Example Request:**
```
GET /api/user/profile
Headers: X-Account-Id: <account-id>
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "name": "John Doe",
    "accountId": "uuid",
    "phone_number": "0944392199",
    "avatar_url": "/uploads/avatars/abc123.jpg",
    "is_verified": true
  }
}
```

---

#### **POST /api/user/avatar**
- **Purpose:** Upload and save user avatar
- **Authentication:** Required via `X-Account-Id` header
- **Input:**
  - `avatar` (File): Image file (max 1MB)
  - `accountId` (String, optional in body)
- **File Validation:**
  - Allowed types: PNG, JPG, JPEG, GIF, WebP
  - Max size: 1MB
  - Dimensions recommended: 720×720 pixels
- **Behavior:**
  - Generates unique filename with UUID + timestamp
  - Stores file in `server/uploads/avatars/` directory
  - Updates `avatar_url` in MongoDB
  - Returns saved avatar URL
- **Static File Serving:** Configured in `app.py` to serve uploads via `/uploads/<path>`

**Example Request:**
```
POST /api/user/avatar
Headers: X-Account-Id: <account-id>, Content-Type: multipart/form-data
Body: FormData with 'avatar' file
```

**Example Response:**
```json
{
  "success": true,
  "message": "Avatar uploaded successfully",
  "data": {
    "avatar_url": "/uploads/avatars/abc123def_1733745600.0.jpg"
  }
}
```

---

#### **POST /api/user/change-password**
- **Purpose:** Change user password with current password verification
- **Authentication:** Required via `X-Account-Id` header
- **Required Fields:**
  - `currentPassword`: User's current password
  - `newPassword`: New password (minimum 6 characters)
  - `confirmNewPassword`: Confirmation of new password
- **Validation:**
  - Current password must be correct
  - New password must differ from current password
  - Passwords must match
  - Minimum 6 characters
- **Security:**
  - Uses bcrypt for password hashing
  - Verifies old password before updating
  - Returns appropriate error messages without revealing sensitive info

**Example Request:**
```
POST /api/user/change-password
Headers: X-Account-Id: <account-id>, Content-Type: application/json
Body: {
  "currentPassword": "oldPass123!",
  "newPassword": "newPass456!",
  "confirmNewPassword": "newPass456!"
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### 3. Configuration Updates (`server/config.py`)

**New Configuration Parameters:**
```python
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'avatars')
MAX_UPLOAD_SIZE = 1024 * 1024  # 1MB
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
```

### 4. Flask Application Updates (`server/app.py`)

**Changes:**
- Imported `send_from_directory` for static file serving
- Registered new `user_bp` blueprint
- Added `/uploads/<path:filename>` route for serving uploaded avatars
- Error handling for missing files (returns 404)

---

## 🎨 Frontend Implementation

### 1. Reusable Password Component (`client/lib/components/PasswordInputWithStrength.js`)

**Features:**
- Displays password input with visibility toggle
- Real-time password strength calculation
- Visual strength bar (6px height, color-coded)
- Validation checklist with checkmarks
- Customizable props for flexibility

**Requirements Checked:**
- ✅ Minimum 6 characters
- ✅ At least 1 number
- ✅ At least 1 uppercase letter
- ✅ At least 1 lowercase letter
- ✅ At least 1 special character

**Props:**
```javascript
<PasswordInputWithStrength
  value={password}
  onChange={setPassword}
  placeholder="Nhập mật khẩu"
  size="large"
  showValidation={true}  // Show validation checklist
/>
```

**Color Scheme:**
- Gray (#ccc): No input
- Red (#ef4444): Weak (1 requirement)
- Orange (#f97316): Medium (2-4 requirements)
- Green (#22c55e): Strong (5 requirements)

---

### 2. Register Page Refactoring (`client/app/register/page.js`)

**Changes:**
- Removed inline `PasswordStrengthBar` and `ValidationItem` components
- Imported new `PasswordInputWithStrength` component
- Simplified password field implementation
- Maintained all existing validation and error handling

**Before:**
```javascript
<Input.Password
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  // ... manual strength bar below
/>
```

**After:**
```javascript
<PasswordInputWithStrength
  value={password}
  onChange={setPassword}
  placeholder="Nhập mật khẩu của bạn"
  showValidation={true}
/>
```

---

### 3. Profile Page (`client/app/dashboard/profile/page.js`)

**Major Features Implemented:**

#### **Data Fetching**
- Calls `fetchProfile(accountId)` on page load
- Populates phone number from backend
- Displays avatar URL if available
- Shows loading spinner while fetching

#### **Avatar Management**
- **Click to Upload:** Clicking avatar triggers file input
- **Client-side Preview:** Selected image previews immediately
- **File Validation:**
  - Size: Max 1MB
  - Types: JPG, PNG, GIF, WebP
  - Instant error messages
- **Save Action:** 
  - Upload button sends file to backend
  - Updates `avatar_url` in MongoDB
  - Triggers `avatarUpdated` event for sidebar sync

**Avatar Workflow:**
1. User clicks avatar (or EditOutlined icon)
2. File input dialog opens
3. User selects image file
4. Client validates (size, type)
5. Image previews in avatar area (client-side)
6. User clicks "Lưu thay đổi" button
7. File uploads to backend via `POST /api/user/avatar`
8. Backend stores file and updates DB
9. Sidebar avatar updates via event listener

#### **Password Change Modal**
- Opens via "Chỉnh sửa" link next to password field
- Form fields:
  - **Current Password:** Standard input
  - **New Password:** Uses `PasswordInputWithStrength` component
  - **Confirm New Password:** Standard input
- **Submission:**
  - Validates form fields
  - Calls `changePassword()` API
  - Shows success/error messages
  - Closes modal on success
- **Error Handling:**
  - "Current password is incorrect" → 401
  - "New passwords do not match" → validation error
  - "User not found" → 404
  - "Password change failed" → 500

**State Management:**
```javascript
const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
const [avatarPreview, setAvatarPreview] = useState(null);
const [phoneNumber, setPhoneNumber] = useState("");
const [avatarUrl, setAvatarUrl] = useState(null);
const [passwordModalVisible, setPasswordModalVisible] = useState(false);
const [newPassword, setNewPassword] = useState("");
```

---

### 4. Dashboard Layout Updates (`client/app/dashboard/layout.js`)

**Changes:**
- Added `userAvatar` state to track avatar URL
- Initialize avatar from `localStorage.userAvatar`
- Added event listener for `avatarUpdated` events
- Updated sidebar Avatar component:
  - Displays uploaded avatar image if available
  - Falls back to `UserOutlined` icon if no avatar
  - Updates real-time when avatar changes

**Avatar Display Logic:**
```javascript
<Avatar
  size={collapsed ? 22 : 32}
  src={userAvatar}  // Display uploaded image
  icon={!userAvatar && <UserOutlined />}  // Fallback icon
  style={{
    background: userAvatar ? "transparent" : "#6c3fb5",
  }}
/>
```

**Event Synchronization:**
```javascript
window.addEventListener('avatarUpdated', (event) => {
  const avatarUrl = event.detail?.avatarUrl;
  setUserAvatar(avatarUrl);
  localStorage.setItem('userAvatar', avatarUrl);
});
```

---

### 5. API Client Updates (`client/lib/api.js`)

**New Functions:**

#### **fetchProfile(accountId)**
```javascript
export async function fetchProfile(accountId) {
  // GET /api/user/profile with X-Account-Id header
  // Returns: { success, data: { email, name, phone_number, avatar_url, ... } }
}
```

#### **uploadAvatar(accountId, file)**
```javascript
export async function uploadAvatar(accountId, file) {
  // POST /api/user/avatar with FormData
  // Returns: { success, data: { avatar_url } }
}
```

#### **changePassword(accountId, currentPassword, newPassword, confirmNewPassword)**
```javascript
export async function changePassword(accountId, currentPassword, newPassword, confirmNewPassword) {
  // POST /api/user/change-password
  // Returns: { success, message }
}
```

---

## 📁 File Structure

```
client/
├── lib/
│   ├── api.js (Updated with new functions)
│   └── components/
│       └── PasswordInputWithStrength.js (NEW)
├── app/
│   ├── register/
│   │   └── page.js (Refactored to use new component)
│   └── dashboard/
│       ├── layout.js (Updated with avatar support)
│       └── profile/
│           └── page.js (Completely rewritten)

server/
├── app.py (Updated with routes & file serving)
├── config.py (Added file upload config)
├── models/
│   └── user.py (New methods & schema update)
├── routes/
│   ├── auth.py (Unchanged)
│   └── user.py (NEW - Profile, avatar, password endpoints)
└── uploads/ (NEW - Avatar storage directory)
    └── avatars/
```

---

## 🔐 Security Considerations

### Backend Security:
1. **Authentication:** All user endpoints require `X-Account-Id` header
2. **File Validation:** 
   - Extension whitelist (PNG, JPG, JPEG, GIF, WebP)
   - Size limit (1MB)
   - Secure filename generation (UUID + timestamp)
3. **Password Security:**
   - Bcrypt hashing with gensalt(10)
   - Current password verification before update
   - No password in response/logs
4. **CORS:** Configured for approved origins
5. **MongoDB:** Unique indexes on email and accountId

### Frontend Security:
1. **Client-side Validation:** File type and size checks before upload
2. **Token Management:** AccountId in headers (not in URL)
3. **Secure Storage:** LocalStorage for session data
4. **Password Field:** Uses `Input.Password` for masking

---

## 🧪 Testing Checklist

### Backend Testing:
- [ ] Test GET /api/user/profile with valid accountId
- [ ] Test GET /api/user/profile without accountId (should fail)
- [ ] Test avatar upload with valid file
- [ ] Test avatar upload with oversized file (> 1MB)
- [ ] Test avatar upload with invalid file type
- [ ] Test avatar upload creates correct directory
- [ ] Test avatar upload updates MongoDB
- [ ] Test password change with correct current password
- [ ] Test password change with wrong current password
- [ ] Test password change with mismatched new passwords
- [ ] Test password change creates hash in MongoDB
- [ ] Test /uploads/<filename> serves files correctly

### Frontend Testing:
- [ ] Profile page fetches data on load
- [ ] Avatar click opens file input
- [ ] File preview updates on selection
- [ ] Save button disabled when no file selected
- [ ] Save button uploads to backend
- [ ] Avatar updates in profile after save
- [ ] Avatar updates in sidebar after save
- [ ] Password modal opens when "Chỉnh sửa" clicked
- [ ] Password strength checker displays correctly
- [ ] Password change submits to backend
- [ ] Success message shows on password change
- [ ] Modal closes after successful password change
- [ ] Error messages display for invalid inputs

---

## 🚀 Deployment Notes

### Environment Variables Required:
```
FLASK_ENV=production
MONGODB_URI=<production-db>
FRONTEND_URL=<production-frontend-url>
SECRET_KEY=<secure-key>
```

### Directory Permissions:
```bash
mkdir -p server/uploads/avatars
chmod 755 server/uploads/avatars
```

### Dependencies:
**Backend:**
- Flask
- Flask-CORS
- pymongo
- bcrypt
- python-dotenv

**Frontend:**
- Next.js
- antd (Ant Design)
- react

---

## 📝 Future Enhancements

1. **Crop/Resize:** Add image cropping before upload
2. **CloudStorage:** Replace local file storage with S3/GCS
3. **Phone Verification:** Implement SMS verification for phone numbers
4. **Profile Editing:** Add name and email update endpoints
5. **Avatar Gallery:** Show previously uploaded avatars
6. **Password History:** Prevent reuse of recent passwords
7. **Two-Factor Auth:** Add 2FA for enhanced security
8. **Audit Log:** Track profile changes with timestamps

---

## 📞 Support

All endpoints are documented with:
- Required parameters
- Authentication requirements
- Response formats
- Error codes and messages

Refer to individual function docstrings in code for specific details.

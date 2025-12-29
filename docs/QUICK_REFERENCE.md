# Quick Reference Guide

## Files Modified/Created

### Backend
| File | Change | Impact |
|------|--------|--------|
| `server/models/user.py` | Added `avatar_url`, `phone_number` fields + 3 methods | Profile data support |
| `server/routes/user.py` | NEW - 3 API endpoints | Avatar, profile, password endpoints |
| `server/app.py` | Register user blueprint + file serving | Routes & static file support |
| `server/config.py` | Added upload config | File upload settings |

### Frontend
| File | Change | Impact |
|------|--------|--------|
| `client/lib/api.js` | Added 3 API functions | Backend communication |
| `client/lib/components/PasswordInputWithStrength.js` | NEW reusable component | Password input in forms |
| `client/app/register/page.js` | Refactored to use new component | Cleaner, reusable code |
| `client/app/dashboard/profile/page.js` | Complete rewrite | Profile + avatar + password features |
| `client/app/dashboard/layout.js` | Added avatar state & listener | Real-time avatar updates |

### Documentation
| File | Purpose |
|------|---------|
| `IMPLEMENTATION_SUMMARY.md` | Complete technical documentation |
| `TESTING_GUIDE.md` | Step-by-step testing instructions |
| `API_REFERENCE.md` | Full API documentation |
| `IMPLEMENTATION_CHECKLIST.md` | Verification checklist |

---

## Key Features at a Glance

### 1. Avatar Upload
```
Click → Select File → Preview → Save → Persist
```
- Max 1MB
- Instant preview
- Real-time sidebar update

### 2. Password Change
```
Click Edit → Enter Current → Enter New → Confirm → Submit → Success
```
- Strength checker with 5 requirements
- Current password verification
- Secure bcrypt hashing

### 3. Profile Data
```
Page Load → Fetch from DB → Display Phone & Avatar → Ready
```
- Database-driven (not hardcoded)
- Secure authentication header
- Proper error handling

---

## Database Changes

### New User Fields
```python
{
  # ... existing fields
  "phone_number": null,      # NEW
  "avatar_url": null,        # NEW
}
```

### Example Values
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "accountId": "550e8400-e29b-41d4-a716-446655440000",
  "phone_number": "0944392199",
  "avatar_url": "/uploads/avatars/abc123_1733745600.0.jpg",
  "is_verified": true
}
```

---

## API Endpoints Summary

### Profile
```
GET /api/user/profile
Header: X-Account-Id
Response: { email, name, phone_number, avatar_url, ... }
```

### Avatar
```
POST /api/user/avatar
Header: X-Account-Id
Body: FormData { avatar: File }
Response: { avatar_url }
```

### Password
```
POST /api/user/change-password
Header: X-Account-Id
Body: { currentPassword, newPassword, confirmNewPassword }
Response: { success, message }
```

---

## Component Props

### PasswordInputWithStrength
```javascript
<PasswordInputWithStrength
  value={password}                    // Current password value
  onChange={setPassword}              // Callback on change
  placeholder="Nhập mật khẩu"        // Input placeholder
  size="large"                        // Ant Design size
  showValidation={true}               // Show checklist
/>
```

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Account ID is required" | Missing X-Account-Id header | Add header |
| "File type not allowed" | Unsupported image format | Use JPG/PNG/GIF/WebP |
| "File size exceeds limit" | File > 1MB | Compress image |
| "Current password is incorrect" | Wrong current password | Check spelling |
| "New passwords do not match" | Mismatch in new passwords | Retype carefully |

---

## State Management (Frontend)

### Profile Page
```javascript
const [avatarUrl, setAvatarUrl]           // Current saved avatar
const [avatarPreview, setAvatarPreview]   // Preview before save
const [selectedAvatarFile, setSelectedAvatarFile]  // File object
const [phoneNumber, setPhoneNumber]       // From database
const [passwordModalVisible, setPasswordModalVisible]
const [newPassword, setNewPassword]       // Password strength checker
```

### Dashboard Layout
```javascript
const [userAvatar, setUserAvatar]         // Sidebar avatar
```

---

## Event Communication

### Avatar Update Event
```javascript
// Profile page sends:
window.dispatchEvent(new CustomEvent('avatarUpdated', { 
  detail: { avatarUrl: result.data.avatar_url } 
}));

// Sidebar listens:
window.addEventListener('avatarUpdated', (event) => {
  const avatarUrl = event.detail?.avatarUrl;
  setUserAvatar(avatarUrl);
  localStorage.setItem('userAvatar', avatarUrl);
});
```

---

## localStorage Keys

```javascript
localStorage.getItem('userEmail')       // User email
localStorage.getItem('accountId')       // User ID
localStorage.getItem('userName')        // User name
localStorage.getItem('userAvatar')      // Avatar URL (NEW)
```

---

## Directory Structure

```
server/
├── uploads/
│   └── avatars/
│       ├── abc123_1733745600.0.jpg
│       ├── def456_1733745612.5.jpg
│       └── ...

client/
├── lib/
│   ├── api.js
│   └── components/
│       └── PasswordInputWithStrength.js
├── app/
│   ├── register/page.js
│   └── dashboard/
│       ├── layout.js
│       └── profile/page.js
```

---

## Validation Rules

### Password
- ✅ Min 6 characters
- ✅ At least 1 number
- ✅ At least 1 uppercase
- ✅ At least 1 lowercase
- ✅ At least 1 special character
- ✅ Different from current

### Avatar File
- ✅ Max 1MB
- ✅ Format: JPG/PNG/GIF/WebP
- ✅ Recommended: 720×720px

---

## Color Coding

### Password Strength
- 🔴 Weak (1/5) - Red (#ef4444)
- 🟠 Medium (2-4/5) - Orange (#f97316)
- 🟢 Strong (5/5) - Green (#22c55e)

---

## Workflow Diagrams

### Avatar Upload Flow
```
User clicks avatar
    ↓
File dialog opens
    ↓
Select image
    ↓
Client validates (size, type)
    ↓
Preview displays
    ↓
User clicks "Save"
    ↓
Upload to /api/user/avatar
    ↓
Backend saves & updates DB
    ↓
Sidebar updates via event
    ↓
Avatar persists on reload
```

### Password Change Flow
```
User clicks "Edit" password
    ↓
Modal opens
    ↓
User enters current password
    ↓
User enters new password
    ↓
Strength checker shows feedback
    ↓
User confirms new password
    ↓
User submits
    ↓
POST to /api/user/change-password
    ↓
Backend verifies current
    ↓
Backend hashes new password
    ↓
Database updated
    ↓
Success message
    ↓
Modal closes
```

---

## Quick Testing

### Test Avatar Upload
```bash
1. Go to profile page
2. Click avatar
3. Select small JPG (< 500KB)
4. See preview appear
5. Click "Save"
6. See success message
7. Reload page
8. Avatar still there ✓
```

### Test Password Change
```bash
1. Go to profile page
2. Click "Edit" next to password
3. Enter current password
4. Enter new password (watch strength bar)
5. Confirm new password
6. Click "Đổi mật khẩu"
7. See success message ✓
```

### Test API Directly
```bash
curl -X GET http://localhost:5000/api/user/profile \
  -H "X-Account-Id: <your-id>"
```

---

## Performance Tips

- Avatar < 500KB for optimal speed
- Use JPG for photos (better compression)
- Use PNG for graphics (supports transparency)
- Profile fetch caches automatically
- Sidebar updates are instant

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Avatar not uploading | File size, type, permissions |
| Password change fails | Current password correct? |
| Profile not loading | MongoDB running? Account ID valid? |
| Sidebar not updating | Event listener working? |
| File not accessible | Directory exists? Flask running? |

---

## Important Notes

⚠️ **Security**
- Never log passwords
- Always use HTTPS in production
- Verify X-Account-Id header presence
- Validate files on both client and server

⚠️ **Storage**
- Avatar files stored locally in `server/uploads/avatars/`
- Consider cloud storage for production
- Files named with UUID + timestamp for uniqueness

⚠️ **Database**
- Phone number stored as string (not encrypted)
- Consider encryption for sensitive data
- Passwords always hashed with bcrypt

---

## Version Info

- **Implementation Date:** December 9, 2024
- **Status:** Ready for Testing
- **Python Version:** 3.7+
- **Node Version:** 16+
- **Next.js:** 14.x
- **Ant Design:** 5.x
- **Flask:** 2.x
- **MongoDB:** 4.4+

---

## Support Resources

1. **API Docs:** See `API_REFERENCE.md`
2. **Testing:** See `TESTING_GUIDE.md`
3. **Technical:** See `IMPLEMENTATION_SUMMARY.md`
4. **Checklist:** See `IMPLEMENTATION_CHECKLIST.md`

---

## Contact/Issues

For implementation questions:
- Review the documentation files
- Check API responses match expected format
- Verify authentication headers are present
- Ensure database fields exist with correct values

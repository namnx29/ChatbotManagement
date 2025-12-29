# API Reference - User Profile Management

## Base URL
```
http://localhost:5000/api
```

---

## Authentication

All user endpoints require authentication via the `X-Account-Id` header.

```bash
Headers:
  X-Account-Id: <user-account-id>
  Content-Type: application/json
```

---

## Endpoints

### 1. Get User Profile

**Endpoint:** `GET /user/profile`

**Description:** Retrieves the authenticated user's profile data from the database.

**Authentication:** Required

**Request Headers:**
```
X-Account-Id: <account-id>
Content-Type: application/json
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "name": "John Doe",
    "accountId": "550e8400-e29b-41d4-a716-446655440000",
    "phone_number": "0944392199",
    "avatar_url": "/uploads/avatars/abc123_1733745600.0.jpg",
    "is_verified": true
  }
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Account ID is required"
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "message": "User not found"
}
```

**Example Usage:**
```bash
curl -X GET http://localhost:5000/api/user/profile \
  -H "X-Account-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json"
```

---

### 2. Upload Avatar

**Endpoint:** `POST /user/avatar`

**Description:** Uploads and saves a user avatar image to the server.

**Authentication:** Required

**Request Format:** `multipart/form-data`

**Request Headers:**
```
X-Account-Id: <account-id>
```

**Request Body:**
- `avatar` (File): Image file to upload
  - Accepted types: image/jpeg, image/png, image/gif, image/webp
  - Max size: 1MB (1048576 bytes)
- `accountId` (String, optional): Can also be sent in body as fallback

**File Constraints:**
- **Allowed Extensions:** jpg, jpeg, png, gif, webp
- **Max File Size:** 1MB
- **Recommended Dimensions:** 720×720 pixels
- **MIME Types:** image/jpeg, image/png, image/gif, image/webp

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Avatar uploaded successfully",
  "data": {
    "avatar_url": "/uploads/avatars/abc123def456_1733745678.5.jpg"
  }
}
```

**Response (400 Bad Request - Missing File):**
```json
{
  "success": false,
  "message": "No file provided"
}
```

**Response (400 Bad Request - Invalid Type):**
```json
{
  "success": false,
  "message": "File type not allowed. Allowed types: png, jpg, jpeg, gif, webp"
}
```

**Response (400 Bad Request - File Too Large):**
```json
{
  "success": false,
  "message": "File size exceeds 1.0MB limit"
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "message": "User not found"
}
```

**Response (500 Internal Server Error):**
```json
{
  "success": false,
  "message": "Avatar upload failed"
}
```

**Example Usage - cURL:**
```bash
curl -X POST http://localhost:5000/api/user/avatar \
  -H "X-Account-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -F "avatar=@/path/to/image.jpg"
```

**Example Usage - JavaScript:**
```javascript
const formData = new FormData();
formData.append('avatar', fileInput.files[0]);

const response = await fetch('http://localhost:5000/api/user/avatar', {
  method: 'POST',
  headers: {
    'X-Account-Id': accountId
  },
  body: formData
});

const result = await response.json();
if (result.success) {
  console.log('Avatar URL:', result.data.avatar_url);
}
```

**Example Usage - Python:**
```python
import requests

with open('avatar.jpg', 'rb') as f:
    files = {'avatar': f}
    headers = {'X-Account-Id': '550e8400-e29b-41d4-a716-446655440000'}
    response = requests.post(
        'http://localhost:5000/api/user/avatar',
        files=files,
        headers=headers
    )
    print(response.json())
```

---

### 3. Change Password

**Endpoint:** `POST /user/change-password`

**Description:** Changes the user's password after verifying the current password.

**Authentication:** Required

**Request Format:** `application/json`

**Request Headers:**
```
X-Account-Id: <account-id>
Content-Type: application/json
```

**Request Body:**
```json
{
  "currentPassword": "CurrentPass123!",
  "newPassword": "NewPass456!",
  "confirmNewPassword": "NewPass456!"
}
```

**Field Descriptions:**
- `currentPassword` (String, required): User's current password
- `newPassword` (String, required): New password (min 6 characters)
- `confirmNewPassword` (String, required): Confirmation of new password

**Password Requirements:**
- Minimum 6 characters
- Must be different from current password
- New passwords must match
- No special format required (but recommended to include variety)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Response (400 Bad Request - Missing Field):**
```json
{
  "success": false,
  "message": "Current password is required"
}
```

**Response (400 Bad Request - Validation Error):**
```json
{
  "success": false,
  "message": "New passwords do not match"
}
```

**Response (400 Bad Request - Too Short):**
```json
{
  "success": false,
  "message": "Password must be at least 6 characters"
}
```

**Response (400 Bad Request - Same as Current):**
```json
{
  "success": false,
  "message": "New password must be different from current password"
}
```

**Response (401 Unauthorized - Wrong Current Password):**
```json
{
  "success": false,
  "message": "Current password is incorrect"
}
```

**Response (404 Not Found - User Not Found):**
```json
{
  "success": false,
  "message": "User not found"
}
```

**Response (500 Internal Server Error):**
```json
{
  "success": false,
  "message": "Password change failed"
}
```

**Example Usage - cURL:**
```bash
curl -X POST http://localhost:5000/api/user/change-password \
  -H "X-Account-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "CurrentPass123!",
    "newPassword": "NewPass456!",
    "confirmNewPassword": "NewPass456!"
  }'
```

**Example Usage - JavaScript:**
```javascript
const response = await fetch('http://localhost:5000/api/user/change-password', {
  method: 'POST',
  headers: {
    'X-Account-Id': accountId,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    currentPassword: currentPass,
    newPassword: newPass,
    confirmNewPassword: confirmPass
  })
});

const result = await response.json();
if (result.success) {
  console.log('Password changed successfully');
} else {
  console.error('Error:', result.message);
}
```

**Example Usage - Python:**
```python
import requests
import json

headers = {
    'X-Account-Id': '550e8400-e29b-41d4-a716-446655440000',
    'Content-Type': 'application/json'
}

data = {
    'currentPassword': 'CurrentPass123!',
    'newPassword': 'NewPass456!',
    'confirmNewPassword': 'NewPass456!'
}

response = requests.post(
    'http://localhost:5000/api/user/change-password',
    headers=headers,
    data=json.dumps(data)
)

print(response.json())
```

---

## Serve Static Files

**Endpoint:** `GET /uploads/<filename>`

**Description:** Serves uploaded avatar images and other static files.

**Example:**
```
GET /uploads/avatars/abc123def456_1733745678.5.jpg
```

**Response (200 OK):** Image file content

**Response (404 Not Found):**
```json
{
  "success": false,
  "message": "File not found"
}
```

**Example Usage:**
```html
<img src="http://localhost:5000/uploads/avatars/abc123def456_1733745678.5.jpg" />
```

---

## Error Codes Reference

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Missing fields, invalid format, validation errors |
| 401 | Unauthorized | Wrong password, invalid credentials |
| 404 | Not Found | User doesn't exist, file not found |
| 500 | Internal Server Error | Database error, file system error |

---

## Common Workflows

### Workflow 1: Complete Profile Setup

1. **Fetch current profile:**
   ```
   GET /user/profile
   ```

2. **Upload avatar:**
   ```
   POST /user/avatar
   ```

3. **Verify in profile:**
   ```
   GET /user/profile
   ```
   (Should now show `avatar_url`)

### Workflow 2: Change Password

1. **Submit current and new passwords:**
   ```
   POST /user/change-password
   ```

2. **Handle success/error:**
   - Success: Display confirmation message
   - Error: Show specific error message to user

### Workflow 3: Login Flow After Password Change

1. User changes password via `/user/change-password`
2. Next login must use new password
3. Old password no longer works

---

## Rate Limiting

Currently no rate limiting is implemented. Consider adding:
- Max 5 file uploads per minute
- Max 3 password changes per day
- Max 10 profile requests per minute

---

## Security Considerations

1. **HTTPS in Production:** Always use HTTPS to encrypt credentials
2. **CORS:** Verify CORS is configured for your frontend domain only
3. **Account ID:** Keep `X-Account-Id` secure (don't expose in logs)
4. **File Validation:** Server validates file type and size
5. **Password Hashing:** Passwords are hashed with bcrypt before storage
6. **No Password in Responses:** Password never appears in API responses

---

## Performance Tips

1. **Avatar Size:** Upload avatars < 500KB for best performance
2. **Image Format:** Use JPEG for photos, PNG for transparency
3. **Concurrent Uploads:** Server handles multiple uploads efficiently
4. **Caching:** Browser will cache avatar images (consider cache busting if updating)

---

## Testing

### Test Successful Profile Fetch
```bash
Account ID: 550e8400-e29b-41d4-a716-446655440000
Expected: 200 OK with user data
```

### Test Successful Avatar Upload
```bash
File: 500KB JPEG image
Expected: 200 OK with avatar_url
```

### Test Successful Password Change
```bash
Current: CorrectPass123!
New: NewPass456!
Expected: 200 OK
```

### Test Failed Password Change (Wrong Current)
```bash
Current: WrongPass123!
New: NewPass456!
Expected: 401 Unauthorized
```

### Test File Too Large
```bash
File: 2MB image
Expected: 400 Bad Request (size exceeds limit)
```

### Test Invalid File Type
```bash
File: document.txt
Expected: 400 Bad Request (file type not allowed)
```

---

## Version History

- **v1.0** (December 9, 2024)
  - Initial release
  - Profile fetch endpoint
  - Avatar upload endpoint
  - Password change endpoint
  - Static file serving

---

## Support

For issues or questions:
1. Check error message in response
2. Verify authentication headers are present
3. Check file validation requirements
4. Review server logs for detailed errors
5. Ensure MongoDB is running and connected

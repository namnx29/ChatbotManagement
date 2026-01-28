# Staff Management - Architecture & Data Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js/React)                    │
├──────────────────────┬──────────────────────┬──────────────────┤
│  Accounts Page       │  CreateStaffModal    │  EditStaffModal  │
│  ├─ Admin Info       │  ├─ username        │  ├─ username     │
│  ├─ Staff Table      │  ├─ name            │  ├─ name         │
│  │  ├─ Name          │  ├─ phone           │  ├─ phone        │
│  │  ├─ Username      │  ├─ password        │  ├─ new_password │
│  │  ├─ Password***   │  └─ [Thêm]          │  └─ [Lưu]        │
│  │  ├─ Phone         │                      │                  │
│  │  ├─ Eye (view)    │  VerifyPasswordModal │  ConfirmModal    │
│  │  ├─ Edit (pencil) │  ├─ password input  │  ├─ Delete?      │
│  │  └─ Delete (X)    │  └─ [Xác minh]      │  └─ [Yes/No]     │
│  └─ Add button       │                      │                  │
└──────────────────────┴──────────────────────┴──────────────────┘
           │                    │                      │
           │ API Calls          │ API Calls            │ API Calls
           ▼                    ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Flask/Python)                       │
├──────────────────────┬──────────────────────┬──────────────────┤
│  POST /api/staff     │  GET /api/staff      │  PUT /api/staff  │
│  ├─ Create staff     │  ├─ List staff       │  └─ Update staff │
│  └─ Validate unique  │  └─ Pagination      │                  │
│                      │                      │  DELETE          │
│  POST verify-pwd     │  GET :id/password    │  /api/staff/:id  │
│  ├─ Verify admin pwd │  ├─ Decode pwd       │  └─ Delete staff │
│  └─ Gen 5min token   │  └─ Check expiry     │                  │
└──────────────────────┴──────────────────────┴──────────────────┘
           │                    │                      │
           │ Database Ops       │ Database Ops         │ Database Ops
           ▼                    ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE (MongoDB)                            │
├─────────────────────────────────────────────────────────────────┤
│  users collection                                               │
│  ├─ Admin User Document                                         │
│  │  ├─ accountId: "uuid-1" (unique index)                      │
│  │  ├─ email: "admin@app.com" (unique, not null)               │
│  │  ├─ role: "admin"                                           │
│  │  ├─ username: "admin"                                       │
│  │  ├─ parent_account_id: null                                 │
│  │  └─ ... other fields                                        │
│  │                                                              │
│  ├─ Staff User Document 1                                       │
│  │  ├─ accountId: "uuid-2" (unique index)                      │
│  │  ├─ email: null (sparse, allows multiple nulls)             │
│  │  ├─ role: "staff"                                           │
│  │  ├─ username: "staff1" (indexed with parent_account_id)     │
│  │  ├─ parent_account_id: "uuid-1" (index)                     │
│  │  └─ ... other fields                                        │
│  │                                                              │
│  └─ Staff User Document 2                                       │
│     ├─ accountId: "uuid-3"                                      │
│     ├─ email: null                                              │
│     ├─ role: "staff"                                            │
│     ├─ username: "staff2"                                       │
│     ├─ parent_account_id: "uuid-1"                              │
│     └─ ... other fields                                         │
└─────────────────────────────────────────────────────────────────┘

INDEXES:
  • accountId (unique)              ← Admin and Staff both have unique accountId
  • email (sparse, unique)          ← Admins have email, Staff have null (no duplicate key error)
  • (parent_account_id, username)   ← Staff usernames unique per admin
```

---

## Data Flow: Creating Staff Account

```
┌─────────────┐
│ Admin User  │
│   Fills     │
│  "CreateStaffModal"
└──────┬──────┘
       │
       │ Form Data:
       │ {
       │   username: "john_doe",
       │   name: "John Doe",
       │   phone_number: "0123456789",
       │   password: "securepass123"
       │ }
       │
       ▼
┌────────────────────────────────┐
│  Frontend: api.createStaff()   │
│  ├─ Get adminAccountId         │
│ (from localStorage)             │
│  └─ POST /api/staff with data  │
└────────┬───────────────────────┘
         │
         │ HTTP POST:
         │ {
         │   username: "john_doe",
         │   name: "John Doe",
         │   phone_number: "0123456789",
         │   password: "securepass123",
         │   X-Account-Id: "admin-uuid"
         │ }
         │
         ▼
┌──────────────────────────────────┐
│  Backend: POST /api/staff        │
│  ├─ Extract adminAccountId       │
│  ├─ Find admin user              │
│  ├─ Verify role=='admin'         │
│  ├─ Check username uniqueness    │
│  ├─ Hash password with bcrypt    │
│  ├─ Generate UUID for staff      │
│  └─ Create staff document        │
└────────┬─────────────────────────┘
         │
         │ Insert MongoDB:
         │ {
         │   accountId: "staff-uuid",
         │   email: null,
         │   role: "staff",
         │   username: "john_doe",
         │   name: "John Doe",
         │   phone_number: "0123456789",
         │   password: {hashed},
         │   parent_account_id: "admin-uuid",
         │   is_verified: true,
         │   created_at: <now>,
         │   created_by: "admin-uuid"
         │ }
         │
         ▼
┌─────────────────────────────────┐
│  MongoDB users collection       │
│  ✓ Staff document created       │
└────────┬────────────────────────┘
         │
         │ Response (201):
         │ {
         │   success: true,
         │   data: {
         │     accountId: "staff-uuid",
         │     username: "john_doe",
         │     name: "John Doe",
         │     ...
         │   }
         │ }
         │
         ▼
┌─────────────────────────────────┐
│  Frontend: Modal closes         │
│  ├─ Show success message        │
│  ├─ Refresh staff list          │
│  └─ Clear form                  │
└─────────────────────────────────┘
```

---

## Data Flow: Viewing Staff Password (With Verification)

```
┌──────────────────┐
│ Admin sees "*****" │
│ Clicks eye icon   │
└────────┬─────────┘
         │
         │ Triggers:
         │ handleViewPassword(staffAccountId)
         │
         ▼
┌──────────────────────────────┐
│ VerifyPasswordModal opens    │
│ Admin enters their password  │
└────────┬─────────────────────┘
         │
         │ Form Data:
         │ { password: "admin_pass123" }
         │
         ▼
┌─────────────────────────────────────┐
│ Frontend: verifyAdminPassword()      │
│ POST /api/staff/verify-password     │
│ {                                   │
│   password: "admin_pass123"         │
│   X-Account-Id: "admin-uuid"        │
│ }                                   │
└────────┬────────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Backend: verify-password endpoint │
│ ├─ Find admin account            │
│ ├─ Verify password with bcrypt   │
│ ├─ Generate JWT token            │
│ │  token = {                      │
│ │    admin_account_id: "...",     │
│ │    purpose: "view_staff_pwd",   │
│ │    exp: now + 5min              │
│ │  }                              │
│ └─ Return token + expiry time     │
└────────┬─────────────────────────┘
         │
         │ Response (200):
         │ {
         │   success: true,
         │   data: {
         │     token: "eyJhbG...",
         │     expires_at: "2026-01-28T12:45:00Z"
         │   }
         │ }
         │
         ▼
┌───────────────────────────────┐
│ Frontend: Store token         │
│ ├─ Save token in state        │
│ ├─ Set timeout (5 min)        │
│ └─ Close VerifyPasswordModal  │
└────────┬──────────────────────┘
         │
         │ Now when user clicks eye:
         │
         ▼
┌──────────────────────────────────────────┐
│ Frontend: getStaffPassword()             │
│ GET /api/staff/:staffId/password        │
│ Headers: {                               │
│   X-Password-Verification-Token: token  │
│ }                                        │
└────────┬─────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│ Backend: GET /staff/:id/password   │
│ ├─ Extract token from header       │
│ ├─ Decode JWT token               │
│ ├─ Verify not expired             │
│ ├─ Find staff account             │
│ ├─ Verify parent_account_id       │
│ ├─ Decode password from base64    │
│ └─ Return decoded password        │
└────────┬───────────────────────────┘
         │
         │ Response (200):
         │ {
         │   success: true,
         │   data: {
         │     password: "securepass123",
         │     username: "john_doe"
         │   }
         │ }
         │
         ▼
┌──────────────────────────────────┐
│ Frontend: Display password       │
│ ├─ Show in modal: "securepass123"│
│ ├─ Auto-close after 3 seconds    │
│ └─ Clear from state              │
└──────────────────────────────────┘

═══════════════════════════════════════════

AFTER 5 MINUTES:
Token expires → Next eye click
→ Show VerifyPasswordModal again
→ Admin re-enters password
→ New token generated
```

---

## Database Schema: Users Collection

### Admin User Document
```javascript
{
  "_id": ObjectId("..."),
  
  // Authentication
  "accountId": "550e8400-e29b-41d4-a716-446655440000",  // Unique index
  "email": "admin@company.com",                          // Unique index, sparse
  "password": <BinData>,                                 // bcrypt hash
  "username": "admin_user",                              // Optional field
  
  // Profile
  "name": "Admin Name",
  "phone_number": "0123456789",
  "avatar_url": "/uploads/avatars/123456.jpg",
  
  // Account Info
  "role": "admin",                    // NEW
  "parent_account_id": null,          // NEW (null for admin)
  "is_verified": true,
  
  // Audit Trail
  "created_by": null,                 // NEW (null for admin)
  "created_at": ISODate("2026-01-01T00:00:00Z"),
  "updated_at": ISODate("2026-01-28T10:00:00Z"),
  
  // Email Verification
  "verification_token": null,
  "verification_token_expires_at": null
}
```

### Staff User Document
```javascript
{
  "_id": ObjectId("..."),
  
  // Authentication
  "accountId": "660e8400-e29b-41d4-a716-446655440001",  // Unique index
  "email": null,                                         // Sparse index, allows null
  "password": <BinData>,                                 // bcrypt hash
  "username": "john_doe",                                // Indexed with parent_account_id
  
  // Profile
  "name": "John Doe",
  "phone_number": "0987654321",
  "avatar_url": null,                                    // Optional
  
  // Account Info
  "role": "staff",                    // NEW
  "parent_account_id": "550e8400-e29b-41d4-a716-446655440000",  // NEW (admin's accountId)
  "is_verified": true,                // Auto-verified for staff
  
  // Audit Trail
  "created_by": "550e8400-e29b-41d4-a716-446655440000",  // NEW (admin who created)
  "created_at": ISODate("2026-01-28T10:00:00Z"),
  "updated_at": ISODate("2026-01-28T10:00:00Z"),
  
  // Always null for staff
  "verification_token": null,
  "verification_token_expires_at": null
}
```

---

## Database Indexes

### Current (Before Changes)
```python
collection.create_index('email', unique=True)
collection.create_index('accountId', unique=True)
collection.create_index('verification_token', sparse=True)
```

### After Changes
```python
# Drop or modify email index
# ✓ Keep accountId unique index
collection.create_index('accountId', unique=True)

# Email: make sparse to allow null values for staff
collection.create_index('email', sparse=True, unique=True)
# OR use partial filter (MongoDB 3.2+):
# collection.create_index(
#   'email', 
#   unique=True,
#   partialFilterExpression={'email': {'$ne': None}}
# )

# NEW: Username per parent account
collection.create_index(
  [('parent_account_id', 1), ('username', 1)],
  unique=True,
  sparse=True  # Allow staff with no parent to have any username
)

# NEW: Find all staff for an admin
collection.create_index(
  [('parent_account_id', 1), ('role', 1)]
)

# Keep existing
collection.create_index('verification_token', sparse=True)
```

---

## API Request/Response Examples

### 1. CREATE STAFF
```
REQUEST:
POST /api/staff
Headers:
  Content-Type: application/json
  X-Account-Id: admin-uuid

Body:
{
  "username": "john_doe",
  "name": "John Doe",
  "phone_number": "0123456789",
  "password": "securepass123"
}

RESPONSE (201):
{
  "success": true,
  "message": "Staff account created successfully",
  "data": {
    "accountId": "660e8400-e29b-41d4-a716-446655440001",
    "username": "john_doe",
    "name": "John Doe",
    "phone_number": "0123456789",
    "avatar_url": null,
    "email": null,
    "is_verified": true,
    "role": "staff",
    "created_at": "2026-01-28T10:00:00Z"
  }
}

ERROR (400):
{
  "success": false,
  "message": "Username already exists"
}
```

### 2. LIST STAFF
```
REQUEST:
GET /api/staff?skip=0&limit=50&search=john
Headers:
  X-Account-Id: admin-uuid

RESPONSE (200):
{
  "success": true,
  "data": [
    {
      "accountId": "660e8400-...",
      "name": "John Doe",
      "username": "john_doe",
      "phone_number": "0123456789",
      "avatar_url": null,
      "password": <bcrypt_hash>,
      "email": null,
      "role": "staff",
      "created_at": "2026-01-28T10:00:00Z"
    }
  ],
  "total": 1
}
```

### 3. UPDATE STAFF
```
REQUEST:
PUT /api/staff/660e8400-e29b-41d4-a716-446655440001
Headers:
  X-Account-Id: admin-uuid

Body:
{
  "phone_number": "0987654321",
  "new_password": "newpass456"
}

RESPONSE (200):
{
  "success": true,
  "message": "Staff account updated successfully",
  "data": {
    "accountId": "660e8400-...",
    "name": "John Doe",
    "username": "john_doe",
    "phone_number": "0987654321"
  }
}
```

### 4. DELETE STAFF
```
REQUEST:
DELETE /api/staff/660e8400-e29b-41d4-a716-446655440001
Headers:
  X-Account-Id: admin-uuid

RESPONSE (200):
{
  "success": true,
  "message": "Staff account deleted successfully"
}
```

### 5. VERIFY PASSWORD (5-min session)
```
REQUEST:
POST /api/staff/verify-password
Headers:
  X-Account-Id: admin-uuid

Body:
{
  "password": "admin_pass123"
}

RESPONSE (200):
{
  "success": true,
  "message": "Password verified",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_at": "2026-01-28T12:45:00Z"
  }
}

TOKEN PAYLOAD (decoded):
{
  "admin_account_id": "550e8400-...",
  "purpose": "view_staff_password",
  "exp": 1706438700  // Unix timestamp 5 min from now
}
```

### 6. GET STAFF PASSWORD (with verification)
```
REQUEST:
GET /api/staff/660e8400-e29b-41d4-a716-446655440001/password
Headers:
  X-Account-Id: admin-uuid
  X-Password-Verification-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

RESPONSE (200):
{
  "success": true,
  "data": {
    "password": "securepass123",
    "username": "john_doe"
  }
}

ERROR (401):
{
  "success": false,
  "message": "Verification session expired"
}
```

---

## Implementation Timeline

```
Week 1:
├─ Day 1-2: Backend Models & Indexes
├─ Day 3-4: Backend Routes & Tests  
└─ Day 5: Frontend Components Setup

Week 2:
├─ Day 1-2: Frontend Integration
├─ Day 3-4: Testing & Bug Fixes
└─ Day 5: Deploy to Production

Total Effort: ~10-15 developer days (backend 5d, frontend 5d, testing 3d)
```

---

## Security Checkpoints

```
✓ Admin password verified server-side (never in clear text)
✓ Password hashed with bcrypt (not reversible)
✓ 5-min JWT token signed with SECRET_KEY
✓ Token verified on each password view request
✓ parent_account_id prevents cross-account access
✓ Email index allows null without duplicates
✓ Sparse index on email (non-staff users must have email)
✓ Authorization checked on all staff operations
✓ Role-based access: only admin can manage staff
```

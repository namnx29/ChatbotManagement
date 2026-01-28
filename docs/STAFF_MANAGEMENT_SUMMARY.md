# Staff Management System - Executive Summary

## What You're Building

A complete **Staff Account Management** system for admins to manage employee/staff accounts within their platform instance. Staff accounts are **simplified user accounts** (no email, auto-verified) that can only be created by admin accounts.

---

## Key Concepts

### Account Hierarchy
```
Admin Account (created via registration page)
    ├── Staff Account 1 (created by admin via accounts page)
    ├── Staff Account 2
    └── Staff Account 3
```

### Three Account Types

| Aspect | Admin | Staff | Difference |
|--------|-------|-------|-----------|
| Created via | Registration page | Admin creation | - |
| Email | Required | NULL | Staff don't have email |
| Login | Email + Password | Username + Password | - |
| Email Verified | No (sends verification) | Yes (auto) | Staff always verified |
| Parent Account | None (null) | Admin's accountId | Hierarchy |
| Can Create Staff | Yes | No | Only admin can create |
| Visible to | Only self, their staff | Only their admin | Isolation |

---

## Database Changes Summary

### New Fields in Users Collection
```python
'role': 'admin' or 'staff'
'username': 'unique per parent'
'parent_account_id': 'null for admin, admin's accountId for staff'
'created_by': 'audit trail'
```

### Index Changes
- **REMOVE:** Email unique constraint (allows null values to coexist)
- **ADD:** Username index (unique per parent account)
- **ADD:** Parent account ID index (for querying staff)
- **KEEP:** accountId unique index

### Why This Matters
Without removing the email unique index, creating multiple staff accounts with `email: null` causes MongoDB duplicate key error.

---

## API Endpoints

### Staff Management (5 endpoints)
| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/staff` | Create staff account | Admin |
| GET | `/api/staff` | List staff accounts | Admin |
| PUT | `/api/staff/:id` | Update staff account | Admin |
| DELETE | `/api/staff/:id` | Delete staff account | Admin |
| POST | `/api/staff/verify-password` | Verify admin password (5 min session) | Admin |
| GET | `/api/staff/:id/password` | Get staff password (with verification) | Admin |

---

## Frontend Components

### New Components
1. **EditStaffModal** - Edit staff: username, name, phone, password
2. **VerifyPasswordModal** - Admin enters password to view staff passwords

### Updated Components
1. **CreateStaffModal** - Already exists, add API integration
2. **accounts/page.js** - Add staff table with CRUD actions
3. **api.js** - Add 6 new staff API functions

### Staff Table Columns
- Avatar (from profile picture)
- Name
- Username  
- Password (masked "********" with eye icon)
- Phone Number
- Edit button
- Delete button (with confirmation)

---

## Password Viewing Workflow

```
Admin clicks eye icon on staff password
    ↓
System opens "Verify Your Password" modal
    ↓
Admin enters their password
    ↓
Backend verifies admin password
    ↓
Backend generates 5-min session token (JWT)
    ↓
Frontend shows staff's password
    ↓
Backend decodes base64 password and returns
    ↓
Within 5 minutes: admin can view other passwords without re-entering
    ↓
After 5 minutes: must re-verify password to view more passwords
```

### Security Details
- Admin password is verified server-side (never sent in clear)
- Session token is JWT signed with SECRET_KEY
- Token expires after 5 minutes
- Password is base64 encoded in database
- Frontend passes token in `X-Password-Verification-Token` header

---

## Login Changes

### Before (Current)
```
Login: email + password (only email)
```

### After (New)
```
Login: email/username + password (supports both)
For admin: use email
For staff: use username (since staff don't have email)
```

---

## CRUD Operations

### CREATE: Add Staff
```
Admin: fills CreateStaffModal
  └─ username (unique, required)
  └─ name (required)
  └─ phone (optional)
  └─ password (required, min 6)
  └─ click "Thêm"
  └─ POST /api/staff
  └─ Staff account created with role='staff', email=null, is_verified=true
```

### READ: View Staff List
```
GET /api/staff
  └─ Returns: list of staff created by this admin
  └─ Fields: avatar, name, username, password (masked), phone
  └─ Supports: pagination, search
```

### UPDATE: Edit Staff
```
Admin: clicks edit icon on staff row
  └─ Form opens with: username, name, phone, new_password (empty)
  └─ Admin changes: name, username, phone, or new password
  └─ Admin clicks save
  └─ PUT /api/staff/:id { changed_fields }
  └─ Backend updates ONLY changed fields
  └─ If password changed: re-hash it
  └─ If username changed: check uniqueness
```

### DELETE: Remove Staff
```
Admin: clicks delete icon
  └─ ConfirmModal opens: "Delete staff account?"
  └─ Admin confirms
  └─ DELETE /api/staff/:id
  └─ Staff account deleted from database
```

---

## Implementation Order (Recommended)

### Phase 1: Backend Database & Models
1. Add `role`, `username`, `parent_account_id` fields
2. Update indexes (remove email unique, add username + parent)
3. Add UserModel methods: create_staff, list_staff, update_staff, delete_staff
4. Add UserModel methods: verify_admin_password, get_staff_password, find_by_username

### Phase 2: Backend Routes
1. Create `/api/staff` routes (POST, GET, PUT, DELETE)
2. Create `/api/staff/verify-password` (POST)
3. Create `/api/staff/:id/password` (GET)
4. Update login endpoint to accept username
5. Update registration to set `role='admin'`

### Phase 3: Frontend Components
1. Create EditStaffModal
2. Create VerifyPasswordModal
3. Add API functions in api.js

### Phase 4: Frontend Integration
1. Update accounts/page.js with staff table
2. Add create staff flow
3. Add edit staff flow
4. Add delete staff flow with ConfirmModal
5. Add password viewing with VerifyPasswordModal

### Phase 5: Testing & Deployment
1. Test all CRUD operations
2. Test login with email and username
3. Test password verification session (5 min timeout)
4. Test authorization (staff can't create staff)
5. Deploy to production

---

## Key Implementation Details

### Password Storage
- Passwords are hashed using bcrypt (existing)
- When viewing password: backend decodes base64 of actual plain text
- **Important:** Currently your system seems to use base64 for demo. Real systems should NOT store plain text passwords!

### Session Management  
- JWT token with 5-minute expiry
- Token contains: `admin_account_id`, `purpose: 'view_staff_password'`, `exp: now+5min`
- Verify token expiry: if expired, ask admin to re-enter password

### Authorization
- `parent_account_id` field ensures data isolation
- All staff operations check: `staff.parent_account_id == admin.accountId`
- This prevents cross-account access

### Email Index Issue
- **Problem:** Staff accounts have `email: null`
- **Current:** `email` is unique index → multiple nulls = duplicate key error
- **Solution:** Use sparse index OR remove unique constraint
- **Better:** Use partial index: `create_index('email', unique=True, partialFilterExpression={'email': {'$ne': None}})`

---

## Testing Scenarios

### Happy Path
1. Register admin account
2. Login as admin
3. Go to accounts page
4. Create staff: username="staff1", name="John", phone="0123456789", password="pass123"
5. See staff in table
6. Click eye on password
7. Enter admin password
8. See "pass123" displayed
9. Click eye on another staff password within 5 min → no verification needed
10. Edit staff: change phone to "0987654321"
11. Delete staff with confirmation
12. Verify staff deleted from table

### Edge Cases
1. Duplicate username in same account → error
2. Duplicate username in different account → allowed
3. Create staff without parent_account_id → error
4. View staff password with expired token → ask for re-verification
5. Staff tries to create staff → error (not admin)

---

## Files to Modify/Create

### Backend
- `server/models/user.py` - Add fields, methods, indexes
- `server/routes/user.py` - Add staff routes
- `server/routes/auth.py` - Update login, registration

### Frontend  
- `client/lib/components/popup/CreateStaffModal.js` - Update API call
- `client/lib/components/popup/EditStaffModal.js` - NEW
- `client/lib/components/popup/VerifyPasswordModal.js` - NEW
- `client/app/dashboard/accounts/page.js` - Add staff table
- `client/lib/api.js` - Add 6 staff functions

---

## Common Questions

**Q: Can staff accounts have email?**
A: No. They have `email: null`. This is intentional to simplify staff management (no email verification needed).

**Q: Can staff create other staff?**
A: No. Only admin accounts can create staff. Staff don't have the permission.

**Q: What if staff forgets password?**
A: Admin can edit that staff account and change the password.

**Q: How long is the password viewing session?**
A: 5 minutes. After that, admin must re-enter their password to view another staff password.

**Q: Can staff login with email?**
A: No, they have no email. They login with username + password.

**Q: Can I migrate existing users to staff?**
A: Yes. Just set `role='staff'`, `parent_account_id=<admin_id>`, `email=null` on existing users.

---

See `STAFF_MANAGEMENT_IMPLEMENTATION_PLAN.md` for detailed technical specifications.

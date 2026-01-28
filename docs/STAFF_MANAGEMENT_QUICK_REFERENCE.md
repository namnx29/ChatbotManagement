# Staff Management - Quick Reference Guide

## 🚀 What to Build - 30 Second Summary

Admin accounts can create simplified "staff" accounts (no email, no email verification). Staff accounts have:
- Username + password login (no email)
- Limited fields: username, name, phone (optional)
- Managed by their admin
- Password viewing requires admin password verification (5-min session)

---

## 📋 Files to Change

### Backend (3 files)
1. **server/models/user.py** - Add: `role`, `username`, `parent_account_id` fields & 7 new methods
2. **server/routes/user.py** - Add: 6 staff API routes
3. **server/routes/auth.py** - Update: login to support username, register to set role='admin'

### Frontend (4 files)
1. **client/lib/components/popup/EditStaffModal.js** - NEW component
2. **client/lib/components/popup/VerifyPasswordModal.js** - NEW component
3. **client/lib/components/popup/CreateStaffModal.js** - Add API call
4. **client/lib/api.js** - Add 6 API functions
5. **client/app/dashboard/accounts/page.js** - Add staff table

---

## 🗄️ Database Changes

### Add Fields
```python
'role': 'admin' | 'staff'
'username': 'unique per parent'
'parent_account_id': 'admin accountId or null'
'created_by': 'who created this account'
```

### Update Indexes
```
REMOVE: email unique constraint (causes duplicate key with nulls)
ADD: email sparse, unique (allows multiple nulls)
ADD: (parent_account_id, username) unique index
ADD: (parent_account_id, role) index
KEEP: accountId unique
KEEP: verification_token sparse
```

---

## 🔌 New API Endpoints (6 total)

```
POST   /api/staff                      → Create staff
GET    /api/staff                      → List staff
PUT    /api/staff/:id                  → Update staff
DELETE /api/staff/:id                  → Delete staff
POST   /api/staff/verify-password      → Get 5-min token
GET    /api/staff/:id/password         → Get password (needs token)
```

---

## 🎨 Frontend Components

### Staff Table Columns
```
Avatar | Name | Username | Password*** | Phone | Edit | Delete
```

### 3 Modals
- **CreateStaffModal** (exists) - Add API integration
- **EditStaffModal** (NEW) - Edit: username, name, phone, new_password
- **VerifyPasswordModal** (NEW) - Enter admin password for 5-min session

---

## 🔐 Password Viewing Flow

```
Admin clicks eye icon
    ↓
VerifyPasswordModal opens (asks for admin password)
    ↓
Admin enters password → sends to backend
    ↓
Backend verifies password → returns JWT token (5 min valid)
    ↓
Frontend stores token, shows password
    ↓
Within 5 min: click eye again → shows password immediately (no re-enter)
After 5 min: click eye again → asks for password again
```

---

## ✅ Implementation Order

### Day 1-2: Backend Models
- [ ] Add fields to UserModel
- [ ] Update indexes
- [ ] Add 7 methods to UserModel

### Day 3-4: Backend Routes  
- [ ] Add 6 routes in user.py
- [ ] Update login endpoint
- [ ] Update register endpoint

### Day 5-6: Frontend Components
- [ ] Create EditStaffModal
- [ ] Create VerifyPasswordModal
- [ ] Add API functions
- [ ] Update CreateStaffModal

### Day 7-8: Frontend Integration
- [ ] Update accounts/page.js
- [ ] Add staff table with CRUD
- [ ] Test all operations

### Day 9-10: Testing & Deploy
- [ ] Test database migration
- [ ] Integration testing
- [ ] Deploy & validate

---

## 🧪 Test Checklist

- [ ] Create staff → appears in table
- [ ] Edit staff → updates fields
- [ ] Delete staff → removed from table
- [ ] View password → requires verification
- [ ] 5-min timeout → re-verify after expiry
- [ ] Staff login with username → works
- [ ] Staff cant create staff → error
- [ ] Other admin cant see my staff → authorization works
- [ ] No duplicate key errors → indexes working

---

## 🔍 Key Code Snippets

### UserModel - Create Staff
```python
def create_staff(self, parent_account_id, username, name, phone_number, password):
    # 1. Verify parent is admin
    # 2. Check username uniqueness
    # 3. Create staff doc with:
    #    - email: null
    #    - role: 'staff'
    #    - is_verified: true
    #    - parent_account_id: parent_account_id
    # 4. Return staff data
```

### UserModel - Get Password with JWT
```python
def get_staff_password(self, staff_id, parent_id, verification_token):
    # 1. Decode & verify JWT token (check expiry)
    # 2. Find staff (verify parent_account_id matches)
    # 3. Decode password from base64
    # 4. Return plaintext password + username
```

### Frontend - Handle Eye Click
```javascript
const handleViewPassword = async (staffAccountId) => {
  // Check if token still valid
  if (passwordViewToken && new Date() < passwordTokenExpiry) {
    // Show password without re-verify
    await getStaffPassword(staffAccountId, passwordViewToken);
  } else {
    // Show VerifyPasswordModal
    setIsVerifyModalOpen(true);
  }
}

const handlePasswordVerified = (token, expiresAt) => {
  // Store token + expiry
  setPasswordViewToken(token);
  setPasswordTokenExpiry(new Date(expiresAt));
  
  // Now show password
  showPassword();
}
```

---

## 🚨 Common Pitfalls

1. **Email Index Unique Constraint** - Will cause duplicate key error with multiple null emails
   - Fix: Make sparse or use partial filter
   
2. **Forgetting parent_account_id Check** - Security issue, data can leak
   - Fix: Always verify `staff.parent_account_id == admin.accountId`

3. **JWT Expiry Not Checked** - Users can view passwords after 5 min
   - Fix: Verify expiry on every password view request

4. **Username Index Not Per Parent** - Staff from different admins can't have same username
   - Fix: Use compound index: (parent_account_id, username)

5. **Password Stored as Plain Text** - Current system uses base64, not recommended
   - Fix: In future, use one-way hashing or encryption

---

## 📚 Documentation Files Created

1. **STAFF_MANAGEMENT_SUMMARY.md** - Executive summary & concepts
2. **STAFF_MANAGEMENT_IMPLEMENTATION_PLAN.md** - Detailed technical spec (most important!)
3. **STAFF_MANAGEMENT_ARCHITECTURE.md** - Data flow, schemas, API examples
4. **STAFF_MANAGEMENT_CHECKLIST.md** - Step-by-step checklist
5. **STAFF_MANAGEMENT_QUICK_REFERENCE.md** - This file

---

## 🎯 Success = When These Work

✅ Admin creates staff account
✅ Table shows staff with all columns
✅ Edit works (changes saved)
✅ Delete works (with confirmation)
✅ Eye icon → password verification modal
✅ After verification: can see password
✅ 5 min later: need to verify again
✅ Staff can login with username
✅ No database errors

---

## 🆘 Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Duplicate key error on create staff | Email unique index with nulls | Update index to sparse |
| Eye icon shows nothing | Token expired | Check token in state |
| Can't edit staff | Forgot to check parent_account_id | Add authorization check |
| Staff can create staff | No role check | Verify role == 'admin' |
| 5-min timeout not working | Using setTimeout (doesn't handle tab switch) | Use state + check on click |

---

## 📞 Contact for Questions

All documentation is in `/docs/` folder:
- Implementation details → `STAFF_MANAGEMENT_IMPLEMENTATION_PLAN.md`
- Data flow & architecture → `STAFF_MANAGEMENT_ARCHITECTURE.md`
- Step-by-step guide → `STAFF_MANAGEMENT_CHECKLIST.md`

---

**Start with:** `STAFF_MANAGEMENT_IMPLEMENTATION_PLAN.md` (most detailed)
**Then follow:** `STAFF_MANAGEMENT_CHECKLIST.md` (implementation order)
**Reference:** `STAFF_MANAGEMENT_ARCHITECTURE.md` (when stuck)

Good luck! 🚀

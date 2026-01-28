# Staff Management - Complete Implementation Checklist

## Phase 1: Backend Database & Models

### 1.1 Update User Model Schema
- [ ] Add `role` field (default: 'admin' for existing users)
- [ ] Add `username` field (unique per parent_account_id)
- [ ] Add `parent_account_id` field (null for admin, admin's accountId for staff)
- [ ] Add `created_by` field (for audit trail)
- [ ] Update `_create_indexes()` method

### 1.2 Database Index Changes
- [ ] Keep: `accountId` unique index
- [ ] Update: `email` to sparse, unique index (allow null for staff)
  - Option A: `create_index('email', sparse=True, unique=True)`
  - Option B: Use partial filter for MongoDB 3.2+
- [ ] Add: `(parent_account_id, username)` unique index
- [ ] Add: `(parent_account_id, role)` index for querying
- [ ] Keep: `verification_token` sparse index

### 1.3 UserModel Methods
- [ ] `find_by_username(username, parent_account_id=None)`
- [ ] `create_staff(parent_account_id, username, name, phone_number, password)`
- [ ] `list_staff_accounts(parent_account_id, skip=0, limit=50, search=None)`
- [ ] `update_staff(staff_account_id, parent_account_id, **updates)`
- [ ] `delete_staff(staff_account_id, parent_account_id)`
- [ ] `verify_admin_password(admin_account_id, password)`
- [ ] `get_staff_password(staff_account_id, parent_account_id, token)`

### 1.4 Verify Bcrypt & JWT Available
- [ ] Bcrypt already imported in user.py ✓
- [ ] JWT library installed: `pip install PyJWT`
- [ ] Add JWT import to user.py or routes

---

## Phase 2: Backend Routes

### 2.1 Staff Create Endpoint
- [ ] Create `POST /api/staff` route
- [ ] Validate: accountId from header
- [ ] Validate: role == 'admin'
- [ ] Validate: username, name, password required
- [ ] Validate: password min 6 chars
- [ ] Call: `user_model.create_staff(...)`
- [ ] Return: 201 with staff data
- [ ] Error handling: duplicate username, unauthorized, validation errors

### 2.2 Staff List Endpoint
- [ ] Create `GET /api/staff` route
- [ ] Params: skip, limit, search
- [ ] Validate: accountId from header
- [ ] Call: `user_model.list_staff_accounts(...)`
- [ ] Return: 200 with data array + total count
- [ ] Pagination support

### 2.3 Staff Update Endpoint
- [ ] Create `PUT /api/staff/:accountId` route
- [ ] Validate: accountId from header is admin
- [ ] Validate: staff belongs to this admin
- [ ] Support: partial updates (name, username, phone, new_password)
- [ ] Check: username uniqueness if changed
- [ ] Call: `user_model.update_staff(...)`
- [ ] Return: 200 with updated data

### 2.4 Staff Delete Endpoint
- [ ] Create `DELETE /api/staff/:accountId` route
- [ ] Validate: accountId from header is admin
- [ ] Validate: staff belongs to this admin
- [ ] Call: `user_model.delete_staff(...)`
- [ ] Return: 200 success
- [ ] Error: 404 if not found, 403 if unauthorized

### 2.5 Verify Password Endpoint
- [ ] Create `POST /api/staff/verify-password` route
- [ ] Validate: accountId from header
- [ ] Get admin user from database
- [ ] Verify password using bcrypt
- [ ] Generate JWT token (5 min expiry)
- [ ] Return: token + expires_at
- [ ] Error: 401 if password incorrect

### 2.6 Get Staff Password Endpoint
- [ ] Create `GET /api/staff/:accountId/password` route
- [ ] Extract: token from `X-Password-Verification-Token` header
- [ ] Decode: JWT token
- [ ] Verify: token not expired
- [ ] Find: staff account
- [ ] Verify: parent_account_id matches
- [ ] Decode: password from base64
- [ ] Return: password + username
- [ ] Error: 401 if token invalid/expired

### 2.7 Update Registration Endpoint
- [ ] Update `POST /register` route
- [ ] Set: `role = 'admin'` for new registrations
- [ ] Set: `parent_account_id = None` for admins
- [ ] Set: `email = <provided email>` (keep as is)

### 2.8 Update Login Endpoint
- [ ] Update `POST /login` route
- [ ] Support: login by email OR username
- [ ] Try: `find_by_email(email_or_username)` first
- [ ] If not found: try `find_by_username(email_or_username)`
- [ ] For staff: skip email verification requirement
- [ ] Verify password and login as usual

### 2.9 Add Route to user.py
- [ ] Import JWT in routes/user.py
- [ ] Register all 6 staff routes in init_user_routes()
- [ ] Add to Blueprint: `/api/staff` routes

---

## Phase 3: Frontend Components

### 3.1 Create EditStaffModal
- [ ] New file: `/client/lib/components/popup/EditStaffModal.js`
- [ ] Form fields: username, name, phone_number, new_password
- [ ] Populate form with staffData props
- [ ] Validate: username (min 3), name (required)
- [ ] Validate: new_password (min 6 if provided)
- [ ] Track changes: only send changed fields + non-empty password
- [ ] API call: `updateStaff()` with changes
- [ ] Show: success/error messages
- [ ] Close: modal and refresh parent list

### 3.2 Create VerifyPasswordModal
- [ ] New file: `/client/lib/components/popup/VerifyPasswordModal.js`
- [ ] Form field: password input
- [ ] Message: "Enter your password to view staff passwords"
- [ ] API call: `verifyAdminPassword()` on submit
- [ ] Return: token + expires_at to parent
- [ ] Error: show error message if incorrect
- [ ] Auto-focus: password input when opened

### 3.3 Update CreateStaffModal
- [ ] File: `/client/lib/components/popup/CreateStaffModal.js`
- [ ] Add API integration: call `createStaff()` on submit
- [ ] Pass accountId from localStorage
- [ ] Handle: success/error responses
- [ ] Show: error messages if creation fails
- [ ] Refresh: parent staff list on success
- [ ] Keep: existing form fields (username, name, phone, password)

### 3.4 Add API Functions
- [ ] File: `/client/lib/api.js`
- [ ] Add: `createStaff(accountId, staffData)`
- [ ] Add: `listStaffAccounts(accountId, skip, limit, search)`
- [ ] Add: `updateStaff(accountId, staffAccountId, updates)`
- [ ] Add: `deleteStaff(accountId, staffAccountId)`
- [ ] Add: `verifyAdminPassword(accountId, password)`
- [ ] Add: `getStaffPassword(accountId, staffAccountId, token)`
- [ ] Include: proper error handling for all functions

---

## Phase 4: Frontend Integration

### 4.1 Update Accounts Page
- [ ] File: `/client/app/dashboard/accounts/page.js`
- [ ] Keep: existing admin user section
- [ ] Add: staff accounts section below admin
- [ ] Fetch: staff list on mount using `listStaffAccounts()`
- [ ] Handle: loading state while fetching
- [ ] Handle: error state with error message

### 4.2 Admin Account Section
- [ ] Display: current admin info (existing)
- [ ] Keep: existing admin table with current columns

### 4.3 Staff Table
- [ ] Columns: Avatar, Name, Username, Password, Phone, Edit, Delete
- [ ] Avatar: show icon if no image
- [ ] Password: display "********" with eye icon
- [ ] Edit: show pencil icon, click opens EditStaffModal
- [ ] Delete: show X icon, click opens ConfirmModal

### 4.4 Staff Table Columns Code
```javascript
const staffColumns = [
  {
    title: 'Tên',
    dataIndex: 'name',
    render: (text, record) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Avatar src={record.avatar_url} icon={<UserOutlined />} />
        <div>
          <div style={{ fontWeight: '500' }}>{text}</div>
          <div style={{ fontSize: '13px', color: '#666' }}>{record.username}</div>
        </div>
      </div>
    ),
  },
  {
    title: 'Tên đăng nhập',
    dataIndex: 'username',
  },
  {
    title: 'Mật khẩu',
    render: (_, record) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>{'*'.repeat(8)}</span>
        <EyeOutlined
          style={{ cursor: 'pointer', color: '#1890ff' }}
          onClick={() => handleViewPassword(record.accountId)}
        />
      </div>
    ),
  },
  {
    title: 'Số điện thoại',
    dataIndex: 'phone_number',
    render: (text) => text || 'Chưa cập nhật',
  },
  {
    title: 'Hành động',
    render: (_, record) => (
      <div style={{ display: 'flex', gap: '12px' }}>
        <EditOutlined
          style={{ cursor: 'pointer' }}
          onClick={() => handleEditStaff(record)}
        />
        <DeleteOutlined
          style={{ cursor: 'pointer', color: '#ff4d4f' }}
          onClick={() => handleDeleteStaff(record.accountId)}
        />
      </div>
    ),
  },
];
```

### 4.5 Handler Functions
- [ ] `handleViewPassword(staffAccountId)` - shows VerifyPasswordModal
- [ ] `handleEditStaff(staffData)` - shows EditStaffModal
- [ ] `handleDeleteStaff(staffAccountId)` - shows ConfirmModal
- [ ] `handlePasswordVerified(token)` - stores token, shows passwords
- [ ] `handleEditSuccess()` - refreshes staff list
- [ ] `handleDeleteSuccess()` - refreshes staff list

### 4.6 State Management
- [ ] `staffAccounts` - array of staff
- [ ] `selectedStaff` - current editing staff
- [ ] `isCreateModalOpen` - show CreateStaffModal
- [ ] `isEditModalOpen` - show EditStaffModal
- [ ] `isDeleteModalOpen` - show ConfirmModal
- [ ] `isVerifyModalOpen` - show VerifyPasswordModal
- [ ] `passwordViewToken` - JWT token for viewing passwords
- [ ] `passwordTokenExpiry` - when token expires
- [ ] `isLoading` - loading state

### 4.7 Password Viewing Logic
- [ ] First click on eye: show VerifyPasswordModal
- [ ] After verification: store token in state
- [ ] Set 5-min timeout: clear token after 5 min
- [ ] Within 5 min: next eye click calls `getStaffPassword()` directly
- [ ] After 5 min: next eye click shows VerifyPasswordModal again
- [ ] Display: password in modal for 3 sec, then auto-close

---

## Phase 5: Testing & Validation

### 5.1 Backend Unit Tests
- [ ] Test: create staff with valid data
- [ ] Test: create staff with duplicate username (error)
- [ ] Test: create staff with invalid parent (error)
- [ ] Test: list staff returns only parent's staff
- [ ] Test: update staff fields
- [ ] Test: update staff password
- [ ] Test: delete staff
- [ ] Test: verify admin password
- [ ] Test: get staff password with valid token
- [ ] Test: get staff password with expired token
- [ ] Test: unauthorized access by non-admin

### 5.2 Frontend Component Tests
- [ ] CreateStaffModal: submit creates staff
- [ ] EditStaffModal: load staff data
- [ ] EditStaffModal: submit updates staff
- [ ] VerifyPasswordModal: verify password generates token
- [ ] Password viewing: token stored and reused
- [ ] Password viewing: token expires after 5 min
- [ ] Delete: ConfirmModal confirms deletion

### 5.3 Integration Tests
- [ ] Register admin account
- [ ] Login as admin
- [ ] Navigate to accounts page
- [ ] Create staff account (happy path)
- [ ] View staff in table
- [ ] Edit staff account
- [ ] View staff password (with verification)
- [ ] Delete staff account
- [ ] Logout and login as staff with username

### 5.4 Edge Cases
- [ ] Create staff with special characters in username
- [ ] Create staff with phone number edge cases (10-11 digits)
- [ ] Edit staff: change only phone (other fields unchanged)
- [ ] Edit staff: set phone to empty
- [ ] Edit staff: change password (old password stays different)
- [ ] View password after 5-minute expiry (re-verify)
- [ ] Rapid password viewing (token reuse)
- [ ] Delete last staff account
- [ ] Create staff with name containing unicode

### 5.5 Security Tests
- [ ] Cannot create staff with non-admin account
- [ ] Cannot view staff list of another admin
- [ ] Cannot edit staff of another admin
- [ ] Cannot delete staff of another admin
- [ ] Cannot view password without verification
- [ ] Cannot view password with expired token
- [ ] Cannot view password with modified token

### 5.6 Database Tests
- [ ] Verify: email unique index allows nulls
- [ ] Verify: username unique per parent
- [ ] Verify: all staff have parent_account_id set
- [ ] Verify: all admin have parent_account_id = null
- [ ] Verify: role field set correctly
- [ ] Verify: no data loss during migration

---

## Phase 6: Deployment

### 6.1 Pre-Deployment Checklist
- [ ] Code review completed
- [ ] All tests passing (unit + integration)
- [ ] No console errors or warnings
- [ ] Database migration tested on test DB
- [ ] Documentation updated
- [ ] Environment variables configured
- [ ] CORS settings updated if needed

### 6.2 Database Migration
- [ ] Backup production database
- [ ] Add `role` field to existing users: `update_many({}, {'$set': {'role': 'admin'}})`
- [ ] Update indexes (drop old, add new)
- [ ] Verify: no duplicate email nulls after index creation
- [ ] Test: queries work with new indexes

### 6.3 Backend Deployment
- [ ] Update requirements.txt: add JWT if needed
- [ ] Deploy updated routes/user.py
- [ ] Deploy updated models/user.py
- [ ] Deploy updated routes/auth.py
- [ ] Restart Flask server
- [ ] Verify: new endpoints responding
- [ ] Check: logs for any errors

### 6.4 Frontend Deployment
- [ ] Deploy updated components
- [ ] Deploy updated api.js
- [ ] Deploy updated accounts/page.js
- [ ] Clear browser cache
- [ ] Test: all new features working
- [ ] Monitor: error logs for client-side errors

### 6.5 Post-Deployment Validation
- [ ] Create test staff account
- [ ] Edit test staff account
- [ ] Delete test staff account
- [ ] Verify password viewing
- [ ] Test 5-minute timeout
- [ ] Monitor: database queries performance
- [ ] Monitor: API response times
- [ ] Check: no duplicate key errors

---

## Phase 7: Documentation & Knowledge Transfer

### 7.1 Code Documentation
- [ ] Document: UserModel methods with docstrings
- [ ] Document: API endpoint behaviors
- [ ] Document: return value schemas
- [ ] Comment: complex logic sections

### 7.2 README Updates
- [ ] Add: staff management feature overview
- [ ] Add: API endpoint documentation
- [ ] Add: database schema changes
- [ ] Add: deployment steps

### 7.3 Developer Documentation
- [ ] Architecture diagram (DONE - see ARCHITECTURE doc)
- [ ] Data flow diagrams (DONE - see ARCHITECTURE doc)
- [ ] Implementation guide (DONE - see IMPLEMENTATION_PLAN doc)
- [ ] Troubleshooting guide (TODO)
- [ ] API reference (TODO)

### 7.4 Troubleshooting Guide (New File)
- [ ] Common issues: "Duplicate key error" on staff creation
- [ ] Common issues: "Username already exists"
- [ ] Common issues: "Verification session expired"
- [ ] Common issues: "Token not found in headers"
- [ ] Database index not working
- [ ] Password verification failing

---

## File Summary

| Phase | File | Status | Type |
|-------|------|--------|------|
| 1 | server/models/user.py | MODIFY | Backend Model |
| 2 | server/routes/user.py | MODIFY | Backend Routes |
| 2 | server/routes/auth.py | MODIFY | Backend Routes |
| 3 | client/lib/components/popup/EditStaffModal.js | CREATE | Frontend Component |
| 3 | client/lib/components/popup/VerifyPasswordModal.js | CREATE | Frontend Component |
| 3 | client/lib/components/popup/CreateStaffModal.js | MODIFY | Frontend Component |
| 3 | client/lib/api.js | MODIFY | Frontend API |
| 4 | client/app/dashboard/accounts/page.js | MODIFY | Frontend Page |
| DOC | docs/STAFF_MANAGEMENT_IMPLEMENTATION_PLAN.md | CREATE | Documentation |
| DOC | docs/STAFF_MANAGEMENT_SUMMARY.md | CREATE | Documentation |
| DOC | docs/STAFF_MANAGEMENT_ARCHITECTURE.md | CREATE | Documentation |
| DOC | docs/STAFF_MANAGEMENT_CHECKLIST.md | CREATE | Documentation |

---

## Estimated Effort

| Phase | Component | Days | Notes |
|-------|-----------|------|-------|
| 1 | Models + Indexes | 1.5 | Testing indexes carefully |
| 2 | Routes + Logic | 2.5 | Password verification complex |
| 3 | Components | 1.5 | 3 components (2 new, 1 update) |
| 4 | Integration | 1.5 | Page state management |
| 5 | Testing | 1.5 | Unit + integration tests |
| 6 | Deployment | 1.0 | DB migration + deploy |
| 7 | Documentation | 0.5 | Already created main docs |
| **TOTAL** | | **10 days** | **~1-2 weeks** |

---

## Success Criteria

- [ ] ✅ Admin can create staff accounts with username, name, phone, password
- [ ] ✅ Admin can view all their staff accounts in a table
- [ ] ✅ Admin can edit staff account (all fields)
- [ ] ✅ Admin can delete staff accounts (with confirmation)
- [ ] ✅ Staff passwords masked as "********" with eye icon
- [ ] ✅ Admin can view staff password after password verification
- [ ] ✅ Password verification session lasts 5 minutes
- [ ] ✅ No re-verification needed within 5 min window
- [ ] ✅ Staff can login with username (no email required)
- [ ] ✅ No duplicate key errors with null emails
- [ ] ✅ Only admin can manage staff (authorization works)
- [ ] ✅ Each admin sees only their own staff
- [ ] ✅ All CRUD operations working
- [ ] ✅ Error handling for all edge cases
- [ ] ✅ No data leakage between accounts

---

## Notes for Developer

1. **JWT Token:** Use SECRET_KEY from config.py, expires in 5 minutes
2. **Password Security:** Base64 is NOT encryption. Real systems should use proper encryption or hash matching
3. **Sparse Index:** Essential for allowing multiple null email values
4. **Authorization:** Check `parent_account_id` matches authenticated user on EVERY staff operation
5. **Testing:** Test database migration first on test DB before production
6. **Monitoring:** Watch for duplicate key errors after deployment (index issue)
7. **Performance:** Index (parent_account_id, role) speeds up staff listing
8. **Frontend:** 5-min timeout should use state, not just setTimeout (handle tab switches)
9. **Graceful Degradation:** If JWT token verification fails, ask for password again
10. **Audit Trail:** `created_by` field helps track who created each staff account

---

**Document Version:** 1.0
**Last Updated:** 2026-01-28
**Status:** Complete - Ready for Implementation

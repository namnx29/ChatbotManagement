# Staff Management System - Implementation Plan

## Overview
Complete staff account management system including create, read, update, and delete operations with role-based access control (admin/staff) and secure password viewing with session-based verification.

---

## 1. Database Schema Changes

### 1.1 User Model Updates
**File:** `/home/nam/work/test-preny/server/models/user.py`

#### New Fields to Add:
```python
{
  "email": "string (nullable for staff)",
  "password": "binary (hashed)",
  "name": "string",
  "username": "string (unique per account)",
  "phone_number": "string (optional)",
  "avatar_url": "string (optional)",
  "role": "string (admin|staff)", # NEW
  "parent_account_id": "string (accountId of admin who created this staff)", # NEW
  "is_verified": "boolean",
  "created_at": "datetime",
  "updated_at": "datetime",
  "created_by": "string (accountId)", # NEW for audit trail
  "staff_created_count": "integer (count of staff created by admin)", # NEW for tracking
}
```

#### Index Changes:
**Current indexes:**
- `email` (unique)
- `accountId` (unique)
- `verification_token` (sparse)

**New indexes to create:**
- `accountId` (unique) - KEEP
- `username` (unique per parent_account_id) - NEW
- `parent_account_id` (non-unique) - NEW for querying staff accounts
- Remove `email` unique constraint OR make it conditional (null values allowed)

**Reason:** Multiple staff accounts can have null emails, causing duplicate key errors.

---

## 2. Backend API Endpoints

### 2.1 Staff Account Management Endpoints

#### A. CREATE STAFF ACCOUNT
**Endpoint:** `POST /api/staff`
**Auth Required:** Yes (must be admin)
**Request Body:**
```json
{
  "username": "string (required, unique)",
  "name": "string (required)",
  "phone_number": "string (optional)",
  "password": "string (required, min 6 chars)",
  "role": "staff (fixed)"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Staff account created successfully",
  "data": {
    "accountId": "uuid",
    "username": "string",
    "name": "string",
    "phone_number": "string|null",
    "avatar_url": null,
    "email": null,
    "is_verified": true,
    "role": "staff",
    "created_at": "ISO8601"
  }
}
```

**Database Operation:**
```python
def create_staff(self, parent_account_id, username, name, phone_number=None, password=None):
    # 1. Validate parent account is admin
    parent = self.collection.find_one({'accountId': parent_account_id, 'role': 'admin'})
    if not parent:
        raise ValueError('Unauthorized: Admin account required')
    
    # 2. Check username uniqueness within parent account
    existing = self.collection.find_one({
        'parent_account_id': parent_account_id,
        'username': username
    })
    if existing:
        raise ValueError('Username already exists')
    
    # 3. Create staff account
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(10))
    staff_data = {
        'accountId': str(uuid.uuid4()),
        'username': username,
        'name': name,
        'phone_number': phone_number,
        'password': hashed_password,
        'email': None,  # No email for staff
        'is_verified': True,  # Auto-verify staff accounts
        'role': 'staff',
        'parent_account_id': parent_account_id,
        'avatar_url': None,
        'created_by': parent_account_id,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
    }
    
    # 4. Insert and return
    result = self.collection.insert_one(staff_data)
    staff_data['_id'] = result.inserted_id
    return staff_data
```

#### B. LIST STAFF ACCOUNTS
**Endpoint:** `GET /api/staff`
**Auth Required:** Yes (must be admin)
**Query Params:** 
- `skip` (default: 0)
- `limit` (default: 50)
- `search` (optional: filter by name/username)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "accountId": "uuid",
      "name": "string",
      "username": "string",
      "phone_number": "string|null",
      "avatar_url": "string|null",
      "password": "base64_encoded_hash",
      "email": null,
      "role": "staff",
      "created_at": "ISO8601"
    }
  ],
  "total": 10
}
```

**Database Operation:**
```python
def list_staff_accounts(self, parent_account_id, skip=0, limit=50, search=None):
    query = {
        'parent_account_id': parent_account_id,
        'role': 'staff'
    }
    
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'username': {'$regex': search, '$options': 'i'}}
        ]
    
    cursor = self.collection.find(query).skip(skip).limit(limit)
    staff = list(cursor)
    total = self.collection.count_documents(query)
    
    return staff, total
```

#### C. UPDATE STAFF ACCOUNT
**Endpoint:** `PUT /api/staff/:accountId`
**Auth Required:** Yes (must be parent admin)
**Request Body (all optional, only send changed fields):**
```json
{
  "name": "string",
  "username": "string",
  "phone_number": "string",
  "new_password": "string (if changing password)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Staff account updated successfully",
  "data": {
    "accountId": "uuid",
    "name": "string",
    "username": "string",
    "phone_number": "string|null"
  }
}
```

**Database Operation:**
```python
def update_staff(self, staff_account_id, parent_account_id, **updates):
    # 1. Verify staff belongs to parent
    staff = self.collection.find_one({
        'accountId': staff_account_id,
        'parent_account_id': parent_account_id,
        'role': 'staff'
    })
    if not staff:
        raise ValueError('Staff account not found or unauthorized')
    
    # 2. Build update set
    update_fields = {
        'updated_at': datetime.utcnow()
    }
    
    if 'name' in updates and updates['name'] != staff.get('name'):
        update_fields['name'] = updates['name']
    
    if 'username' in updates and updates['username'] != staff.get('username'):
        # Check uniqueness
        existing = self.collection.find_one({
            'parent_account_id': parent_account_id,
            'username': updates['username'],
            'accountId': {'$ne': staff_account_id}
        })
        if existing:
            raise ValueError('Username already exists')
        update_fields['username'] = updates['username']
    
    if 'phone_number' in updates:
        update_fields['phone_number'] = updates['phone_number'] or None
    
    if 'new_password' in updates and updates['new_password']:
        hashed_password = bcrypt.hashpw(
            updates['new_password'].encode('utf-8'),
            bcrypt.gensalt(10)
        )
        update_fields['password'] = hashed_password
    
    # 3. Update and return
    result = self.collection.find_one_and_update(
        {'_id': staff['_id']},
        {'$set': update_fields},
        return_document=True
    )
    
    return result
```

#### D. DELETE STAFF ACCOUNT
**Endpoint:** `DELETE /api/staff/:accountId`
**Auth Required:** Yes (must be parent admin)
**Response (200):**
```json
{
  "success": true,
  "message": "Staff account deleted successfully"
}
```

**Database Operation:**
```python
def delete_staff(self, staff_account_id, parent_account_id):
    # 1. Verify ownership
    staff = self.collection.find_one({
        'accountId': staff_account_id,
        'parent_account_id': parent_account_id,
        'role': 'staff'
    })
    if not staff:
        raise ValueError('Staff account not found or unauthorized')
    
    # 2. Delete
    self.collection.delete_one({'_id': staff['_id']})
    
    return True
```

#### E. VERIFY ADMIN PASSWORD (for viewing staff passwords)
**Endpoint:** `POST /api/staff/verify-password`
**Auth Required:** Yes (must be admin)
**Request Body:**
```json
{
  "password": "string (admin's password)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password verified",
  "data": {
    "token": "verification_session_token",
    "expires_at": "ISO8601 (5 minutes from now)"
  }
}
```

**Backend Implementation:**
```python
def verify_admin_password(self, admin_account_id, password):
    """
    Verify admin password and return a session token valid for 5 minutes
    """
    admin = self.collection.find_one({'accountId': admin_account_id, 'role': 'admin'})
    if not admin:
        raise ValueError('Admin account not found')
    
    if not self.verify_password(admin, password):
        raise ValueError('Invalid password')
    
    # Generate session token
    session_token = secrets.token_urlsafe(32)
    session_expires = datetime.utcnow() + timedelta(minutes=5)
    
    # Store in cache/Redis or embed in JWT (with signature for security)
    # Option: Store in users collection under admin's account
    # (less ideal) OR use Redis for session store (recommended)
    
    # For now, we'll return a signed JWT token
    import jwt
    token_data = {
        'admin_account_id': admin_account_id,
        'purpose': 'view_staff_password',
        'exp': session_expires
    }
    token = jwt.encode(token_data, Config.SECRET_KEY, algorithm='HS256')
    
    return {
        'token': token,
        'expires_at': session_expires
    }
```

#### F. GET STAFF PASSWORD (with session verification)
**Endpoint:** `GET /api/staff/:accountId/password`
**Auth Required:** Yes (must have valid verification token)
**Headers:**
```
X-Password-Verification-Token: <token from verify-password endpoint>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "password": "base64_decoded_password (original plain text)",
    "username": "string"
  }
}
```

**Backend Implementation:**
```python
def get_staff_password(self, staff_account_id, parent_account_id, verification_token):
    """
    Get staff password only if verification token is valid
    """
    # 1. Verify the token
    try:
        import jwt
        decoded = jwt.decode(verification_token, Config.SECRET_KEY, algorithms=['HS256'])
        if decoded.get('admin_account_id') != parent_account_id:
            raise ValueError('Token invalid for this admin')
    except jwt.ExpiredSignatureError:
        raise ValueError('Verification session expired')
    except jwt.InvalidTokenError:
        raise ValueError('Invalid verification token')
    
    # 2. Get staff account
    staff = self.collection.find_one({
        'accountId': staff_account_id,
        'parent_account_id': parent_account_id,
        'role': 'staff'
    })
    if not staff:
        raise ValueError('Staff account not found')
    
    # 3. Decode password from base64
    import base64
    decoded_password = base64.b64decode(staff['password']).decode('utf-8')
    
    return {
        'password': decoded_password,
        'username': staff['username']
    }
```

---

## 3. Frontend Implementation

### 3.1 Update Accounts Page Structure
**File:** `/home/nam/work/test-preny/client/app/dashboard/accounts/page.js`

**Changes:**
1. Keep admin user display as is (current table row)
2. Add staff accounts table below with columns:
   - Avatar
   - Name
   - Username
   - Password (masked with eye icon)
   - Phone Number
   - Edit (icon button)
   - Delete (icon button)

**UI Structure:**
```javascript
return (
  <div style={{ padding: '24px' }}>
    {/* Admin Account Section */}
    <div>
      <h2>Tài khoản chủ sở hữu</h2>
      <Table columns={adminColumns} dataSource={[adminUser]} />
    </div>

    {/* Staff Accounts Section */}
    <div style={{ marginTop: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Tài khoản nhân viên ({staffCount})</h2>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Thêm nhân viên
        </Button>
      </div>
      <Table columns={staffColumns} dataSource={staffAccounts} />
    </div>

    {/* Modals */}
    <CreateStaffModal 
      open={isCreateModalOpen} 
      onClose={...} 
      onSuccess={...}
    />
    <EditStaffModal 
      open={isEditModalOpen} 
      staffData={selectedStaff} 
      onClose={...} 
      onSuccess={...}
    />
    <ConfirmModal 
      open={isDeleteModalOpen} 
      title="Xóa nhân viên" 
      description={...}
      onConfirm={handleDeleteStaff}
    />
    <VerifyPasswordModal 
      open={isVerifyModalOpen}
      onSuccess={handlePasswordVerified}
      onCancel={() => setIsVerifyModalOpen(false)}
    />
  </div>
);
```

### 3.2 Staff Columns Definition

```javascript
const staffColumns = [
  {
    title: 'Tên',
    dataIndex: 'name',
    key: 'name',
    render: (text, record) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Avatar
          size={40}
          src={record.avatar_url ? getAvatarUrl(record.avatar_url) : null}
          icon={!record.avatar_url && <UserOutlined />}
          style={{ background: '#d9d9d9' }}
        />
        <div>
          <span style={{ fontWeight: '500', fontSize: '14px' }}>{text}</span>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>
            {record.username}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Tên đăng nhập',
    dataIndex: 'username',
    key: 'username',
    render: (text) => <span style={{ color: '#666' }}>{text}</span>,
  },
  {
    title: 'Mật khẩu',
    dataIndex: 'password',
    key: 'password',
    render: (password, record) => (
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
    key: 'phone_number',
    render: (text) => text || 'Chưa cập nhật',
  },
  {
    title: 'Hành động',
    key: 'actions',
    width: 120,
    render: (text, record) => (
      <div style={{ display: 'flex', gap: '12px' }}>
        <EditOutlined
          style={{ cursor: 'pointer', color: '#1890ff' }}
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

### 3.3 Component Updates

#### A. CreateStaffModal - No changes needed
**File:** `/home/nam/work/test-preny/client/lib/components/popup/CreateStaffModal.js`
- Already has correct fields: username, name, phone, password
- Update onSubmit to call API `/api/staff` POST

#### B. New: EditStaffModal
**File:** `/home/nam/work/test-preny/client/lib/components/popup/EditStaffModal.js`

```javascript
'use client';

import { Modal, Form, Input, Button, App } from 'antd';
import { UserOutlined, PhoneOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';

export default function EditStaffModal({ open, staffData, onClose, onSuccess }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (staffData && open) {
      form.setFieldsValue({
        name: staffData.name,
        username: staffData.username,
        phone_number: staffData.phone_number,
        new_password: '', // Empty for new password
      });
    }
  }, [staffData, open]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Only include fields that changed or have new password
      const updates = {};
      if (values.name !== staffData.name) updates.name = values.name;
      if (values.username !== staffData.username) updates.username = values.username;
      if (values.phone_number !== staffData.phone_number) updates.phone_number = values.phone_number;
      if (values.new_password) updates.new_password = values.new_password;

      if (Object.keys(updates).length === 0) {
        message.info('Không có thay đổi');
        return;
      }

      setLoading(true);
      
      const accountId = localStorage.getItem('accountId');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/staff/${staffData.accountId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Account-Id': accountId,
          },
          body: JSON.stringify(updates),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      message.success('Cập nhật thành công');
      form.resetFields();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Update error:', error);
      message.error(error.message || 'Cập nhật thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      footer={null}
      width={500}
      title={<h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Chỉnh sửa thông tin nhân viên</h2>}
    >
      <Form form={form} layout="vertical" style={{ marginTop: '24px' }} requiredMark={false}>
        <Form.Item
          label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Tên đăng nhập</span>}
          name="username"
          rules={[
            { required: true, message: 'Vui lòng nhập tên đăng nhập!' },
            { min: 3, message: 'Tên đăng nhập phải có ít nhất 3 ký tự!' },
          ]}
        >
          <Input prefix={<UserOutlined />} placeholder="Nhập tên đăng nhập" size="large" />
        </Form.Item>

        <Form.Item
          label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Họ và tên</span>}
          name="name"
          rules={[{ required: true, message: 'Vui lòng nhập họ và tên!' }]}
        >
          <Input prefix={<IdcardOutlined />} placeholder="Nhập họ và tên" size="large" />
        </Form.Item>

        <Form.Item
          label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Số điện thoại</span>}
          name="phone_number"
          rules={[{ pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại không hợp lệ!' }]}
        >
          <Input prefix={<PhoneOutlined />} placeholder="Nhập số điện thoại" size="large" />
        </Form.Item>

        <Form.Item
          label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Mật khẩu mới (không bắt buộc)</span>}
          name="new_password"
          rules={[
            { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự!' },
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Để trống nếu không thay đổi" size="large" />
        </Form.Item>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <Button onClick={handleCancel}>Hủy</Button>
          <Button type="primary" loading={loading} onClick={handleSubmit}>
            Lưu thay đổi
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
```

#### C. New: VerifyPasswordModal (for viewing staff passwords)
**File:** `/home/nam/work/test-preny/client/lib/components/popup/VerifyPasswordModal.js`

```javascript
'use client';

import { Modal, Form, Input, Button, App } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useState } from 'react';

export default function VerifyPasswordModal({ open, onSuccess, onCancel }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const accountId = localStorage.getItem('accountId');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/staff/verify-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Account-Id': accountId,
          },
          body: JSON.stringify({ password: values.password }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      message.success('Xác minh thành công');
      form.resetFields();
      onSuccess?.(result.data.token, result.data.expires_at);
      onCancel?.();
    } catch (error) {
      console.error('Verification error:', error);
      message.error(error.message || 'Xác minh thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={400}
      title={<h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Xác minh mật khẩu</h2>}
    >
      <Form form={form} layout="vertical" style={{ marginTop: '20px' }} requiredMark={false}>
        <p style={{ color: '#666', marginBottom: '16px' }}>
          Nhập mật khẩu của bạn để xem mật khẩu nhân viên
        </p>
        
        <Form.Item
          label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Mật khẩu</span>}
          name="password"
          rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
        >
          <Input.Password 
            prefix={<LockOutlined />} 
            placeholder="Nhập mật khẩu" 
            size="large"
            autoFocus
          />
        </Form.Item>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <Button onClick={onCancel}>Hủy</Button>
          <Button type="primary" loading={loading} onClick={handleSubmit}>
            Xác minh
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
```

### 3.4 API Functions
**File:** `/home/nam/work/test-preny/client/lib/api.js`

Add these functions:

```javascript
// Staff Management APIs

export async function createStaff(accountId, staffData) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify(staffData),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Create staff failed');
    return result;
  } catch (error) {
    console.error('API Error [POST /staff]:', error);
    throw error;
  }
}

export async function listStaffAccounts(accountId, skip = 0, limit = 50, search = null) {
  try {
    const url = new URL(`${API_BASE_URL}/api/staff`);
    url.searchParams.append('skip', skip);
    url.searchParams.append('limit', limit);
    if (search) url.searchParams.append('search', search);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'List staff failed');
    return result;
  } catch (error) {
    console.error('API Error [GET /staff]:', error);
    throw error;
  }
}

export async function updateStaff(accountId, staffAccountId, updates) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/staff/${staffAccountId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify(updates),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Update staff failed');
    return result;
  } catch (error) {
    console.error('API Error [PUT /staff/:id]:', error);
    throw error;
  }
}

export async function deleteStaff(accountId, staffAccountId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/staff/${staffAccountId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Delete staff failed');
    return result;
  } catch (error) {
    console.error('API Error [DELETE /staff/:id]:', error);
    throw error;
  }
}

export async function verifyAdminPassword(accountId, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/staff/verify-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({ password }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Password verification failed');
    return result;
  } catch (error) {
    console.error('API Error [POST /staff/verify-password]:', error);
    throw error;
  }
}

export async function getStaffPassword(accountId, staffAccountId, verificationToken) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/staff/${staffAccountId}/password`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Account-Id': accountId,
          'X-Password-Verification-Token': verificationToken,
        },
      }
    );

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Get password failed');
    return result;
  } catch (error) {
    console.error('API Error [GET /staff/:id/password]:', error);
    throw error;
  }
}
```

---

## 4. Registration Flow Changes

**File:** `/home/nam/work/test-preny/server/routes/auth.py`

When a user registers via register endpoint:
- Set `role: 'admin'` (not staff)
- Set `email: <provided email>`
- Set `is_verified: False` (requires email verification)
- No `parent_account_id` (it's null for admin accounts)

```python
# In create_user or registration handler:
user_data = {
    'email': email,
    'password': hashed_password,
    'name': name,
    'username': email.split('@')[0],  # Can be changed later
    'phone_number': phone,
    'avatar_url': None,
    'role': 'admin',  # NEW
    'parent_account_id': None,  # NEW
    'is_verified': False,
    'verification_token': verification_token,
    'created_at': datetime.utcnow(),
    'updated_at': datetime.utcnow(),
}
```

---

## 5. Login Flow Changes

**File:** `/home/nam/work/test-preny/server/routes/auth.py`

Support login with either `email` or `username`:

```python
def login():
    email_or_username = data.get('email') or data.get('username')
    password = data.get('password')
    
    # Try email first
    user = user_model.find_by_email(email_or_username)
    
    # If not found, try username
    if not user:
        user = user_model.find_by_username(email_or_username)
    
    if not user:
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    # Verify password
    if not user_model.verify_password(user, password):
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    # For staff accounts, skip email verification requirement
    if user.get('role') == 'staff' or user.get('is_verified'):
        # Allow login
    else:
        return jsonify({
            'success': False,
            'code': 'UNVERIFIED',
            'email': user.get('email')
        }), 403
    
    # ... rest of login logic
```

---

## 6. Database Migration Strategy

### Option 1: Add role field with default value
```python
# Migration script
db.users.update_many(
    { 'role': { '$exists': False } },
    { '$set': { 'role': 'admin' } }
)
```

### Option 2: Update index (remove email unique, add conditional)
```python
# Python code in app startup or migration
collection = db.users

# Drop existing email index if unique
try:
    collection.drop_index('email_1')
except:
    pass

# Create new index allowing null values
collection.create_index('email', sparse=True, unique=True)

# Add username index (unique per parent_account_id handled in code)
collection.create_index([('parent_account_id', 1), ('username', 1)])
```

---

## 7. Implementation Checklist

### Backend (Python/Flask)
- [ ] Add `role`, `username`, `parent_account_id` fields to UserModel
- [ ] Update `_create_indexes()` in UserModel
- [ ] Add `create_staff()` method to UserModel
- [ ] Add `list_staff_accounts()` method to UserModel
- [ ] Add `update_staff()` method to UserModel
- [ ] Add `delete_staff()` method to UserModel
- [ ] Add `verify_admin_password()` method to UserModel
- [ ] Add `get_staff_password()` method to UserModel
- [ ] Add `find_by_username()` method to UserModel
- [ ] Create `/api/staff` routes in user.py (POST, GET, PUT, DELETE)
- [ ] Create `/api/staff/verify-password` route (POST)
- [ ] Create `/api/staff/:id/password` route (GET)
- [ ] Update login endpoint to support username login
- [ ] Update registration to set `role='admin'`
- [ ] Add JWT dependency for password verification tokens

### Frontend (React/Next.js)
- [ ] Update `CreateStaffModal.js` to call API
- [ ] Create `EditStaffModal.js` component
- [ ] Create `VerifyPasswordModal.js` component
- [ ] Update `accounts/page.js` with staff table
- [ ] Add API functions in `api.js`
- [ ] Add password viewing logic with session timeout (5 min)
- [ ] Add delete confirmation using ConfirmModal
- [ ] Add search/filter for staff accounts
- [ ] Test all CRUD operations

### Database
- [ ] Update indexes
- [ ] Add migration for role field
- [ ] Test duplicate key handling with null emails

---

## 8. Security Considerations

1. **Password Storage:**
   - Passwords are hashed with bcrypt (existing implementation)
   - For password viewing: decode base64, display briefly, then clear

2. **Session Management:**
   - 5-minute verification window using JWT tokens
   - Token signed with SECRET_KEY
   - Verify token expiry on each password view request

3. **Authorization:**
   - Only admin accounts can create/manage staff
   - Verify `parent_account_id` matches authenticated user on all staff operations

4. **Data Isolation:**
   - Each admin account has separate staff list
   - Staff cannot create other staff accounts

5. **Email Handling:**
   - Staff accounts have `email: null`
   - Null email values don't conflict due to sparse index

---

## 9. Testing Plan

### Manual Testing
1. Register as admin → verify role is 'admin'
2. Create staff account → verify fields saved correctly
3. List staff → verify only owned staff appear
4. Edit staff → verify only changed fields updated
5. Delete staff → verify with confirmation modal
6. View password → verify requires admin password, 5 min timeout
7. Login as staff → verify username/password auth works
8. Logout staff → verify session cleared

### API Testing
- POST /api/staff (create)
- GET /api/staff (list with pagination/search)
- PUT /api/staff/:id (update)
- DELETE /api/staff/:id (delete)
- POST /api/staff/verify-password (verify)
- GET /api/staff/:id/password (view)

---

## 10. Deployment Steps

1. Update Python requirements (JWT if not already present)
2. Deploy backend with new routes and models
3. Run database migration for role field
4. Run index updates
5. Deploy frontend with new components
6. Test all staff management features in staging
7. Roll out to production

---

## Notes for Developer

- Use **X-Account-Id** header for authorization instead of session cookies where possible
- All staff operations should validate `parent_account_id` matches authenticated user
- 5-minute timer for password viewing: consider storing in Redis for production
- Base64 decoding in frontend is NOT secure for sensitive data - do it server-side only
- Password visibility modal should clear data on close
- Consider adding audit logging for staff account changes

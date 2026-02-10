'use client';

import { Modal, Form, Input, Button, App, Spin } from 'antd';
import { UserOutlined, PhoneOutlined, LockOutlined, IdcardOutlined, CheckOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { updateStaff, searchStaff } from '@/lib/api';

export default function EditStaffModal({ open, onClose, staff, onSuccess }) {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [zaloUserId, setZaloUserId] = useState('');

    useEffect(() => {
        if (staff && open) {
            form.setFieldsValue({
                username: staff.username,
                name: staff.name,
                phone: staff.phoneNumber,
                avatar: staff.avatar,
            });

            // 🔥 hydrate selected user if already linked
            if (staff.zaloUserId) {
                setSelectedUser({
                    platform_specific_id: staff.zaloUserId,
                    name: staff.name,
                    phone: staff.phoneNumber,
                    avatar: staff.avatar,
                });
                setZaloUserId(staff.zaloUserId);
                setShowResults(true);
                setSearchResults([
                    {
                        platform_specific_id: staff.zaloUserId,
                        name: staff.name,
                        phone: staff.phoneNumber,
                        avatar: staff.avatar,
                    },
                ]);
            }
        } else if (!open) {
            form.resetFields();
            setSelectedUser(null);
            setZaloUserId('');
            setSearchResults([]);
            setShowResults(false);
        }
    }, [staff, open, form]);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            const updates = {};
            if (values.username !== staff.username) {
                updates.username = values.username;
            }
            if (values.name !== staff.name) {
                updates.name = values.name;
            }
            if (values.phone !== staff.phoneNumber) {
                updates.phoneNumber = values.phone;
            }
            if (values.newPassword) {
                updates.newPassword = values.newPassword;
            }

            if (values.avatar !== staff.avatar) {
                updates.avatar = values.avatar;
            }

            updates.zaloUserId = zaloUserId

            const result = await updateStaff(staff.accountId, updates);

            if (result.success) {
                message.success(result.message || 'Cập nhật thành viên thành công');
                form.resetFields();
                onClose();
                if (onSuccess) {
                    onSuccess(result.data);
                }
            } else {
                message.error(result.message || 'Cập nhật thất bại');
            }
        } catch (error) {
            if (error.errorFields) {
                console.log('Validation failed:', error);
            } else {
                message.error(error.message || 'Lỗi khi cập nhật thành viên');
                console.error('Update staff error:', error);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        form.resetFields();
        setSelectedUser(null);
        setSearchKeyword('');
        setSearchResults([]);
        setShowResults(false);
        onClose();
    };

    const handleSelectUser = (user) => {
        setSelectedUser(user);
        setZaloUserId(user.platform_specific_id)

        form.setFieldsValue({
            name: user.name || '',
            phone: user.phone || '',
            avatar: user.avatar || '',
        });
    };

    const handleSearchUser = async () => {
        if (!searchKeyword.trim()) return;

        try {
            setSearchLoading(true);
            const res = await searchStaff(searchKeyword.trim());

            if (res.success) {
                setSearchResults(res.data || []);
                setShowResults(true);
            }
        } catch (e) {
            message.error('Không thể tìm kiếm người dùng');
        } finally {
            setSearchLoading(false);
        }
    };

    useEffect(() => {
        if (searchKeyword) {
            setSelectedUser(null);
        }
    }, [searchKeyword]);

    return (
        <Modal
            open={open}
            onCancel={handleCancel}
            footer={null}
            width={500}
            forceRender
            destroyOnHidden
            title={
                <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
                    Chỉnh sửa thành viên
                </h2>
            }
        >
            <Spin spinning={loading}>
                <Form
                    form={form}
                    onFinish={handleSubmit}
                    layout="vertical"
                    style={{ marginTop: '24px' }}
                    requiredMark={false}
                >
                    {/* Search existing user */}
                    <div style={{ marginBottom: 16 }}>
                        <Input.Search
                            placeholder="Tìm người dùng theo tên hoặc SĐT"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            onSearch={handleSearchUser}
                            loading={searchLoading}
                            enterButton
                            size="large"
                        />
                        {showResults && searchResults.length > 0 && (
                            <div
                                style={{
                                    marginTop: 8,
                                    border: '1px solid #f0f0f0',
                                    borderRadius: 8,
                                    maxHeight: 240,
                                    overflowY: 'auto',
                                    background: '#fff',
                                }}
                            >
                                {searchResults.map(user => {
                                    const isSelected = selectedUser?.platform_specific_id === user.platform_specific_id;

                                    return (
                                        <div
                                            key={user.platform_specific_id}
                                            onClick={() => handleSelectUser(user)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '10px 12px',
                                                cursor: 'pointer',
                                                gap: 12,
                                                background: isSelected ? '#e6f4ff' : '#fff',
                                            }}
                                            onMouseEnter={e => {
                                                if (!isSelected) e.currentTarget.style.background = '#fafafa';
                                            }}
                                            onMouseLeave={e => {
                                                if (!isSelected) e.currentTarget.style.background = '#fff';
                                            }}
                                        >
                                            {/* Avatar */}
                                            <img
                                                src={user.avatar || '/avatar-default.png'}
                                                alt={user.name}
                                                style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: '50%',
                                                    objectFit: 'cover',
                                                }}
                                            />

                                            {/* Info */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 500 }}>{user.name}</div>
                                                {user.phone && (
                                                    <div style={{ fontSize: 12, color: '#888' }}>
                                                        {user.phone}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Tick */}
                                            {isSelected && (
                                                <CheckOutlined
                                                    style={{ color: '#1677ff', fontSize: 16 }}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {/* Username */}
                    <Form.Item
                        label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Tên đăng nhập</span>}
                        name="username"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên đăng nhập!' },
                            { min: 3, message: 'Tên đăng nhập phải có ít nhất 3 ký tự!' },
                        ]}
                    >
                        <Input
                            prefix={<UserOutlined style={{ color: '#999' }} />}
                            placeholder="Nhập tên đăng nhập"
                            size="large"
                            disabled={loading}
                        />
                    </Form.Item>

                    <Form.Item name="avatar" hidden>
                        <Input />
                    </Form.Item>

                    {/* Name */}
                    <Form.Item
                        label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Họ và tên</span>}
                        name="name"
                        rules={[
                            { required: true, message: 'Vui lòng nhập họ và tên!' },
                        ]}
                    >
                        <Input
                            prefix={<IdcardOutlined style={{ color: '#999' }} />}
                            placeholder="Nhập họ và tên"
                            size="large"
                            disabled={loading}
                        />
                    </Form.Item>

                    {/* Phone */}
                    <Form.Item
                        label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Số điện thoại</span>}
                        name="phone"
                        rules={[
                            { pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại không hợp lệ!' },
                        ]}
                    >
                        <Input
                            prefix={<PhoneOutlined style={{ color: '#999' }} />}
                            placeholder="Nhập số điện thoại"
                            size="large"
                            disabled={loading}
                        />
                    </Form.Item>

                    {/* New Password */}
                    <Form.Item
                        label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Mật khẩu mới (để trống nếu không đổi)</span>}
                        name="newPassword"
                        rules={[
                            { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự!' },
                        ]}
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: '#999' }} />}
                            placeholder="Nhập mật khẩu mới"
                            size="large"
                            disabled={loading}
                        />
                    </Form.Item>

                    {/* Footer Buttons */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '12px',
                            marginTop: '32px',
                        }}
                    >
                        <Button size="large" onClick={handleCancel} disabled={loading}>
                            Hủy
                        </Button>
                        <Button
                            type="primary"
                            size="large"
                            onClick={handleSubmit}
                            loading={loading}
                            style={{
                                background: '#6c3fb5',
                                borderColor: '#6c3fb5',
                            }}
                        >
                            Cập nhật
                        </Button>
                    </div>
                </Form>
            </Spin>
        </Modal>
    );
}

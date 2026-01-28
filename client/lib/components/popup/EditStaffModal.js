'use client';

import { Modal, Form, Input, Button, App, Spin } from 'antd';
import { UserOutlined, PhoneOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { updateStaff } from '@/lib/api';

export default function EditStaffModal({ open, onClose, staff, onSuccess }) {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (staff && open) {
            form.setFieldsValue({
                username: staff.username,
                name: staff.name,
                phone: staff.phoneNumber,
            });
        } else if (!open) {
            form.resetFields();
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
        onClose();
    };

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

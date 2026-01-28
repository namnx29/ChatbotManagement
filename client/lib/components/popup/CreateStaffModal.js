'use client';

import { Modal, Form, Input, Button, App } from 'antd';
import { UserOutlined, PhoneOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { createStaff } from '@/lib/api';

export default function AddMemberModal({ open, onClose, onSuccess }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const result = await createStaff({
        username: values.username,
        name: values.name,
        phoneNumber: values.phone,
        password: values.password,
      });

      if (result.success) {
        message.success(result.message || 'Thêm thành viên thành công');
        form.resetFields();
        onClose();
        // Notify parent to refresh staff list
        if (onSuccess) {
          onSuccess(result.data);
        }
      } else {
        message.error(result.message || 'Thêm thành viên thất bại');
      }
    } catch (error) {
      if (error.errorFields) {
        // Form validation error
        console.log('Validation failed:', error);
      } else {
        // API error
        message.error(error.message || 'Lỗi khi thêm thành viên');
        console.error('Create staff error:', error);
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
      destroyOnHidden
      forceRender
      footer={null}
      width={500}
      title={
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
          Thêm thành viên
        </h2>
      }
      >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
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

        {/* Password */}
        <Form.Item
          label={<span style={{ fontSize: '14px', fontWeight: '500' }}>Mật khẩu</span>}
          name="password"
          rules={[
            { required: true, message: 'Vui lòng nhập mật khẩu!' },
            { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự!' },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#999' }} />}
            placeholder="Nhập mật khẩu"
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
          >
            Thêm thành viên
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

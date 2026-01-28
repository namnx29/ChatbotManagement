'use client';

import { Modal, Form, Input, Button } from 'antd';
import { UserOutlined, PhoneOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';

export default function AddMemberModal({ open, onClose }) {
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      console.log('Form values:', values);
      // Handle form submission here
      form.resetFields();
      onClose();
    }).catch((errorInfo) => {
      console.log('Validation failed:', errorInfo);
    });
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
      title={
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
          Thêm thành viên
        </h2>
      }
    >
      <Form
        form={form}
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
          <Button size="large" onClick={handleCancel}>
            Hủy
          </Button>
          <Button
            type="primary"
            size="large"
            onClick={handleSubmit}
            style={{
              background: '#6c3fb5',
              borderColor: '#6c3fb5',
            }}
          >
            Thêm thành viên
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

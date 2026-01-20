"use client";

import { Modal, Form, Input, Button, Avatar, Typography } from "antd";

const { Text } = Typography;

export default function CustomerNameChangeModal({
  visible,
  onClose,
  conversation,
}) {
  return (
    <Modal
      title={<div style={{ textAlign: 'left', fontWeight: 600 }}>Đặt tên gợi nhớ</div>}
      footer={null}
      centered
      width={450}
      open={visible}
      onCancel={onClose}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '10px 0'
      }}>
        <div style={{
          border: '1px solid #555',
          borderRadius: '50%',
          marginBottom: '12px'
        }}>
          <Avatar
            size={70}
            src={conversation.avatar}
          >
            {conversation.name[0]}
					</Avatar>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '16px', marginBottom: '2px' }}>
            Hãy đặt cho <Text strong>{conversation.name}</Text> một cái tên dễ nhớ.
          </div>
          <Text type="secondary" style={{ fontSize: '14px' }}>
            Lưu ý: Tên gợi nhớ sẽ chỉ hiển thị riêng với bạn.
          </Text>
        </div>

        <Form style={{ width: '100%' }} layout="vertical">
          <Form.Item name="nickname">
            <Input
              placeholder="Nhập tên gợi nhớ"
              size="large"
              style={{ borderRadius: '8px' }}
            />
          </Form.Item>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '12px'
          }}>
            <Button size="large" style={{ minWidth: '80px', background: '#333', color: '#fff', border: 'none' }} onClick={onClose}>
              Hủy
            </Button>
            <Button type="primary" size="large" style={{ minWidth: '120px', background: '#0062ff' }}>
              Xác nhận
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
}

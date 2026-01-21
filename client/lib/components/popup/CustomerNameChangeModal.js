"use client";

import { Modal, Form, Input, Button, Avatar, Typography, App } from "antd";
import { useState, useEffect } from "react";
import { updateConversationNickname } from "@/lib/api";

const { Text } = Typography;

export default function CustomerNameChangeModal({
  visible,
  onClose,
  conversation,
  onSuccess
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        nickname: conversation.name || ''
      });
    }
  }, [visible, conversation, form]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();

      if (values.nickname.trim() === '') {
        onClose();
        return;
      }
      const accountId = localStorage.getItem('accountId');

      if (!accountId) throw new Error('No accountId available');

      const result = await updateConversationNickname(
        accountId,
        conversation.oa_id,
        conversation.customer_id,
        values.nickname
      );
      if (result.success) {
        message.success("Đã cập nhật tên gợi nhớ thành công!");
        if (onSuccess) {
          onSuccess({...conversation, name: values.nickname});
        }
        onClose();
      }
    } catch (error) {
      message.error(error.message || "Có lỗi xảy ra khi cập nhật tên.");
    } finally {
      setLoading(false);
    }
  };

  if (!conversation) return null;

  return (
    <Modal
      title={<div style={{ textAlign: 'left', fontWeight: 600 }}>Đặt tên gợi nhớ</div>}
      footer={null}
      centered
      width={450}
      open={visible}
      onCancel={onClose}
      destroyOnHidden
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
            {conversation.name ? conversation.name[0].toUpperCase() : "U"}
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

        <Form style={{ width: '100%' }} layout="vertical" form={form} onFinish={handleSubmit}>
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
            <Button size="large" style={{ minWidth: '80px', background: '#333', color: '#fff', border: 'none' }} onClick={onClose} disabled={loading}>
              Hủy
            </Button>
            <Button type="primary" size="large" style={{ minWidth: '120px', background: '#0062ff' }} onClick={ handleSubmit } loading={ loading }>
              Xác nhận
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
}

'use client';

import { Drawer, Form, Input, Select, Button } from 'antd';
import { useEffect } from 'react';

export default function DataTrainingDrawer({ open, initialValues = null, onClose, onSubmit, loading = false }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open && initialValues) {
      form.setFieldsValue({
        status: initialValues.status,
        question: initialValues.question,
        answer: initialValues.answer,
      });
    } else if (open) {
      form.resetFields();
      form.setFieldsValue({ status: 'active' });
    }
  }, [open, initialValues, form]);

  const handleFinish = (values) => {
    if (onSubmit) {
      onSubmit(values);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={640}
      title={initialValues ? 'Chỉnh sửa dữ liệu huấn luyện' : 'Thêm dữ liệu huấn luyện'}
      footer={null}
      destroyOnClose
      placement="right"
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
      >
        <Form.Item
          label="Trạng thái"
          name="status"
          rules={[{ required: true, message: 'Vui lòng chọn trạng thái' }]}
        >
          <Select options={[{ value: 'active', label: 'Hoạt động' }, { value: 'lock', label: 'Khóa' }]} />
        </Form.Item>

        <Form.Item
          label="Câu hỏi"
          name="question"
          rules={[{ required: true, message: 'Vui lòng nhập câu hỏi' }]}
        >
          <Input.TextArea rows={4} placeholder="Nhập câu hỏi" />
        </Form.Item>

        <Form.Item
          label="Câu trả lời"
          name="answer"
          rules={[{ required: true, message: 'Vui lòng nhập câu trả lời' }]}
        >
          <Input.TextArea rows={6} placeholder="Nhập câu trả lời" />
        </Form.Item>

        <Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={onClose}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={loading} style={{ background: '#6c3fb5', borderColor: '#6c3fb5' }}>
              {initialValues ? 'Lưu' : 'Thêm'}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Drawer>
  );
}

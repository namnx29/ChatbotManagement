'use client';

import { Modal, Button } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

export default function ConfirmModal({ open, title, description, onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel', loading = false }) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      centered
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <ExclamationCircleOutlined style={{ fontSize: 28, color: '#faad14' }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {description && <p style={{ marginTop: 8 }}>{description}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button onClick={onCancel}>{cancelText}</Button>
            <Button type="primary" onClick={onConfirm} loading={loading} style={{ background: '#ff4d4f', borderColor: '#ff4d4f' }}>
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

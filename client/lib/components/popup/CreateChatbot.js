'use client';

import { Modal, Input, Select, Avatar, Button, Upload, message } from 'antd';
import { CloseOutlined, PictureOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { createChatbot, uploadChatbotAvatar } from '@/lib/api';

export default function CreateChatbotModal({ open, onClose, onCreated }) {
  const [botName, setBotName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [purpose, setPurpose] = useState('message');
  const [industry, setIndustry] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setBotName('');
      setGreeting('');
      setSelectedAvatar(null);
      setUploadedFile(null);
      setUploadedPreview(null);
      setPurpose('message');
      setIndustry(null);
    }
  }, [open]);

  const predefinedAvatars = [
    '/avatar1.png',
    '/avatar2.png',
    '/avatar3.png',
  ];

  const handleSubmit = () => {
    (async () => {
      try {
        if (!botName || botName.trim().length < 2) {
          message.error('Tên chatbot phải tối thiểu 2 ký tự');
          return;
        }

        if (!greeting || greeting.trim().length < 2) {
          message.error('Câu chào phải tối thiểu 2 ký tự');
          return;
        }

        setLoading(true);

        const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;

        let avatar_url = null;

        if (uploadedFile) {
          // upload to server
          const res = await uploadChatbotAvatar(accountId, uploadedFile);
          avatar_url = res?.data?.avatar_url || null;
        } else if (selectedAvatar && selectedAvatar.type === 'predefined') {
          avatar_url = selectedAvatar.src;
        }

        const payload = {
          name: botName,
          purpose: purpose,
          greeting: greeting,
          fields: [],
          avatar_url,
        };

        const createRes = await createChatbot(accountId, payload);

        message.success('Tạo chatbot thành công');
        setLoading(false);
        if (onCreated) onCreated(createRes.data);
        onClose();
      } catch (err) {
        console.error(err);
        setLoading(false);
        message.error(err.message || 'Tạo chatbot thất bại');
      }
    })();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      centered
      closeIcon={<CloseOutlined />}
      title={
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
          Tạo chatbot
        </h2>
      }
    >
      <div style={{ display: 'flex', gap: '24px', marginTop: '24px', overflow: "auto", maxHeight: "70vh" }}>
        {/* Left Column - Bot Details */}
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
            Chi tiết bot
          </h3>

          {/* Bot Name */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Tên
            </label>
            <Input
              placeholder="Nhập tên bot"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              maxLength={50}
              showCount
              size="large"
            />
          </div>

          {/* Avatar Selection */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              {/* Upload Button */}
              <Upload
                showUploadList={false}
                beforeUpload={(file) => {
                  // accept single file and preview
                  setUploadedFile(file);
                  try {
                    const url = URL.createObjectURL(file);
                    setUploadedPreview(url);
                    setSelectedAvatar({ type: 'uploaded', src: url });
                  } catch (e) {
                    setUploadedPreview(null);
                  }
                  return false; // prevent default upload
                }}
                accept="image/*"
              >
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    border: '2px dashed #d9d9d9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    background: '#fafafa',
                  }}
                >
                  <PictureOutlined style={{ fontSize: '24px', color: '#999' }} />
                </div>
              </Upload>

              {/* Predefined Avatars */}
              {predefinedAvatars.map((avatar, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setUploadedFile(null);
                    setUploadedPreview(null);
                    setSelectedAvatar({ type: 'predefined', src: avatar });
                  }}
                  style={{
                    cursor: 'pointer',
                    border:
                      selectedAvatar && selectedAvatar.type === 'predefined' && selectedAvatar.src === avatar
                        ? '3px solid #6c3fb5'
                        : '3px solid transparent',
                    borderRadius: '50%',
                    transition: 'all 0.3s',
                  }}
                >
                  <Avatar
                    size={54}
                    src={avatar}
                    style={{
                      display: 'block',
                    }}
                  />
                </div>
              ))}

              {/* Uploaded preview if present */}
              {uploadedPreview && (
                <div
                  style={{
                    cursor: 'pointer',
                    border: selectedAvatar && selectedAvatar.type === 'uploaded' ? '3px solid #6c3fb5' : '3px solid transparent',
                    borderRadius: '50%',
                    transition: 'all 0.3s',
                    display: 'inline-block',
                  }}
                  onClick={() => setSelectedAvatar({ type: 'uploaded', src: uploadedPreview })}
                >
                  <Avatar size={54} src={uploadedPreview} />
                </div>
              )}
            </div>
          </div>

          {/* Purpose */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Mục đích sử dụng
            </label>
            <Select
              value={purpose}
              onChange={setPurpose}
              placeholder="Chọn mục đích sử dụng"
              size="large"
              style={{ width: '100%' }}
              options={[
                { value: 'message', label: 'Trả lời tin nhắn' },
                { value: 'comment', label: 'Trả lời bình luận' },
              ]}
            />
          </div>

          {/* Greeting Message */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Câu chào hỏi
            </label>
            <Input
              placeholder="👋 Hello! How can I help you today?"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              maxLength={200}
              showCount
              size="large"
            />
          </div>

          {/* Industry */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Danh sách ngành nghề
            </label>
            <Select
              placeholder="Lựa chọn ngành nghề"
              size="large"
              style={{ width: '100%' }}
              options={[
                { value: 'tech', label: 'Công nghệ' },
                { value: 'retail', label: 'Bán lẻ' },
                { value: 'education', label: 'Giáo dục' },
                { value: 'healthcare', label: 'Y tế' },
                { value: 'finance', label: 'Tài chính' },
                { value: 'other', label: 'Khác' },
              ]}
            />
          </div>
        </div>

        {/* Right Column - Template */}
        <div
          style={{
            flex: 1,
            background: '#f0f0ff',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3
            style={{
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '16px',
              color: '#6c3fb5',
            }}
          >
            Kịch bản mẫu
          </h3>
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '16px',
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#6c3fb5',
            }}
          >
            Test cung cấp kịch bản mẫu tối ưu cho từng ngành nghề, giúp bạn dễ
            dàng chốt sales với các câu hỏi phổ biến nhất. Bạn có thể sử dụng ngay
            bằng việc tích chọn kịch bản sẵn, tùy chỉnh hoặc tự tạo kịch bản riêng
            tại mục "Kịch bản chốt sales". Cảm ơn bạn!
          </div>
        </div>
      </div>

      {/* Footer Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          marginTop: '24px',
          paddingTop: '24px',
          borderTop: '1px solid #f0f0f0',
        }}
      >
        <Button size="large" onClick={onClose}>
          Thoát
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
          Tạo chatbot
        </Button>
      </div>
    </Modal>
  );
}


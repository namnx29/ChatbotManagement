import React, { useState } from 'react';
import { Modal, Input, Button, Steps } from 'antd';

const PhoneNumberModal = ({ open, onClose }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: <span>Nhập số điện thoại</span>,
    },
    {
      title: <span>Xác nhận OTP</span>,
    },
    {
      title: <span>Hoàn thành</span>,
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      centered
      title="Chỉnh sửa số điện thoại"
    >
      <div>
        <Steps
          current={currentStep}
          items={steps}
          titlePlacement="vertical"
          style={{
            '--ant-color-primary': '#6C2BD9',
            '--ant-color-primary-hover': '#5a24b8',
          }}
        />
      </div>

      <div style={{ marginTop: "10px", marginBottom: "20px"}}>
        <label>
          Số điện thoại mới
        </label>
        <Input
          placeholder="Nhập số điện thoại của bạn"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          size="large"
          styles={{
            input: {
              padding: '5px 10px',
            }
          }}
          style={{
            borderColor: '#6C2BD9',
            marginTop: '10px'
          }}
        />
      </div>

      <Button
        type="primary"
        block
        size="large"
        style={{
          backgroundColor: '#6C2BD9',
          borderColor: '#6C2BD9',
        }}
      >
        Tiếp theo
      </Button>
    </Modal>
  );
};

export default PhoneNumberModal;
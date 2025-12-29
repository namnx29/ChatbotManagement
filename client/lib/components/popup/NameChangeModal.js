"use client";

import { Modal, Form, Input, Button, message } from "antd";
import { changeName } from "@/lib/api";
import { useState } from "react";

export default function NameChangeModal({
  visible,
  onClose,
  accountId,
}) {
  const [nameForm] = Form.useForm();
  const [nameLoading, setNameLoading] = useState(false);
  const [newName, setNewName] = useState("");

  const handleNameSubmit = async (values) => {
    setNameLoading(true);
    try {
      const result = await changeName(accountId, {
        newName: values.newName,
      });
      if (result.success) {
        // Update localStorage with new name
        localStorage.setItem('userName', values.newName);
        
        // Dispatch event to notify sidebar and other components
        window.dispatchEvent(
          new CustomEvent('nameUpdated', {
            detail: { userName: values.newName },
          })
        );
        
        message.success("Đổi tên hồ sơ thành công!");
        nameForm.resetFields();
        setNewName("");
        onClose();
      } else {
        message.error(result.message || "Đổi tên hồ sơ thất bại!");
      }
    } catch (error) {
      console.error("Name change error:", error);
      message.error("Đổi tên hồ sơ thất bại!");
    } finally {
      setNameLoading(false);
    }
  };

  return (
    <Modal
      title="Tên hồ sơ"
      open={visible}
      onCancel={onClose}
      footer={null}
      centered
    >
      <Form
        form={nameForm}
        layout="vertical"
        onFinish={handleNameSubmit}
        requiredMark={false}
      >
        <Form.Item
          label={
            <span style={{ fontSize: "14px" }}>
              Tên hồ sơ
            </span>
          }
          name="newName"
          rules={[
            { required: true, message: "Vui lòng nhập tên hồ sơ!" },
            { min: 2, message: "Tên phải có ít nhất 2 ký tự!" },
            { max: 50, message: "Tên không được vượt quá 50 ký tự!" }
          ]}
        >
          <Input
            placeholder="Nhập tên hồ sơ"
            size="large"
            style={{ fontSize: "14px" }}
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, marginTop: "24px" }}>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={nameLoading}
            style={{
              backgroundColor: "#6c3fb5",
              borderColor: "#6c3fb5",
            }}
          >
            Lưu thay đổi
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}

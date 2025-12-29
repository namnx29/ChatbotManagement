"use client";

import { Modal, Form, Input, Button, message } from "antd";
import { changePassword } from "@/lib/api";
import PasswordInputWithStrength from "@/lib/components/PasswordInputWithStrength";
import { useState } from "react";

export default function PasswordChangeModal({
  visible,
  onClose,
  accountId,
}) {
  const [passwordForm] = Form.useForm();
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const handlePasswordSubmit = async (values) => {
    if (values.newPassword !== values.confirmNewPassword) {
      message.error("Mật khẩu mới không khớp!");
      return;
    }

    setPasswordLoading(true);
    try {
      const result = await changePassword(accountId, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmNewPassword: values.confirmNewPassword,
      });

      if (result.success) {
        message.success("Đổi mật khẩu thành công!");
        passwordForm.resetFields();
        setNewPassword("");
        onClose();
      } else {
        message.error(result.message || "Đổi mật khẩu thất bại!");
      }
    } catch (error) {
      console.error("Password change error:", error);
      message.error("Đổi mật khẩu thất bại!");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Modal
      title="Đổi mật khẩu"
      open={visible}
      onCancel={onClose}
      footer={null}
      centered
    >
      <Form
        form={passwordForm}
        layout="vertical"
        onFinish={handlePasswordSubmit}
        requiredMark={false}
      >
        <Form.Item
          label={
            <span style={{ fontSize: "14px" }}>
              Mật khẩu hiện tại <span style={{ color: "red" }}>*</span>
            </span>
          }
          name="currentPassword"
          rules={[
            { required: true, message: "Vui lòng nhập mật khẩu hiện tại!" }
          ]}
        >
          <Input.Password
            placeholder="Nhập mật khẩu hiện tại"
            size="large"
            style={{ fontSize: "14px" }}
          />
        </Form.Item>

        <Form.Item
          label={
            <span style={{ fontSize: "14px" }}>
              Mật khẩu mới <span style={{ color: "red" }}>*</span>
            </span>
          }
          name="newPassword"
          rules={[
            { required: true, message: "Vui lòng nhập mật khẩu mới!" }
          ]}
        >
          <PasswordInputWithStrength
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Nhập mật khẩu mới"
            showValidation={true}
          />
        </Form.Item>

        <Form.Item
          label={
            <span style={{ fontSize: "14px" }}>
              Xác nhận mật khẩu mới <span style={{ color: "red" }}>*</span>
            </span>
          }
          name="confirmNewPassword"
          rules={[
            { required: true, message: "Vui lòng xác nhận mật khẩu mới!" }
          ]}
        >
          <Input.Password
            placeholder="Xác nhận mật khẩu mới"
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
            loading={passwordLoading}
            style={{
              backgroundColor: "#6c3fb5",
              borderColor: "#6c3fb5",
            }}
          >
            Đổi mật khẩu
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}

"use client";

import { Form, Input, Button, Typography, message } from "antd";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

export default function ForgotPasswordPage() {
  const [form] = Form.useForm();
  const [submittable, setSubmittable] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const shouldDisableButton = () => {
    const errors = form.getFieldsError();
    return errors.some(({ errors }) => errors.length);
  };

  useEffect(() => {
    form
      .validateFields({ validateOnly: true })
      .then(() => {
        setSubmittable(true);
      })
      .catch(() => {
        setSubmittable(false);
      });
  }, [form]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: values.email,
        }),
      });

      const result = await response.json();

      if (result.success) {
        message.success("If email exists, a password reset link has been sent");
        form.resetFields();
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        message.error(result.message || "Error");
      }
    } catch (error) {
      message.error("Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f5f5f5",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "500px",
          backgroundColor: "white",
          padding: "48px 40px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <Title
          level={2}
          style={{
            textAlign: "center",
            marginBottom: "40px",
            fontWeight: "bold",
          }}
        >
          Quên mật khẩu
        </Title>

        <div
          style={{
            textAlign: "center",
            fontSize: "13px",
            marginBottom: "16px",
          }}
        >
          <Text>
            Nhập email liên kết với tài khoản của bạn để nhận email hướng dẫn
            đặt lại mật khẩu của bạn.
          </Text>
        </div>

        <Form
          form={form}
          name="forgot-password"
          onFinish={onFinish}
          layout="vertical"
          requiredMark={false}
          onFieldsChange={() => {
            setSubmittable(!shouldDisableButton());
          }}
        >
          <Form.Item
            label={
              <span style={{ fontSize: "14px" }}>
                Email <span style={{ color: "red" }}>*</span>
              </span>
            }
            name="email"
            rules={[
              { required: true, message: "Vui lòng nhập email!" },
              { type: "email", message: "Email không hợp lệ!" },
            ]}
          >
            <Input
              placeholder="Nhập Email của bạn"
              size="large"
              maxLength={50}
              showCount
              style={{ fontSize: "14px" }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: "16px" }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              disabled={!submittable || loading}
              style={{
                backgroundColor: "#6c3fb5",
                borderColor: "#6c3fb5",
                height: "48px",
                fontSize: "16px",
                fontWeight: "500",
              }}
            >
              {loading ? "Đang gửi..." : "Tiếp tục"}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <Link href="/login" style={{ color: "#6c3fb5", fontSize: "15px", textDecoration: "none" }}>
            Quay lại Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}

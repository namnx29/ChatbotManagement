"use client";

import { Form, Input, Button, Typography, App } from "antd";
import { EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePublicPageGuard } from "@/lib/auth";
import { loginUser, resendVerificationEmail } from "@/lib/api";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const router = useRouter();

  const { isChecking } = usePublicPageGuard();

  if (isChecking) return null;

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const result = await loginUser(values.email, values.password);

      if (result.success) {
        message.success("Đăng nhập thành công");
        localStorage.setItem('userEmail', result.user.email);
        localStorage.setItem('accountId', result.user.accountId);
        localStorage.setItem('userName', result.user.name || result.user.email.split('@')[0]);

        router.push('/dashboard/profile');
      }
    } catch (error) {
      if (error.info?.code === 'UNVERIFIED') {
        const unverifiedEmail = error.info.email;

        message.info("Tài khoản chưa được xác thực, kiểm tra lại email để xác thực.");
        await resendVerificationEmail(unverifiedEmail);
        router.push(`/send-email?email=${encodeURIComponent(unverifiedEmail)}`);
        return;
      }

      message.error(error.message || 'Đăng nhập không thành công');
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
          Đăng nhập
        </Title>

        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          layout="vertical"
          requiredMark={false}
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

          <Form.Item
            label={
              <span style={{ fontSize: "14px" }}>
                Mật khẩu <span style={{ color: "red" }}>*</span>
              </span>
            }
            name="password"
            rules={[{ required: true, message: "Vui lòng nhập mật khẩu!" }]}
            extra={
              <div
                style={{
                  textAlign: "right",
                  width: "100%",
                  fontSize: "14px",
                  marginTop: "4px",
                }}
              >
                <Link href="/forgot-password" style={{ color: "#6c3fb5" }}>
                  Quên mật khẩu?
                </Link>
              </div>
            }
          >
            <Input.Password
              placeholder="Nhập mật khẩu của bạn"
              size="large"
              iconRender={(visible) =>
                visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
              }
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
              disabled={loading}
              style={{
                backgroundColor: "#6c3fb5",
                borderColor: "#6c3fb5",
                height: "48px",
                fontSize: "16px",
                fontWeight: "500",
              }}
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </Form.Item>

          <div style={{ textAlign: "center", fontSize: "14px" }}>
            <Text>Bạn chưa có tài khoản? </Text>
            <Link
              href="/register"
              style={{ color: "#6c3fb5", fontWeight: "500" }}
            >
              Đăng ký
            </Link>
          </div>
        </Form>
      </div>
    </div>
  );
}

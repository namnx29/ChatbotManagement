"use client";

import { Form, Input, Button, Typography, App } from "antd";
import {
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePublicPageGuard } from "@/lib/auth";
import { registerUser } from "@/lib/api";
import PasswordInputWithStrength from "@/lib/components/PasswordInputWithStrength";

const { Title, Text } = Typography;

export default function RegisterPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Redirect to dashboard if already authenticated
  const { isChecking } = usePublicPageGuard();

  if (isChecking) return null;

  const [isInputVisible, setIsInputVisible] = useState(false);

  const onFinish = async (values) => {
    // Validate password confirmation
    if (values.password !== values.confirmPassword) {
      message.error("Mật khẩu xác nhận không khớp!");
      return;
    }

    setLoading(true);
    try {
      const result = await registerUser(
        values.email,
        values.password,
        values.confirmPassword,
        values.fullName,
        values.phone
      );
      
      if (result.success) {
        message.success("Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.");
        // Store email for send-email page
        localStorage.setItem('registerEmail', values.email);
        // Redirect to send-email page
        router.push('/send-email');
      }
    } catch (error) {
      message.error(error.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  const toggleInputVisibility = () => {
    setIsInputVisible(!isInputVisible);
  };

  return (
    <div
      style={{
        height: "100vh", 
        overflowY: "auto", 
        display: "flex",
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
          margin: "auto",
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
          Đăng ký
        </Title>

        <Form
          form={form}
          name="register"
          onFinish={onFinish}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            label={
              <span style={{ fontSize: "14px" }}>
                Họ tên <span style={{ color: "red" }}>*</span>
              </span>
            }
            name="fullName"
            rules={[{ required: true, message: "Vui lòng nhập họ tên!" }]}
          >
            <Input
              placeholder="Nhập tên của bạn"
              size="large"
              maxLength={30}
              showCount
              style={{ fontSize: "14px" }}
            />
          </Form.Item>

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
              placeholder="Nhập email của bạn"
              size="large"
              maxLength={50}
              showCount
              style={{ fontSize: "14px" }}
            />
          </Form.Item>

          <Form.Item
            label={
              <span style={{ fontSize: "14px" }}>
                Số điện thoại <span style={{ color: "red" }}>*</span>
              </span>
            }
            name="phone"
            rules={[
              { required: true, message: "Vui lòng nhập số điện thoại!" },
              {
                pattern: /^[0-9]{10,11}$/,
                message: "Số điện thoại không hợp lệ!",
              },
            ]}
          >
            <Input
              placeholder="Nhập số điện thoại của bạn"
              size="large"
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
          >
            <PasswordInputWithStrength
              value={password}
              onChange={setPassword}
              placeholder="Nhập mật khẩu của bạn"
              showValidation={true}
            />
          </Form.Item>

          <Form.Item
            label={
              <span style={{ fontSize: "14px" }}>
                Xác nhận mật khẩu <span style={{ color: "red" }}>*</span>
              </span>
            }
            name="confirmPassword"
            rules={[{ required: true, message: "Vui lòng xác nhận mật khẩu!" }]}
          >
            <Input.Password
              placeholder="Xác nhận mật khẩu của bạn"
              size="large"
              style={{ fontSize: "14px" }}
            />
          </Form.Item>

          <Form.Item
            label={null}
            colon={false}
          >
            <div
              onClick={toggleInputVisibility}
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "bold",
                color: "#333",
              }}
            >
              <span style={{ marginRight: "8px"}}>Mã giảm giá (không bắt buộc)</span>
              {isInputVisible ? (
                <UpOutlined style={{ fontSize: "10px", color: "#888" }} />
              ) : (
                <DownOutlined style={{ fontSize: "10px", color: "#888" }} />
              )}
            </div>

            {isInputVisible && (
              <Form.Item name="discountCode" noStyle>
                <Input
                  placeholder="Nhập mã giảm giá"
                  size="large"
                  style={{ fontSize: "14px", marginTop: "4px" }}
                />
              </Form.Item>
            )}
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
              {loading ? "Đang đăng ký..." : "Đăng ký"}
            </Button>
          </Form.Item>

          <div
            style={{
              textAlign: "center",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            <Text>Bằng việc đăng ký, bạn đã đồng ý về </Text>
            <Link href="/terms" style={{ color: "#6c3fb5" }}>
              Điều khoản dịch vụ
            </Link>
            <Text> & </Text>
            <Link href="/privacy" style={{ color: "#6c3fb5" }}>
              Chính sách bảo mật
            </Link>
          </div>

          <div style={{ textAlign: "center", fontSize: "14px" }}>
            <Text>Bạn đã có tài khoản? </Text>
            <Link href="/login" style={{ color: "#6c3fb5", fontWeight: "500" }}>
              Đăng nhập
            </Link>
          </div>
        </Form>
      </div>
    </div>
  );
}
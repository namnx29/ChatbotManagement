"use client";

import { Form, Input, Button, Typography, message } from "antd";
import { EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

const { Title, Text } = Typography;

export default function ResetPasswordPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    // Verify token on mount
    const verifyToken = async () => {
      if (!token || !email) {
        message.error("Invalid link");
        setVerifying(false);
        return;
      }

      try {
        // Just mark as valid - actual verification happens on submit
        setTokenValid(true);
      } catch (error) {
        message.error("Error verifying link");
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token, email]);

  const onFinish = async (values) => {
    if (!token || !email) {
      message.error("Invalid data");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          token,
          password: values.password,
          confirmPassword: values.confirmPassword,
        }),
      });

      const result = await response.json();

      if (result.success) {
        message.success("Password reset successfully");
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        message.error(result.message || "Password reset failed");
      }
    } catch (error) {
      message.error("Connection error");
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
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
        <Typography>Verifying...</Typography>
      </div>
    );
  }

  if (!tokenValid) {
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
            textAlign: "center",
          }}
        >
          <Title level={3}>رابط غير صحيح أو منتهي الصلاحية</Title>
          <Text>يرجى طلب رابط إعادة تعيين جديد</Text>
          <div style={{ marginTop: "20px" }}>
            <Link href="/forgot-password" style={{ color: "#6c3fb5" }}>
              طلب رابط جديد
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
          Reset Password
        </Title>

        <Form
          form={form}
          name="reset-password"
          onFinish={onFinish}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            label={
              <span style={{ fontSize: "14px" }}>
                New Password <span style={{ color: "red" }}>*</span>
              </span>
            }
            name="password"
            rules={[
              { required: true, message: "Please enter password!" },
              { min: 6, message: "Password must be at least 6 characters!" },
            ]}
          >
            <Input.Password
              placeholder="Enter new password"
              size="large"
              iconRender={(visible) =>
                visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
              }
              style={{ fontSize: "14px" }}
            />
          </Form.Item>

          <Form.Item
            label={
              <span style={{ fontSize: "14px" }}>
                Confirm Password <span style={{ color: "red" }}>*</span>
              </span>
            }
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: "Please confirm password!" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Passwords do not match!'));
                },
              }),
            ]}
          >
            <Input.Password
              placeholder="Confirm password"
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
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </Form.Item>

          <div style={{ textAlign: "center", fontSize: "14px" }}>
            <Link href="/login" style={{ color: "#6c3fb5", fontWeight: "500" }}>
              Back to Login
            </Link>
          </div>
        </Form>
      </div>
    </div>
  );
}

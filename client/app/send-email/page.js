"use client";

import { Button, Typography, App } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePublicPageGuard } from "@/lib/auth";

import { ArrowLeftOutlined, MailOutlined } from "@ant-design/icons"; 
import { useState, useEffect } from "react";
import { getUserStatus, resendVerificationEmail } from "@/lib/api";

const { Title, Text } = Typography;
const RESEND_DELAY_SECONDS = 60;

export default function SendEmailPage() {
  const { message } = App.useApp();
  const [countdown, setCountdown] = useState(RESEND_DELAY_SECONDS);
  const [isResendDisabled, setIsResendDisabled] = useState(true);
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const router = useRouter();

  // Redirect to dashboard if already authenticated
  const { isChecking } = usePublicPageGuard();

  useEffect(() => {
    // Get email from localStorage or URL
    const storedEmail = localStorage.getItem('registerEmail');
    if (storedEmail) {
      setEmail(storedEmail);
    }
  }, []);

  useEffect(() => {
    let timer;

    if (countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      setIsResendDisabled(true);
    } else {
      setIsResendDisabled(false);
    }

    return () => clearTimeout(timer);
  }, [countdown]);

  if (isChecking) return null;

  const handleContinue = async () => {
    if (!email) {
      message.error("Email không tìm thấy. Vui lòng đăng ký lại.");
      return;
    }

    setChecking(true);
    try {
      const result = await getUserStatus(email);
      
      if (result.success && result.data.is_verified) {
        message.success("Email đã được xác minh!");
        // Clear stored email
        localStorage.removeItem('registerEmail');
        // Redirect to login
        router.push('/login');
      } else {
        message.error("Email chưa được xác minh. Vui lòng kiểm tra hộp thư của bạn.");
      }
    } catch (error) {
      message.error(error.message || "Không thể kiểm tra trạng thái email");
    } finally {
      setChecking(false);
    }
  };

  const handleResendEmail = async (e) => {
    e.preventDefault();

    if (isResendDisabled) {
      return;
    }

    if (!email) {
      message.error("Email không tìm thấy. Vui lòng đăng ký lại.");
      return;
    }

    try {
      const result = await resendVerificationEmail(email);
      
      if (result.success) {
        message.success("Email xác minh đã được gửi lại. Vui lòng kiểm tra hộp thư của bạn.");
        setCountdown(RESEND_DELAY_SECONDS);
      }
    } catch (error) {
      message.error(error.message || "Không thể gửi lại email");
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
          textAlign: "center",
        }}
      >
        <div style={{ textAlign: "left", marginBottom: "32px" }}>
          <Link href="/" style={{ color: "#6c3fb5", textDecoration: "none", fontSize: "16px", display: "inline-flex", alignItems: "center" }}>
            <ArrowLeftOutlined style={{ marginRight: "8px" }} />
            Trang chủ
          </Link>
        </div>

        <Title
          level={2}
          style={{
            textAlign: "center",
            marginBottom: "16px",
            fontWeight: "bold",
            color: "#333",
          }}
        >
          Xác minh Email của bạn
        </Title>

        <div
          style={{
            textAlign: "center",
            fontSize: "15px",
            marginBottom: "10px",
          }}
        >
          <Text style={{ color: "#555" }}>
            Kiểm tra email & nhấp vào liên kết để kích hoạt tài khoản của bạn
          </Text>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <MailOutlined 
            style={{ 
              fontSize: '120px', 
              color: '#6c3fb5',
              padding: '10px' 
            }} 
          />
        </div>

        <Button
          type="primary"
          block
          size="large"
          onClick={handleContinue}
          loading={checking}
          disabled={checking}
          style={{
            backgroundColor: "#6c3fb5",
            borderColor: "#6c3fb5",
            height: "48px",
            fontSize: "16px",
            fontWeight: "500",
            marginBottom: "16px",
          }}
        >
          {checking ? "Đang kiểm tra..." : "Tiếp tục"}
        </Button>

        <div style={{ textAlign: "center", fontSize: "15px" }}>
          {countdown > 0 ? (
            <Text style={{ color: '#999' }}>
              Gửi lại email ({countdown}s)
            </Text>
          ) : (
            <Link 
              href="#" 
              onClick={handleResendEmail} 
              style={{ 
                color: "#6c3fb5", 
                textDecoration: "none", 
                fontWeight: "500",
              }}
            >
              Gửi lại email
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
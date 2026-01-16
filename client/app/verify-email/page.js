"use client";

import { Typography, Button, Spin, Result } from "antd";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePublicPageGuard } from "@/lib/auth";
import { verifyEmail } from "@/lib/api";
import { message } from "antd";

const { Title, Text } = Typography;

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Redirect to dashboard if already authenticated
  const { isChecking } = usePublicPageGuard();

  if (isChecking) return null;
  const [verifying, setVerifying] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState(null); // 'success' or 'error'
  const [verificationMessage, setVerificationMessage] = useState("");

  useEffect(() => {
    const performVerification = async () => {
      try {
        const token = searchParams.get('token');
        const email = searchParams.get('email');
        const accountId = searchParams.get('accountId');

        // Validate parameters
        if (!token || !email || !accountId) {
          setVerificationStatus('error');
          setVerificationMessage("Link xác minh không hợp lệ. Vui lòng thử đăng ký lại.");
          setVerifying(false);
          return;
        }

        // Call verification API
        const result = await verifyEmail(token, email, accountId);

        if (result.success) {
          setVerificationStatus('success');
          setVerificationMessage("Email của bạn đã được xác minh thành công!");
          
          // Redirect to login after 2 seconds
          setTimeout(() => {
            router.push('/login');
          }, 2000);
        } else {
          setVerificationStatus('error');
          setVerificationMessage(result.message || "Link xác minh đã hết hạn hoặc không hợp lệ");
        }
      } catch (error) {
        setVerificationStatus('error');
        setVerificationMessage(error.message || "Link xác minh đã hết hạn hoặc không hợp lệ");
      } finally {
        setVerifying(false);
      }
    };

    performVerification();
  }, [searchParams, router]);

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
          <Title level={2} style={{ marginBottom: "40px" }}>
            Đang xác minh email...
          </Title>
          <Spin size="large" />
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
        {verificationStatus === 'success' ? (
          <Result
            status="success"
            title="Xác minh thành công!"
            subTitle={verificationMessage}
            extra={
              <Button
                type="primary"
                size="large"
                onClick={() => router.push('/login')}
                style={{
                  backgroundColor: "#6c3fb5",
                  borderColor: "#6c3fb5",
                }}
              >
                Đăng nhập
              </Button>
            }
          />
        ) : (
          <Result
            status="error"
            title="Xác minh không thành công"
            subTitle={verificationMessage}
            extra={
              <Button
                type="primary"
                size="large"
                onClick={() => router.push('/register')}
                style={{
                  backgroundColor: "#6c3fb5",
                  borderColor: "#6c3fb5",
                }}
              >
                Đăng ký lại
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

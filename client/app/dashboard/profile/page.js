"use client";

import {
  Avatar,
  Button,
  Row,
  Col,
  Tag,
  Select,
  Form,
  Input,
  message,
  Spin,
} from "antd";
import { EditOutlined, DownOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { fetchProfile, uploadAvatar, getAvatarUrl } from "@/lib/api";
import PasswordChangeModal from "@/lib/components/popup/PasswordChangeModal";
import NameChangeModal from "@/lib/components/popup/NameChangeModal";

const labelStyle = {
  color: "black",
  fontSize: "14px",
};

const valueStyle = {
  fontSize: "15px",
  fontWeight: "normal",
};

const DetailRow = ({ label, value, actionComponent, isFullWidth = false }) => (
  <Row
    style={{
      padding: "12px 0",
    }}
  >
    <Col span={isFullWidth ? 24 : 8} style={labelStyle}>
      {label}
    </Col>
    <Col
      span={isFullWidth ? 24 : 16}
      style={{
        ...valueStyle,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {value}
      </div>
      {actionComponent}
    </Col>
  </Row>
);

export default function ProfilePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [nameModalVisible, setNameModalVisible] = useState(false);

  const fileInputRef = useRef(null);

  // Fetch profile data on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedUserEmail = localStorage.getItem("userEmail");
      const accountId = localStorage.getItem("accountId");
      const storedUserName = localStorage.getItem("userName");

      if (!storedUserEmail || !accountId) {
        router.push("/login");
        return;
      }

      setUserId(accountId);
      setUserName(storedUserName || storedUserEmail.split("@")[0]);
      setUserEmail(storedUserEmail);

      // Fetch profile data from backend
      try {
        const result = await fetchProfile(accountId);
        if (result.success && result.data) {
          setPhoneNumber(result.data.phone_number || "");
          setAvatarUrl(result.data.avatar_url || null);
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        message.error("Failed to load profile data");
      }

      setIsAuthenticated(true);
      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  // Listen for name updates from NameChangeModal
  useEffect(() => {
    const handleNameUpdate = (event) => {
      const newName = event.detail?.userName;
      if (newName) {
        setUserName(newName);
      }
    };

    window.addEventListener('nameUpdated', handleNameUpdate);
    return () => {
      window.removeEventListener('nameUpdated', handleNameUpdate);
    };
  }, []);

  // Handle avatar file selection
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (1MB max)
    if (file.size > 1024 * 1024) {
      message.error("File size must be less than 1MB");
      return;
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      message.error("Only image files are allowed (JPG, PNG, GIF, WebP)");
      return;
    }

    setSelectedAvatarFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result);
    };
    reader.readAsDataURL(file);
  };

  // Handle saving changes
  const handleSaveChanges = async () => {
    if (!selectedAvatarFile) {
      message.info("No changes to save");
      return;
    }

    setIsSaving(true);
    try {
      const accountId = localStorage.getItem("accountId");
      const result = await uploadAvatar(accountId, selectedAvatarFile);

      if (result.success) {
        setAvatarUrl(result.data.avatar_url);
        setAvatarPreview(null);
        setSelectedAvatarFile(null);
        message.success("Avatar updated successfully");

        // Notify sidebar to update (can use context or event)
        window.dispatchEvent(
          new CustomEvent("avatarUpdated", {
            detail: { avatarUrl: result.data.avatar_url },
          })
        );
      }
    } catch (error) {
      console.error("Failed to upload avatar:", error);
      message.error(error.message || "Failed to upload avatar");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle password change modal
  const handlePasswordModalOpen = () => {
    setPasswordModalVisible(true);
    passwordForm.resetFields();
    setNewPassword("");
  };

  const handlePasswordModalClose = () => {
    setPasswordModalVisible(false);
  };

  const handleNameModalOpen = () => {
    setNameModalVisible(true);
    nameForm.resetFields();
    setNewName("");
  };

  const handleNameModalClose = () => {
    setNameModalVisible(false);
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          background: "#f5f5f5",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  const displayAvatarUrl =
    avatarPreview || (avatarUrl ? getAvatarUrl(avatarUrl) : null);

  return (
    <div style={{ overflowY: "auto", height: "calc(100vh - 100px)" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "24px" }}>
        <h1
          style={{ fontSize: "23px", fontWeight: "bold", marginBottom: "5px" }}
        >
          Thông tin cá nhân
        </h1>

        <div style={{ padding: "24px 0" }}>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              marginBottom: "16px",
            }}
          >
            Hình đại diện
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <div
              onClick={handleAvatarClick}
              style={{
                cursor: "pointer",
                position: "relative",
              }}
            >
              {displayAvatarUrl ? (
                <Avatar
                  size={100}
                  src={displayAvatarUrl}
                  style={{
                    borderRadius: "50%",
                    border: "2px solid #ddd",
                  }}
                />
              ) : (
                <Avatar
                  size={100}
                  icon={<EditOutlined style={{ fontSize: "40px" }} />}
                  style={{
                    background: "#e8e8e8",
                    color: "#999",
                    borderRadius: "50%",
                    border: "1px solid #ddd",
                  }}
                />
              )}
            </div>
            <div>
              <div
                style={{
                  color: "#666",
                  marginBottom: "12px",
                  fontSize: "14px",
                }}
              >
                Dung lượng file cho phép 720×720 pixel, cao nhất là 1MB
              </div>
              <Button
                type="primary"
                onClick={handleSaveChanges}
                loading={isSaving}
                disabled={!selectedAvatarFile || isSaving}
                style={{
                  background: "#9b59d0",
                  borderColor: "#9b59d0",
                  borderRadius: "6px",
                  color: "white",
                }}
              >
                {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarFileChange}
            style={{ display: "none" }}
          />
        </div>

        <div
          style={{ padding: 20, border: "1px solid #d9dde2", borderRadius: 8 }}
        >
          <h3
            style={{
              fontSize: "15px",
              fontWeight: "bold",
              marginBottom: "10px",
            }}
          >
            Chi tiết người dùng
          </h3>

          <div style={{ borderTop: "1px solid #eee" }}>
            <DetailRow
              label="Tên"
              value={userName}
              actionComponent={
                <a
                  href="#"
                  style={{ color: "#6c3fb5" }}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNameModalOpen();
                  }}
                >
                  Chỉnh sửa
                </a>
              }
            />

            <DetailRow label="ID người dùng" value={<span>{userId}</span>} />

            <DetailRow
              label="Trạng thái"
              value={
                <Tag
                  color="green"
                  style={{
                    border: "none",
                    padding: "4px 10px",
                    fontSize: "14px",
                  }}
                >
                  Đang hoạt động
                </Tag>
              }
            />

            <DetailRow
              label="Mật khẩu"
              value="********"
              actionComponent={
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePasswordModalOpen();
                  }}
                  style={{ color: "#6c3fb5" }}
                >
                  Chỉnh sửa
                </a>
              }
            />

            <DetailRow label="E-mail" value={userEmail} />

            <DetailRow
              label="Số điện thoại"
              value={
                <>
                  <span>{phoneNumber || "Chưa cập nhật"}</span>
                  {!phoneNumber && (
                    <Tag
                      color="error"
                      style={{
                        border: "none",
                        padding: "4px 10px",
                        fontSize: "14px",
                        background: "#fce8e8",
                        color: "#ff4d4f",
                      }}
                    >
                      Chưa xác thực
                    </Tag>
                  )}
                </>
              }
              actionComponent={
                <a href="#" style={{ color: "#6c3fb5" }}>
                  Chỉnh sửa
                </a>
              }
            />

            <DetailRow
              label="Thiết lập múi giờ"
              value={
                <>
                  <Select
                    defaultValue="GMT+07:00 - Vietnam"
                    suffixIcon={<DownOutlined />}
                  />
                </>
              }
            />
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      <PasswordChangeModal
        visible={passwordModalVisible}
        onClose={handlePasswordModalClose}
        accountId={userId}
      />
      <NameChangeModal
        visible={nameModalVisible}
        onClose={handleNameModalClose}
        accountId={userId}
      />
    </div>
  );
}

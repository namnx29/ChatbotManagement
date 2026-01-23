"use client";

import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
  Progress,
  Badge,
  Spin,
  Typography
} from "antd";
import {
  UserOutlined,
  RobotOutlined,
  MessageOutlined,
  LineChartOutlined,
  FileTextOutlined,
  HistoryOutlined,
  TeamOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  DownOutlined,
  RightOutlined,
  LeftOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getAvatarUrl, fetchProfile } from "@/lib/api";
import TrialBanner from "@/lib/components/popup/TrialBanner";
import { NotificationProvider, useNotification } from "@/lib/context/NotificationContext";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const MOBILE_BREAKPOINT = 768;

function DashboardLayoutContent({ children }) {
  const { hasUnread } = useNotification();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState(null);
  const siderWidth = 240;
  const collapsedWidth = 50;

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      const userEmail = localStorage.getItem("userEmail");
      const accountId = localStorage.getItem("accountId");
      const storedUserName = localStorage.getItem("userName");

      if (!userEmail || !accountId) {
        // User not authenticated, redirect to login
        router.push("/login");
        return;
      }

      try {
        const result = await fetchProfile(accountId);
        if (result.success && result.data) {
          setUserAvatar(result.data.avatar_url || null);
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        message.error("Failed to load profile data");
      }

      setUserName(storedUserName || userEmail.split("@")[0]);
      setIsAuthenticated(true);
      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  // Listen for avatar updates from profile page
  useEffect(() => {
    const handleAvatarUpdate = (event) => {
      const avatarUrl = event.detail?.avatarUrl;
      if (avatarUrl) {
        setUserAvatar(avatarUrl);
        localStorage.setItem("userAvatar", avatarUrl);
      }
    };

    window.addEventListener("avatarUpdated", handleAvatarUpdate);
    return () =>
      window.removeEventListener("avatarUpdated", handleAvatarUpdate);
  }, []);

  // Listen for name updates from NameChangeModal
  useEffect(() => {
    const handleNameUpdate = (event) => {
      const newName = event.detail?.userName;
      if (newName) {
        setUserName(newName);
        localStorage.setItem("userName", newName);
      }
    };

    window.addEventListener("nameUpdated", handleNameUpdate);
    return () =>
      window.removeEventListener("nameUpdated", handleNameUpdate);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setCollapsed(window.innerWidth < MOBILE_BREAKPOINT);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const languageMenu = {
    items: [
      { key: "vi", label: "Tiếng Việt" },
      { key: "en", label: "Tiếng Anh" },
    ],
  };

  const settingsMenuItems = [
    {
      key: "/dashboard/settings/account",
      icon: <UserOutlined />,
      label: (
        <Link href="/dashboard/settings/account">Thông tin tài khoản</Link>
      ),
    },
    {
      key: "/dashboard/settings/billing",
      icon: <FileTextOutlined />,
      label: <Link href="/dashboard/settings/billing">Thanh toán</Link>,
    },
    {
      key: "/dashboard/settings/notifications",
      icon: <MessageOutlined />,
      label: <Link href="/dashboard/settings/notifications">Thông báo</Link>,
    },
  ];

  const primaryMenuItems = [
    {
      key: "/dashboard/profile",
      icon: <UserOutlined />,
      label: "Thông tin cá nhân",
    },
    {
      key: "/dashboard/training-chatbot",
      icon: <RobotOutlined />,
      label: "Đào tạo chatbot",
    },
    {
      key: "/dashboard/messages",
      icon: <MessageOutlined />,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>Quản lý tin nhắn</span>
          {hasUnread && (
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#ff4d4f',
                marginLeft: '8px',
              }}
            />
          )}
        </div>
      ),
    },
    {
      key: "/dashboard/statistics",
      icon: <LineChartOutlined />,
      label: "Thống kê",
    },
    { key: "/dashboard/posts", icon: <FileTextOutlined />, label: "Bài viết" },
    {
      key: "/dashboard/history",
      icon: <HistoryOutlined />,
      label: "Lịch sử giao dịch",
    },
    { key: "/dashboard/affiliate", icon: <TeamOutlined />, label: "Affiliate" },
    {
      key: "/dashboard/support",
      icon: <QuestionCircleOutlined />,
      label: "Hỗ trợ yêu cầu ticket",
    },
    {
      key: "/dashboard/usage",
      icon: <SettingOutlined />,
      label: "Hạn mức sử dụng",
    },
    {
      key: "/dashboard/upgrade",
      icon: <ThunderboltOutlined />,
      label: "Nâng cấp",
    },
  ];

  const getSelectedMenuKey = () => {
    // Match first-level menu groups
    if (pathname.startsWith("/dashboard/training-chatbot")) {
      return "/dashboard/training-chatbot";
    }
    if (pathname.startsWith("/dashboard/messages")) {
      return "/dashboard/messages";
    }
    if (pathname.startsWith("/dashboard/statistics")) {
      return "/dashboard/statistics";
    }
    if (pathname.startsWith("/dashboard/history")) {
      return "/dashboard/history";
    }
    if (pathname.startsWith("/dashboard/affiliate")) {
      return "/dashboard/affiliate";
    }
    if (pathname.startsWith("/dashboard/posts")) {
      return "/dashboard/posts";
    }
    if (pathname.startsWith("/dashboard/support")) {
      return "/dashboard/support";
    }
    if (pathname.startsWith("/dashboard/usage")) {
      return "/dashboard/usage";
    }
    if (pathname.startsWith("/dashboard/upgrade")) {
      return "/dashboard/upgrade";
    }
    if (pathname.startsWith("/dashboard/profile")) {
      return "/dashboard/profile";
    }

    // Settings - has nested children
    if (pathname.startsWith("/dashboard/settings")) {
      return "/dashboard/settings/account";
    }

    return pathname;
  };

  const allMenuItems = [
    ...primaryMenuItems.map((item) => ({
      ...item,
      label: <Link href={item.key}>{item.label}</Link>,
    })),
    {
      key: "settings-dropdown",
      icon: <SettingOutlined />,
      label: "Cài đặt",
      children: settingsMenuItems,
    },
  ];

  const handleLogout = () => {
    // Clear auth data from localStorage
    localStorage.removeItem("userEmail");
    localStorage.removeItem("accountId");
    localStorage.removeItem("userName");

    // Redirect to login
    router.push("/login");
  };

  const contentMarginLeft = collapsed ? collapsedWidth : siderWidth;

  // Show loading spinner while checking authentication
  if (isLoading) {
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

  // If not authenticated, don't render dashboard (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Layout style={{ minHeight: "100vh", height: "100%", display: "flex" }}>
        <Header
          style={{
            background: "#6c3fb5",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "fixed",
            width: "100%",
            zIndex: 1000,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "40px" }}>
            <div
              style={{ color: "white", fontSize: "24px", fontWeight: "bold" }}
            >
              Test
            </div>
            <Menu
              mode="horizontal"
              className="header-menu"
              style={{
                background: "transparent",
                border: "none",
                minWidth: "300px",
              }}
              items={[
                { key: "home", label: "Trang chủ", color: "white" },
                { key: "guide", label: "Hướng dẫn" },
                { key: "packages", label: "Mua gói" },
              ]}
              selectedKeys={[]}
            />
          </div>
          <Dropdown menu={languageMenu} trigger={["click"]}>
            <Button
              style={{
                background: "white",
                border: "none",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
              }}
            >
              <span>Tiếng Việt</span>
              <DownOutlined style={{ fontSize: "12px" }} />
            </Button>
          </Dropdown>
        </Header>

        <Layout style={{ marginTop: 64 }}>
          <Sider
            width={siderWidth}
            collapsedWidth={collapsedWidth}
            style={{
              background: "#101828",
              position: "fixed",
              left: 0,
              top: 64,
              bottom: 0,
              zIndex: 999,
            }}
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            trigger={null}
          >
            <Button
              type="text"
              icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                color: "white",
                fontSize: "10px",
                height: "20px",
                width: "20px",
                position: "absolute",
                top: "28px",
                right: collapsed ? "-10px" : "-10px",
                zIndex: 1001,
                background: "#6c3fb5",
                borderRadius: "50%",
              }}
            />

            <div
              style={{
                padding: collapsed ? "12px 0" : "16px 12px 0",
                height: collapsed ? "80px" : "220px",
                display: "flex",
                flexDirection: "column",
                alignItems: collapsed ? "center" : "flex-start",
                transition: "all 0.2s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: collapsed ? "0" : "12px",
                  width: "100%",
                  justifyContent: collapsed ? "center" : "flex-start",
                  padding: collapsed ? "0" : "8px",
                  transition: "all 0.2s ease",
                }}
              >
                <Avatar
                  size={collapsed ? 28 : 40}
                  src="/bg-login.jpg"
                  style={{ transition: "all 0.2s" }}
                />

                {!collapsed && (
                  <div
                    style={{
                      color: "white",
                      fontSize: "14px",
                      whiteSpace: "wrap",
                      flex: 1,
                    }}
                  >
                    {userName} Workspace
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: collapsed ? "10px" : "14px",
                  width: "100%",
                  background: collapsed ? "transparent" : "#252939",
                  borderRadius: "8px",
                  padding: collapsed ? "0" : "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: collapsed ? "0" : "10px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  transition: "all 0.2s ease",
                  minHeight: collapsed ? "28px" : "auto",
                }}
              >
                <Badge dot color="green" offset={[-5, 5]}>
                  <Avatar
                    size={32}
                    src={userAvatar ? getAvatarUrl(userAvatar) : null}
                    icon={!userAvatar && <UserOutlined />}
                    style={{
                      background: userAvatar ? "transparent" : "#6c3fb5",
                      transition: "all 0.2s",
                    }}
                  />
                </Badge>

                {!collapsed && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <Text
                      style={{ maxWidth: 150, color: "white", marginBottom: 4 }}
                      ellipsis={{ tooltip: { userName } }}
                    >
                      {userName}
                    </Text>

                    <div
                      style={{
                        display: "inline-block",
                        color: "#ae92da",
                        fontSize: 10,
                        borderRadius: 8,
                        background: "#4b5563",
                        padding: "3px 6px",
                      }}
                    >
                      Trial package
                    </div>
                  </div>
                )}
              </div>
              {!collapsed && (
                <div style={{ marginTop: 12, width: "100%" }}>
                  <div
                    style={{ fontSize: 12, marginBottom: 6, color: "white" }}
                  >
                    Cuộc hội thoại: 0 / 2,000
                  </div>
                  <Progress
                    percent={0}
                    strokeColor="#737373"
                    railColor="#737373"
                    showInfo={false}
                    size="small"
                  />
                </div>
              )}
            </div>

            <div
              style={{
                height: `calc(100vh - 64px - ${collapsed ? 80 : 220}px - 50px)`,
                overflowY: "auto",
                transition: "height 0.2s",
              }}
            >
              <Menu
                mode="inline"
                selectedKeys={[getSelectedMenuKey()]}
                theme="dark"
                style={{
                  border: "none",
                  background: "transparent",
                }}
                items={allMenuItems}
              />
            </div>

            <div
              style={{
                position: "absolute",
                bottom: 0,
                width: "100%",
                padding: "8px 16px",
                background: "#101828",
                borderTop: "1px solid #252939",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Button
                type="text"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                style={{
                  color: "white",
                  background: "#ef4444",
                  width: collapsed ? "auto" : "100%",
                  justifyContent: collapsed ? "center" : "flex-start",
                  textAlign: collapsed ? "center" : "left",
                  padding: collapsed ? "8px" : "8px 15px",
                  borderRadius: "8px",
                }}
              >
                {!collapsed && "Đăng xuất"}
              </Button>
            </div>
          </Sider>

          {/* Content */}
          <Layout
            style={{
              marginLeft: contentMarginLeft,
              transition: "margin-left 0.2s",
            }}
          >
            <Content
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "white",
              }}
            >
              <TrialBanner />
              {children}
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </>
  );
}

export default function DashboardLayout({ children }) {
  return (
    <NotificationProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </NotificationProvider>
  );
}
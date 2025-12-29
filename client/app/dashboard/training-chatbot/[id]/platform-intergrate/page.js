"use client";

import { Layout, Input, Button, Radio, message, Modal } from "antd";
import {
  SearchOutlined,
  CloseOutlined,
  AppstoreFilled,
  ClockCircleOutlined,
  FacebookFilled,
  InstagramFilled,
  TikTokOutlined,
} from "@ant-design/icons";
import { useState, useEffect, useRef } from "react";
import PlatformConnectTemplate from "@/lib/components/PlatformIntegrateTemplate";

const { Sider, Content } = Layout;

export default function PlatformIntegrationPage() {
  const [selectedPlatform, setSelectedPlatform] = useState("all");

  const platforms = [
    {
      key: "all",
      name: "Tất cả",
      icon: <AppstoreFilled style={{ fontSize: "24px", color: "white" }} />,
      bgColor: "#6c3fb5",
    },
    // {
    //   key: "schedule",
    //   name: "Chờ kích hoạt",
    //   icon: (
    //     <ClockCircleOutlined style={{ fontSize: "24px", color: "white" }} />
    //   ),
    //   bgColor: "#ffa940",
    // },
    {
      key: "facebook",
      name: "Facebook",
      icon: <FacebookFilled style={{ fontSize: "50px", color: "#1877f2" }} />,
    },
    {
      key: "instagram",
      name: "Instagram",
      icon: <InstagramFilled style={{ fontSize: "50px", color: "#e4405f" }} />,
    },
    {
      key: "zalo",
      name: "Zalo",
      icon: (
        <div style={{ fontSize: "18px", fontWeight: "bold", color: "white" }}>
          Zalo
        </div>
      ),
      bgColor: "#0068ff",
    },
    {
      key: "lazada",
      name: "Lazada",
      icon: (
        <div style={{ fontSize: "16px", fontWeight: "bold", color: "white" }}>
          Laz
        </div>
      ),
      bgColor: "#0f146d",
    },
    {
      key: "tiktok",
      name: "Tiktok",
      icon: <TikTokOutlined style={{ fontSize: "50px" }} />,
    },
  ];

  const PlatformButton = ({ platform }) => (
    <div
      onClick={() => setSelectedPlatform(platform.key)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px",
        cursor: "pointer",
        borderRadius: "8px",
        background:
          selectedPlatform === platform.key ? "#f5f5ff" : "transparent",
        border:
          selectedPlatform === platform.key
            ? "1px solid #6c3fb5"
            : "1px solid transparent",
        transition: "all 0.3s",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "8px",
          background: platform.bgColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {platform.icon}
      </div>
      <span
        style={{
          fontSize: "15px",
          fontWeight: selectedPlatform === platform.key ? "500" : "400",
        }}
      >
        {platform.name}
      </span>
    </div>
  );

  const [integrations, setIntegrations] = useState([]);
  const [loadingInts, setLoadingInts] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState(null);

  // Extract chatbotId from path like /dashboard/training-chatbot/{id}/platform-intergrate
  const getChatbotIdFromPath = () => {
    try {
      const m = window.location.pathname.match(/training-chatbot\/([^\/]+)/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  };

  const fetchIntegrations = async () => {
    setLoadingInts(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const chatbotId = getChatbotIdFromPath();
      const url = chatbotId ? `${base}/api/integrations?platform=zalo&chatbotId=${encodeURIComponent(chatbotId)}` : `${base}/api/integrations?platform=zalo`;
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "X-Account-Id": localStorage.getItem("accountId") || "test-account",
        },
      });
      const data = await res.json();
      if (data && data.success) {
        setIntegrations(data.data || []);
        return data.data || [];
      }
      return [];
    } catch (e) {
      console.error("Failed to load integrations", e);
      return [];
    } finally {
      setLoadingInts(false);
    }
  };

  const notifiedRef = useRef(false)

  useEffect(() => {
    // On mount, fetch integrations and check URL for success params
    const init = async () => {
      await fetchIntegrations();
      try {
        const qs = new URLSearchParams(window.location.search);
        const oa_id = qs.get("oa_id");
        const status = qs.get("status");
        const conflict_type = qs.get("conflict_type");
        const conflict_chatbotId = qs.get("conflict_chatbotId");
        const conflict_chatbotName = qs.get("conflict_chatbotName");
        const other_oa_id = qs.get("other_oa_id");
        if (oa_id && qs.get("platform") === "zalo" && !notifiedRef.current) {
          notifiedRef.current = true
          // Refresh list first
          const list = await fetchIntegrations();
          const found = (list || []).find((it) => it && it.oa_id === oa_id);

          if (status === "already") {
            const display = found ? (found.name || found.oa_name || found.oa_id) : oa_id
            message.info(`Zalo OA already connected: ${display}`);
          } else if (status === "connected") {
            const display = found ? (found.name || found.oa_name || found.oa_id) : oa_id
            message.success(`Zalo OA connected: ${display}`);
          } else if (status === "conflict") {
            // handle conflict types
            if (conflict_type === "oa_assigned") {
              const name = conflict_chatbotName || conflict_chatbotId || "another chatbot"
              Modal.confirm({
                title: 'OA đã được kết nối',
                content: `Nền tảng Zalo này đã được kết nối với bot "${name}". Vui lòng chuyển đến bot đó để hủy kết nối trước khi thêm vào bot này.`,
                okText: 'Đến bot',
                cancelText: 'Đóng',
                onOk: () => {
                  if (conflict_chatbotId) {
                    window.location.href = `/dashboard/training-chatbot/${conflict_chatbotId}/platform-intergrate`;
                  }
                }
              })
            } else if (conflict_type === "chatbot_has_other") {
              Modal.warning({
                title: 'Bot đã có OA khác',
                content: `Bot này đã có OA khác (ID: ${other_oa_id}). Vui lòng hủy kích hoạt OA hiện tại nếu bạn muốn thay thế.`
              })
            } else {
              message.warning('Kết nối không thành công do xung đột.');
            }
          }

          // Clear query params from URL so it doesn't re-alert on refresh
          const url = new URL(window.location.href);
          url.search = "";
          window.history.replaceState({}, "", url.toString());
        }
      } catch (e) {
        // ignore
      }
    };
    init();
  }, []);

  const renderZaloContent = () => (
    <PlatformConnectTemplate
      title="Kết nối với Test Zalo"
      description="Zalo OA yêu cầu bạn phải mua gói OA Nâng cao hoặc OA Premium để có thể kết nối với Test."
      buttonText="Đăng nhập bằng Zalo"
      buttonColor="#0068ff"
      platformLogo={
        <img src="/Zalo.png" style={{ width: "80px" }} alt="zalo logo" />
      }
      onClick={async () => {
        try {
          const base =
            process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
          const chatbotId = getChatbotIdFromPath();
          const url = chatbotId
            ? `${base}/api/zalo/auth-url?chatbotId=${chatbotId}`
            : `${base}/api/zalo/auth-url`;
          const res = await fetch(url, {
            method: "GET",
            mode: "cors",
            headers: {
              "Content-Type": "application/json",
              "X-Account-Id":
                localStorage.getItem("accountId") || "test-account",
            },
          });

          const ct = res.headers.get("content-type") || "";
          if (!ct.includes("application/json")) {
            const text = await res.text();
            console.error(
              "Unexpected non-JSON response when requesting Zalo auth url:",
              text
            );
            alert(
              "Unexpected response from server. Check backend URL and CORS."
            );
            return;
          }

          const data = await res.json();
          if (data && data.auth_url) {
            window.location.href = data.auth_url;
          } else {
            console.error("Failed to get Zalo auth url", data);
            alert("Could not initiate Zalo connection");
          }
        } catch (err) {
          console.error(err);
          alert("Failed to connect to backend");
        }
      }}
    />
  );

  const handlePlatformLogin = (platformKey) => {
    // Placeholder for future platform login flows. Keep silent in production.
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEV] Platform login clicked: ${platformKey}`);
    }
  };

  const renderFacebookContent = () => (
    <PlatformConnectTemplate
      title="Kết nối với Test Facebook"
      description="Sử dụng Test để khóa mục tiêu mua hàng qua tin nhắn trên Ads Manager. Chatbot AI tự động nhắn tin, chốt đơn tăng tỷ lệ 50%"
      buttonText="Đăng nhập bằng Facebook"
      buttonColor="#0068ff"
      platformLogo={
        <img
          src="/Facebook.png"
          style={{ width: "60px" }}
          alt="facebook logo"
        />
      }
      onClick={() => handlePlatformLogin('facebook')}
    />
  );

  const renderInstagramContent = () => (
    <PlatformConnectTemplate
      title="Kết nối với Test Instagram"
      description="Tự động đồng bộ sự kiện mua hàng để tối ưu quảng cáo Instagram với CAPI"
      buttonText="Đăng nhập bằng Instagram"
      buttonColor="#0068ff"
      platformLogo={
        <img
          src="/Instagram.png"
          style={{ width: "60px" }}
          alt="instagram logo"
        />
      }
      onClick={() => handlePlatformLogin('instagram')}
    />
  );

  const renderLazadaContent = () => (
    <PlatformConnectTemplate
      title="Kết nối với Test Lazada"
      description="Tích hợp Chatbot AI, quản lý tin nhắn từ Lazada"
      buttonText="Đăng nhập bằng Lazada"
      buttonColor="#0068ff"
      platformLogo={
        <img src="/Lazada.png" style={{ width: "60px" }} alt="lazada logo" />
      }
      onClick={() => handlePlatformLogin('lazada')}
    />
  );

  const renderTiktokContent = () => (
    <PlatformConnectTemplate
      title="Kết nối với Test Tiktok"
      description="Quản lý tin nhắn, bình luận tài khoản TikTok Business của bạn với đối tác chính thức từ TikTok & Test AI"
      buttonText="Đăng nhập bằng Tiktok"
      buttonColor="#0068ff"
      platformLogo={
        <img src="/Tiktok.png" style={{ width: "60px" }} alt="tiktok logo" />
      }
      onClick={() => handlePlatformLogin('tiktok')}
    />
  );

  const renderDefaultPlatformList = () => (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
          Danh sách các nền tảng đã tích hợp
        </h1>
        <Input
          placeholder="Tìm theo tên hoặc ID page..."
          prefix={<SearchOutlined style={{ color: "#999" }} />}
          style={{ width: "320px", height: "40px" }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "32px",
        }}
      >
        <Radio>Chọn tất cả</Radio>

        <Button
          icon={<CloseOutlined />}
          disabled={!selectedIntegration}
          onClick={() => {
            if (!selectedIntegration) return;
            Modal.confirm({
              title: "Hủy kích hoạt OA",
              content: `Bạn có chắc muốn hủy kích hoạt ${selectedIntegration.name || selectedIntegration.oa_name || selectedIntegration.oa_id}?`,
              okText: "Hủy kích hoạt",
              okType: "danger",
              cancelText: "Hủy",
              onOk: async () => {
                try {
                  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
                  const res = await fetch(`${base}/api/integrations/${selectedIntegration._id}`, {
                    method: "DELETE",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Account-Id": localStorage.getItem("accountId") || "test-account",
                    },
                  });
                  const data = await res.json();
                  if (data && data.success) {
                    setIntegrations((prev) => prev.filter((it) => it._id !== selectedIntegration._id));
                    setSelectedIntegration(null);
                    message.success("Hủy kích hoạt thành công");
                  } else {
                    message.error((data && data.message) || "Không thể hủy kích hoạt");
                  }
                } catch (e) {
                  console.error(e);
                  message.error("Lỗi khi hủy kích hoạt");
                }
              },
            });
          }}
          style={{
            color: "#6c3fb5",
            borderColor: "#6c3fb5",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          Hủy kích hoạt
        </Button>
      </div>

      {/* Show Zalo integrations here in the default list */}
      <div
        style={{
          minHeight: "400px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          {loadingInts ? (
            <p>Đang tải...</p>
          ) : integrations.length ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {integrations.map((it) => (
                <div
                  key={it._id}
                  onClick={() => setSelectedIntegration(it)}
                  style={{
                    border: selectedIntegration && selectedIntegration._id === it._id ? "1px solid #6c3fb5" : "1px solid #eee",
                    background: selectedIntegration && selectedIntegration._id === it._id ? "#f5f5ff" : "white",
                    padding: 12,
                    borderRadius: 8,
                    minWidth: 220,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={it.avatar_url || "/Zalo.png"}
                    alt="avatar"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      objectFit: "cover",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <strong style={{ fontSize: 14 }}>
                        {it.name || it.oa_name || it.oa_id}
                      </strong>
                      {it.is_active && (
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            background: "#24b14b",
                            borderRadius: "50%",
                            display: "inline-block",
                          }}
                        />
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      Kích hoạt: {new Date(it.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 240,
              }}
            >
              <div
                style={{
                  width: "120px",
                  height: "120px",
                  background: "#f5f5f5",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                  position: "relative",
                }}
              >
                <span style={{ fontSize: "48px" }}>📦</span>
                <div
                  style={{
                    position: "absolute",
                    top: "-10px",
                    right: "-10px",
                    width: "40px",
                    height: "40px",
                    background: "#e3f2fd",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: "24px" }}>✈️</span>
                </div>
              </div>
              <p style={{ fontSize: "15px", color: "#666" }}>
                Chưa có nền tảng nào đã kích hoạt
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderContent = () => {
    switch (selectedPlatform) {
      case "zalo":
        return renderZaloContent();
      case "facebook":
        return renderFacebookContent();
      case "instagram":
        return renderInstagramContent();
      case "lazada":
        return renderLazadaContent();
      case "tiktok":
        return renderTiktokContent();
      default:
        return renderDefaultPlatformList();
    }
  };

  return (
    <div>
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
          Tích hợp nền tảng
        </h1>
      </div>

      <Layout style={{ background: "white", borderRadius: "8px" }}>
        <Sider
          width={280}
          style={{ background: "white", padding: "24px 16px" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              overflowY: "auto",
            }}
          >
            {platforms.map((p) => (
              <PlatformButton key={p.key} platform={p} />
            ))}
          </div>
        </Sider>

        <Content
          style={{
            padding: "24px",
            border: "1px solid #f0f0f0",
            borderRadius: "8px",
          }}
        >
          {renderContent()}
        </Content>
      </Layout>
    </div>
  );
}

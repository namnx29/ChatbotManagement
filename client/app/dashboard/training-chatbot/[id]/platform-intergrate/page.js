"use client";

import { Layout, Input, Button, Radio, App, Card, Row, Col, Typography, Empty, Spin } from "antd";
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
const { Text } = Typography;

export default function PlatformIntegrationPage() {
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const { message, modal } = App.useApp();

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

  const fetchIntegrations = async (platformOverride = null) => {
    setLoadingInts(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const chatbotId = getChatbotIdFromPath();
      const platform = platformOverride !== null ? platformOverride : (selectedPlatform === "all" ? null : selectedPlatform);
      let url = `${base}/api/integrations`;
      const qs = [];
      if (platform) qs.push(`platform=${encodeURIComponent(platform)}`);
      if (chatbotId) qs.push(`chatbotId=${encodeURIComponent(chatbotId)}`);
      if (qs.length) url += `?${qs.join("&")}`;

      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Account-Id": localStorage.getItem("accountId") || "test-account",
        },
      });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        console.error("Unexpected non-JSON response when requesting integrations:", text);
        modal.error({
          title: 'Failed to load integrations',
          content: (
            <div>
              <p>Unexpected response from server when requesting integrations.</p>
              <pre style={{ maxHeight: 200, overflow: 'auto' }}>{String(text).slice(0, 1000)}</pre>
              <p style={{ marginTop: 8 }}>Possible causes: backend not running, incorrect <code>NEXT_PUBLIC_API_URL</code>, or a temporary tunnel/ngrok error.</p>
            </div>
          ),
        });
        return [];
      }

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
        const platform = qs.get("platform");

        // If callback provided a platform, set the UI filter so the correct list is shown
        if (platform && (platform === 'zalo' || platform === 'facebook')) {
          setSelectedPlatform(platform);
        }

        if (oa_id && platform && !notifiedRef.current) {
          notifiedRef.current = true
          // Refresh list first
          const list = await fetchIntegrations(platform);
          const found = (list || []).find((it) => it && it.oa_id === oa_id);

          if (status === "already") {
            message.info(`Tài khoản này đã được kết nối trước đó`);
          } else if (status === "connected") {
            message.success(`Kết nối thành công`);
          } else if (status === "conflict") {
            if (conflict_type === "oa_assigned") {
              modal.confirm({
                title: 'Đã được kết nối',
                content: `Tài khoản này đã được kết nối với bot khác`,
                cancelText: 'Đóng',
              })
            } else if (conflict_type === "chatbot_has_other") {
              modal.warning({
                title: 'Bot đã có Zalo OA',
                content: `Bot này đã có Zalo OA. Vui lòng hủy kích hoạt OA hiện tại nếu bạn muốn thay thế.`
              })
            } else {
              message.warning('Kết nối không thành công do xung đột.');
            }
          }

          const url = new URL(window.location.href);
          url.search = "";
          window.history.replaceState({}, "", url.toString());
        }
      } catch (e) {

      }
    };
    init();
  }, []);

  // Refetch integrations when platform filter changes so UI reflects selected platform
  useEffect(() => {
    // Avoid fetching twice on initial mount (init already fetched), but refetch when user changes platform
    fetchIntegrations();
  }, [selectedPlatform]);

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
          const base = process.env.NEXT_PUBLIC_API_URL;
          const chatbotId = getChatbotIdFromPath();
          const url = chatbotId
            ? `${base}/api/zalo/auth-url?chatbotId=${chatbotId}`
            : `${base}/api/zalo/auth-url`;
          const res = await fetch(url, {
            method: "GET",
            mode: "cors",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
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

  const handlePlatformLogin = async (platformKey) => {
    if (platformKey === 'facebook') {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL;
        const chatbotId = getChatbotIdFromPath();
        const url = chatbotId ? `${base}/api/facebook/auth-url?chatbotId=${chatbotId}` : `${base}/api/facebook/auth-url`;
        const res = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Account-Id': localStorage.getItem('accountId') || 'test-account',
          },
        });

        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          const text = await res.text();
          console.error('Unexpected non-JSON response when requesting Facebook auth url:', text);
          modal.error({
            title: 'Failed to initiate Facebook connection',
            content: (
              <div>
                <p>Unexpected response from server when requesting auth URL.</p>
                <pre style={{ maxHeight: 200, overflow: 'auto' }}>{String(text).slice(0, 1000)}</pre>
                <p style={{ marginTop: 8 }}>Possible causes: backend not running, incorrect <code>NEXT_PUBLIC_API_URL</code>, or a temporary tunnel/ngrok error.</p>
              </div>
            ),
          });
          return;
        }

        const data = await res.json();
        if (data && data.auth_url) {
          window.location.href = data.auth_url;
        } else {
          console.error('Failed to get Facebook auth url', data);
          modal.error({ title: 'Could not initiate Facebook connection', content: JSON.stringify(data) });
        }
      } catch (err) {
        console.error(err);
        alert('Failed to connect to backend');
      }
      return;
    }

    // Placeholder for other platforms; keep silent in production.
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
          Nền tảng đã tích hợp
        </h1>
        <Input
          placeholder="Tìm theo tên hoặc ID..."
          prefix={<SearchOutlined style={{ color: "#999" }} />}
          style={{ width: "320px", height: "40px" }}
        />
      </div>

      <div style={{ marginBottom: "20px", display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          danger
          icon={<CloseOutlined />}
          disabled={!selectedIntegration}
          onClick={() => {
            if (!selectedIntegration) return;
            modal.confirm({
              title: "Hủy kích hoạt OA",
              content: `Bạn có chắc muốn hủy kích hoạt ${selectedIntegration.name || selectedIntegration.oa_name || selectedIntegration.oa_id}?`,
              okText: "Hủy kích hoạt",
              okType: "danger",
              cancelText: "Hủy",
              onOk: async () => {
                try {
                  const base = process.env.NEXT_PUBLIC_API_URL;
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
        >
          Hủy kích hoạt
        </Button>
      </div>

      {loadingInts ? (
        <div style={{ textAlign: 'center', padding: '50px' }}><Spin size="large" /></div>
      ) : integrations.length ? (
        /* --- GRID LAYOUT --- */
        <Row gutter={[16, 16]}>
          {integrations.map((it) => (
            <Col xs={24} sm={12} md={12} key={it._id}>
              <Card
                hoverable
                onClick={() => setSelectedIntegration(it)}
                style={{
                  borderRadius: '12px',
                  transition: 'all 0.3s',
                  border: selectedIntegration?._id === it._id ? "2px solid #6c3fb5" : "1px solid #f0f0f0",
                  background: selectedIntegration?._id === it._id ? "#f5f5ff" : "white",
                }}
                styles={{ body: { padding: '16px' } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ position: 'relative' }}>
                    <img
                      src={it.avatar_url || "/Zalo.png"}
                      alt="avatar"
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: 10,
                        objectFit: "cover",
                        border: '1px solid #eee'
                      }}
                    />
                    {it.is_active && (
                      <div style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 14,
                        height: 14,
                        background: "#52c41a",
                        border: '2px solid white',
                        borderRadius: '50%'
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <Text strong style={{ fontSize: 15, display: 'block' }} ellipsis>
                      {it.name || it.oa_name || it.oa_id}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {it.platform?.toUpperCase()}
                    </Text>
                  </div>
                </div>

                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid #f0f0f0',
                  fontSize: '11px',
                  color: '#999'
                }}>
                  <ClockCircleOutlined /> Kết nối: {new Date(it.created_at).toLocaleDateString('vi-VN')}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có nền tảng nào được kích hoạt"
          style={{ marginTop: 60 }}
        />
      )}
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
          padding: "13px 20px",
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

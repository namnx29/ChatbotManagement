"use client";

import {
  Layout,
  Input,
  Select,
  Button,
  Avatar,
  Badge,
  Empty,
  Carousel,
} from "antd";
import {
  SearchOutlined,
  DownOutlined,
  SwapOutlined,
  FilterOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

const { Sider, Content } = Layout;

export default function ChatManagementPage() {
  const [selectedChat, setSelectedChat] = useState(null);
  const [filterChannel, setFilterChannel] = useState("all");
  const carouselRef = useRef(null);

  // Chat data (updated in real-time)
  const [chats, setChats] = useState([])

  useEffect(() => {
    // Connect to Socket.IO server
    const socket = io(undefined, { transports: ["websocket"] })

    const dbg = (...args) => { if (process.env.NODE_ENV === 'development') console.debug(...args); };

    socket.on("connect", () => {
      dbg("Socket connected", socket.id)
    })

    socket.on("new-message", (payload) => {
      dbg('New message', payload)
      setChats((prev) => [
        {
          id: `${payload.platform}_${payload.oa_id}_${payload.sender_id}_${Date.now()}`,
          name: `User ${payload.sender_id}`,
          avatar: null,
          lastMessage: payload.message,
          time: new Date(payload.received_at).toLocaleString(),
          platform: payload.platform,
          payload,
        },
        ...prev,
      ])
    })

    socket.on("disconnect", () => {
      dbg("Socket disconnected")
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const onboardingSlides = [
    {
      title: "Lý do nên sử dụng AI Chatbot Test",
      description:
        "AI chatbot Test có nhiều tính năng độc đáo giúp bạn tăng 50% chuyển đổi trên Fanpage và website",
      image: "🤖💬",
    },
    {
      title: "Tự động trả lời 24/7",
      description:
        "Chatbot AI của bạn sẽ tự động trả lời tin nhắn mọi lúc mọi nơi",
      image: "⏰💬",
    },
    {
      title: "Tích hợp đa nền tảng",
      description:
        "Kết nối với Facebook, Instagram, Zalo và nhiều nền tảng khác",
      image: "🔗📱",
    },
  ];

  return (
    <Layout style={{ height: "calc(100vh - 64px)", background: "#f0f2f5" }}>
      {/* Left Sidebar - Chat List */}
      <Sider
        width={370}
        style={{
          background: "white",
          borderRight: "1px solid #f0f0f0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h2 style={{ fontSize: "20px", fontWeight: "600", margin: 0 }}>
              Chat
            </h2>
            <Select
              defaultValue="all"
              suffixIcon={<DownOutlined />}
              style={{ width: "180px" }}
              options={[
                { value: "all", label: "Tất cả kênh chat" },
                { value: "facebook", label: "Facebook" },
                { value: "instagram", label: "Instagram" },
                { value: "zalo", label: "Zalo" },
              ]}
              onChange={setFilterChannel}
            />
          </div>

          {/* Search */}
          <Input
            placeholder="Tìm kiếm theo tên khách hàng"
            prefix={<SearchOutlined style={{ color: "#999" }} />}
            style={{ marginBottom: "12px" }}
          />

          {/* Stats */}
          <div style={{ marginBottom: "8px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
                marginBottom: "4px",
              }}
            >
              <span style={{ color: "#666" }}>Cuộc hội thoại</span>
              <span style={{ fontWeight: "500" }}>0 / 2,000</span>
            </div>
            <div
              style={{
                height: "4px",
                background: "#f0f0f0",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "0%",
                  height: "100%",
                  background: "#6c3fb5",
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "14px",
              marginBottom: "4px",
              color: "#ff7a45",
            }}
          >
            <span>Ngày làm mới dữ liệu gói:</span>
            <span style={{ fontWeight: "500" }}>15/12/2025</span>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            gap: "8px",
            justifyContent: "space-between",
          }}
        >
          <Button
            icon={<SwapOutlined rotate={90} />}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            Gần nhất
          </Button>
          <Button
            icon={<FilterOutlined />}
            style={{ display: "flex", alignItems: "center", gap: "4px" }}
          >
            Lọc
          </Button>
        </div>

        {/* Chat List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {chats.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                padding: "40px 20px",
              }}
            >
              <div
                style={{
                  width: "100px",
                  height: "100px",
                  background: "#f5f5f5",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                  position: "relative",
                }}
              >
                <span style={{ fontSize: "40px" }}>📦</span>
                <div
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "-8px",
                    width: "32px",
                    height: "32px",
                    background: "#e3f2fd",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: "16px" }}>✈️</span>
                </div>
              </div>
              <p
                style={{
                  fontSize: "14px",
                  color: "#666",
                  textAlign: "center",
                  margin: 0,
                }}
              >
                Bạn không có cuộc hội thoại nào đang diễn ra
              </p>
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #f0f0f0",
                  cursor: "pointer",
                  background:
                    selectedChat?.id === chat.id ? "#f5f5ff" : "transparent",
                }}
              >
                <div style={{ display: "flex", gap: "12px" }}>
                  <Badge dot status="success">
                    <Avatar size={48} src={chat.avatar} />
                  </Badge>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ fontWeight: "500", fontSize: "14px" }}>
                        {chat.name}
                      </span>
                      <span style={{ fontSize: "12px", color: "#999" }}>
                        {chat.time}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "13px",
                        color: "#666",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {chat.lastMessage}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Sider>

      {/* Main Content */}
      <Content
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px",
        }}
      >
        {!selectedChat ? (
          <div style={{ maxWidth: "600px", textAlign: "center" }}>
            {/* Carousel */}
            <div style={{ position: "relative", marginBottom: "40px" }}>
              <Carousel
                ref={carouselRef}
                dots={{ className: "custom-dots" }}
                autoplay
              >
                {onboardingSlides.map((slide, index) => (
                  <div key={index}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: "20px",
                      }}
                    >
                      {/* Illustration */}
                      <div
                        style={{
                          width: "400px",
                          height: "300px",
                          background:
                            "linear-gradient(135deg, #e8e3f5 0%, #f0ecfa 100%)",
                          borderRadius: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "24px",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        {index === 0 && (
                          <div
                            style={{
                              fontSize: "120px",
                              filter:
                                "drop-shadow(0 4px 8px rgba(108, 63, 181, 0.2))",
                            }}
                          >
                            🤖
                          </div>
                        )}
                        {index === 1 && (
                          <div style={{ fontSize: "120px" }}>⏰</div>
                        )}
                        {index === 2 && (
                          <div style={{ fontSize: "120px" }}>🔗</div>
                        )}
                      </div>

                      {/* Title */}
                      <h2
                        style={{
                          fontSize: "24px",
                          fontWeight: "600",
                          color: "#6c3fb5",
                          marginBottom: "12px",
                        }}
                      >
                        {slide.title}
                      </h2>

                      {/* Description */}
                      <p
                        style={{
                          fontSize: "15px",
                          color: "#666",
                          lineHeight: "1.6",
                          marginBottom: "24px",
                        }}
                      >
                        {slide.description}
                      </p>
                    </div>
                  </div>
                ))}
              </Carousel>

              {/* Navigation Arrows */}
              <Button
                type="text"
                icon={<LeftOutlined />}
                onClick={() => carouselRef.current?.prev()}
                style={{
                  position: "absolute",
                  left: "-50px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "24px",
                  color: "#6c3fb5",
                  width: "40px",
                  height: "40px",
                }}
              />
              <Button
                type="text"
                icon={<RightOutlined />}
                onClick={() => carouselRef.current?.next()}
                style={{
                  position: "absolute",
                  right: "-50px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "24px",
                  color: "#6c3fb5",
                  width: "40px",
                  height: "40px",
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", background: "white" }}>
            {/* Chat conversation UI would go here */}
            <p>Chat with {selectedChat.name}</p>
          </div>
        )}
      </Content>

      <style jsx global>{`
        .custom-dots {
          bottom: -30px;
        }
        .custom-dots li button {
          background: #d9d9d9;
        }
        .custom-dots li.slick-active button {
          background: #6c3fb5;
        }
      `}</style>
    </Layout>
  );
}

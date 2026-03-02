"use client";

import {
  Card,
  Input,
  Button,
  Avatar,
  Tag,
  Space,
  Dropdown,
  App,
} from "antd";
import {
  SearchOutlined,
  FilterOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  PlusOutlined,
  SettingOutlined,
  DeleteOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useState, useEffect } from "react";
import CreateChatbotModal from "@/lib/components/popup/CreateChatbot";
import { listChatbots, deleteChatbot, getAvatarUrl } from "@/lib/api";
import { useRouter } from "next/navigation";

const platformIcons = {
  facebook: (
    <img
      src="/Messenger.png"
      alt="Facebook"
      style={{ width: '16px', height: '16px', objectFit: 'contain' }}
    />
  ),
  instagram: (
    <img
      src="/Instagram.png"
      alt="Instagram"
      style={{ width: '16px', height: '16px', objectFit: 'contain' }}
    />
  ),
  zalo: (
    <img
      src="/Zalo.png"
      alt="Zalo"
      style={{ width: '16px', height: '16px', objectFit: 'contain' }}
    />
  )
};

export default function ChatbotPage() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const [viewMode, setViewMode] = useState("grid");
  const [selectedFilter, setSelectedFilter] = useState("newest");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [chatbots, setChatbots] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filterPurpose, setFilterPurpose] = useState(null);
  const [allBots, setAllBots] = useState([]);

  useEffect(() => {
    // Load chatbots for current account
    (async () => {
      try {
        const accountId =
          typeof window !== "undefined"
            ? localStorage.getItem("accountId")
            : null;
        if (!accountId) return;
        const res = await listChatbots(accountId);
        if (res && res.data) {
          // Map avatar path to full URL if needed
          const bots = res.data.map((b) => ({
            ...b,
            avatar: getAvatarUrl(b.avatar_url) || "/bg-login.jpg",
            lastUpdated: b.updated_at
              ? new Date(b.updated_at).toLocaleString()
              : "",
            status: b.purpose || "",
            platforms: b.platforms || [],
          }));
          setAllBots(bots);
          setChatbots(bots);
        }
      } catch (e) {
        console.error("Failed to load chatbots", e);
      }
    })();
  }, []);

  useEffect(() => {
    // Apply search and filters
    let filtered = allBots;

    if (searchText) {
      filtered = filtered.filter((b) =>
        b.name.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    if (filterPurpose) {
      filtered = filtered.filter((b) => b.purpose === filterPurpose);
    }

    // Apply sort (newest/oldest)
    if (selectedFilter === "oldest") {
      filtered = [...filtered].sort(
        (a, b) => new Date(a.updated_at) - new Date(b.updated_at)
      );
    } else {
      filtered = [...filtered].sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
      );
    }

    setChatbots(filtered);
  }, [searchText, filterPurpose, selectedFilter, allBots]);

  const handleDelete = async (botId) => {
    modal.confirm({
      title: "Xác nhận xóa chatbot",
      content:
        "Bạn có chắc muốn xóa chatbot này? Hành động này không thể hoàn tác.",
      okText: "Xóa",
      cancelText: "Hủy",
      okType: "danger",
      onOk: async () => {
        try {
          const accountId =
            typeof window !== "undefined"
              ? localStorage.getItem("accountId")
              : null;
          if (!accountId) return;
          await deleteChatbot(accountId, botId);
          setAllBots((prev) => prev.filter((b) => b.id !== botId));
          setChatbots((prev) => prev.filter((b) => b.id !== botId));
          message.success("Chatbot đã được xóa");
        } catch (e) {
          console.error("Failed to delete chatbot", e);
          message.error("Xóa chatbot thất bại");
        }
      },
    });
  };

  const filterMenu = {
    items: [
      { key: "newest", label: "Mới nhất" },
      { key: "oldest", label: "Cũ nhất" },
    ],
    onClick: ({ key }) => setSelectedFilter(key),
  };

  // Get unique purposes from chatbots
  const uniquePurposes = [
    ...new Set(allBots.map((b) => b.purpose).filter(Boolean)),
  ];
  const categoryMenu = {
    items: [
      { key: "all", label: "Tất cả" },
      ...uniquePurposes.map((p) => ({
        key: p,
        label: p === "message" ? "Trả lời tin nhắn" : "Trả lời bình luận",
      })),
    ],
    onClick: ({ key }) => setFilterPurpose(key === "all" ? null : key),
  };

  const ChatbotCardGrid = ({ bot }) => (
    <Card
      hoverable
      style={{
        borderRadius: "8px",
        border: "1px solid #f0f0f0",
      }}
      onClick={() =>
        router.push(`/dashboard/training-chatbot/${bot.id}/overview`)
      }
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
        <Avatar size={48} src={bot.avatar} />
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
              {bot.name}
            </h3>
            <Space size={12}>
              <SettingOutlined
                onClick={() =>
                  router.push(`/dashboard/training-chatbot/${bot.id}/overview`)
                }
                style={{ fontSize: "16px", color: "#666", cursor: "pointer" }}
              />
              <DeleteOutlined
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(bot.id);
                }}
                style={{
                  fontSize: "16px",
                  color: "#ff4d4f",
                  cursor: "pointer",
                }}
              />
            </Space>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '8px'
          }}>
            <Tag color="purple" style={{ borderRadius: "4px", fontSize: "12px", margin: 0 }}>
              {bot.status === "message" ? "Trả lời tin nhắn" : "Trả lời bình luận"}
            </Tag>

            {/* Platform Icons */}
            <Space size={12}>
              {bot.platforms?.map(p => (
                <span key={p} style={{ display: 'flex' }}>{platformIcons[p]}</span>
              ))}
            </Space>
          </div>
          <div style={{ marginTop: "12px", fontSize: "13px", color: "#666" }}>
            <div>Ngày cập nhật</div>
            <div style={{ marginTop: "4px" }}>{bot.lastUpdated}</div>
          </div>
        </div>
      </div>
    </Card>
  );

  const ChatbotCardList = ({ bot }) => (
    <Card
      hoverable
      style={{
        borderRadius: "8px",
        border: "1px solid #f0f0f0",
        marginBottom: "12px",
      }}
      onClick={() =>
        router.push(`/dashboard/training-chatbot/${bot.id}/overview`)
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            flex: 1,
          }}
        >
          <Avatar size={48} src={bot.avatar} />
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
              {bot.name}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <Tag color="purple" style={{ borderRadius: "4px", fontSize: "12px", margin: 0 }}>
                {bot.status === "message" ? "Trả lời tin nhắn" : "Trả lời bình luận"}
              </Tag>

              <Space size={4}>
                {bot.platforms?.map(p => (
                  <span key={p} style={{ display: 'flex' }}>{platformIcons[p]}</span>
                ))}
              </Space>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
          }}
        >
          <div style={{ fontSize: "13px", color: "#666", textAlign: "right" }}>
            <div>Ngày cập nhật</div>
            <div style={{ marginTop: "4px" }}>{bot.lastUpdated}</div>
          </div>
          <Space size={16}>
            <SettingOutlined
              onClick={() =>
                router.push(`/dashboard/training-chatbot/${bot.id}/overview`)
              }
              style={{ fontSize: "18px", color: "#666", cursor: "pointer" }}
            />
            <DeleteOutlined
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(bot.id);
              }}
              style={{ fontSize: "18px", color: "#ff4d4f", cursor: "pointer" }}
            />
          </Space>
        </div>
      </div>
    </Card>
  );

  return (
    <div
      style={{
        padding: "24px",
        backgroundColor: "#f9f9f9",
        overflowY: "auto",
        height: "calc(100vh - 100px)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            fontWeight: "bold",
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "28px" }}>🤖</span>
          Đào tạo chatbot
        </h1>

        <div style={{ display: "flex", gap: "12px" }}>
          {/* View Mode Toggle */}
          <Space.Compact>
            <Button
              icon={<AppstoreOutlined />}
              type={viewMode === "grid" ? "primary" : "default"}
              onClick={() => setViewMode("grid")}
              style={{
                background: viewMode === "grid" ? "#6c3fb5" : "white",
                borderColor: viewMode === "grid" ? "#6c3fb5" : "#d9d9d9",
              }}
            />
            <Button
              icon={<UnorderedListOutlined />}
              type={viewMode === "list" ? "primary" : "default"}
              onClick={() => setViewMode("list")}
              style={{
                background: viewMode === "list" ? "#6c3fb5" : "white",
                borderColor: viewMode === "list" ? "#6c3fb5" : "#d9d9d9",
              }}
            />
          </Space.Compact>

          {/* Create Button */}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setIsModalOpen(true)}
            style={{
              background: "#6c3fb5",
              borderColor: "#6c3fb5",
              height: "32px",
              fontWeight: "500",
            }}
          >
            Tạo chatbot
          </Button>
          <CreateChatbotModal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onCreated={(newBot) => {
              // Prepend new bot and refresh
              const bot = {
                id: newBot.id,
                name: newBot.name,
                avatar: getAvatarUrl(newBot.avatar_url) || "/bg-login.jpg",
                status: newBot.purpose || "",
                lastUpdated: newBot.updated_at
                  ? new Date(newBot.updated_at).toLocaleString()
                  : "",
              };
              setChatbots((prev) => [bot, ...prev]);
              setAllBots((prev) => [bot, ...prev]);
            }}
          />
        </div>
      </div>
      <hr />

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          margin: "20px 0",
          flexWrap: "wrap",
        }}
      >
        <Input
          placeholder="Tìm kiếm bot theo tên"
          prefix={<SearchOutlined style={{ color: "#999" }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            width: "320px",
            height: "40px",
          }}
        />
        <Dropdown menu={filterMenu} trigger={["click"]}>
          <Button
            icon={<FilterOutlined />}
            style={{
              height: "40px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            Mới nhất
          </Button>
        </Dropdown>
        <Dropdown menu={categoryMenu} trigger={["click"]}>
          <Button
            icon={<DownOutlined />}
            style={{
              height: "40px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            Chọn phân loại
          </Button>
        </Dropdown>
      </div>

      {/* Chatbot List/Grid */}
      {viewMode === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "20px",
          }}
        >
          {chatbots.map((bot) => (
            <ChatbotCardGrid
              key={bot.id}
              bot={bot}
              onOpen={(id) =>
                router.push(`/dashboard/training-chatbot/${id}/overview`)
              }
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div>
          {chatbots.map((bot) => (
            <ChatbotCardList key={bot.id} bot={bot} />
          ))}
        </div>
      )}
    </div>
  );
}

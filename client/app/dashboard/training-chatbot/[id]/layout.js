"use client";

import { Layout, Menu, Button, Select, Avatar, Modal, Input, message } from "antd";
import {
  ArrowLeftOutlined,
  AppstoreFilled,
  ThunderboltOutlined,
  PictureOutlined,
  CommentOutlined,
  TagOutlined,
  HistoryOutlined,
  FacebookFilled,
  GlobalOutlined,
  DatabaseOutlined,
  InteractionOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { useMemo, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import React from "react";
import { listChatbots, getAvatarUrl } from "@/lib/api";

const { Sider, Content } = Layout;

// Danh sách các mục menu, thêm path để điều hướng
const trainingMenuItems = [
  {
    key: "training-setup",
    label: "Thiết lập nhanh",
    type: "group",
    children: [
      {
        key: "data-training",
        icon: <DatabaseOutlined />,
        label: "Dữ liệu huấn luyện",
        path: "data-training",
      },
      {
        key: "platform-intergrate",
        icon: <InteractionOutlined />,
        label: "Tích hợp nền tảng",
        path: "platform-intergrate",
      },
      {
        key: "test-bot",
        icon: <RobotOutlined />,
        label: "Test bot",
        path: "test-bot",
      },
    ],
  },
  {
    key: "advanced-settings",
    label: "Cài đặt nâng cao",
    type: "group",
    children: [
      {
        key: "overview",
        icon: <AppstoreFilled />,
        label: "Tổng quan",
        path: "overview",
      },
      {
        key: "sales-script",
        icon: <ThunderboltOutlined />,
        label: "Kịch bản chốt sale",
        path: "sales-script",
      },
      {
        key: "media",
        icon: <PictureOutlined />,
        label: "Thư viện ảnh",
        path: "media",
      },
      {
        key: "quick-reply",
        icon: <CommentOutlined />,
        label: "Tin nhắn nhanh",
        path: "quick-reply",
      },
      {
        key: "tags",
        icon: <TagOutlined />,
        label: "Quản lý tags",
        path: "tags",
      },
      {
        key: "edit-history",
        icon: <HistoryOutlined />,
        label: "Lịch sử chỉnh sửa",
        path: "edit-history",
      },
    ],
  },
  {
    key: "development",
    label: "Development",
    type: "group",
    children: [
      {
        key: "facebook-ads",
        icon: <FacebookFilled />,
        label: "Tool Ads Facebook",
        path: "facebook-ads",
      },
      {
        key: "website",
        icon: <GlobalOutlined />,
        label: "Website",
        path: "website",
      },
    ],
  },
];

// Hàm để lấy key đã chọn từ pathname
const getSelectedKeyFromPath = (pathname, items) => {
  const parts = pathname.split("/");
  const currentPathSegment = parts[parts.length - 1];

  for (const group of items) {
    if (group.children) {
      for (const item of group.children) {
        if (item.path === currentPathSegment) {
          return item.key;
        }
      }
    }
  }

  return "overview";
};

export default function TrainingLayout({ children, params }) {
  const router = useRouter();
  const pathname = usePathname();
  const { id } = React.use(params);

  const [bots, setBots] = useState([]);
  const [currentBot, setCurrentBot] = useState(null);
  const [loadingBots, setLoadingBots] = useState(false);

  const backToBotList = () => {
    router.push("/dashboard/training-chatbot");
  }

  // Fetch list of chatbots and set the current bot
  useEffect(() => {
    const fetchBots = async () => {
      try {
        const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;
        if (!accountId) return;
        setLoadingBots(true);
        const result = await listChatbots(accountId);
        if (result.success && Array.isArray(result.data)) {
          setBots(result.data);
          const chosen = result.data.find(b => b.id === id) || result.data[0] || null;
          setCurrentBot(chosen);
        }
      } catch (e) {
        console.error('Failed to fetch chatbots', e);
      } finally {
        setLoadingBots(false);
      }
    };

    fetchBots();
  }, [id]);

  useEffect(() => {
    if (!currentBot && bots.length) {
      const chosen = bots.find(b => b.id === id) || bots[0];
      setCurrentBot(chosen);
    }
  }, [bots]);
  // Dùng useMemo để tránh tính toán lại key mỗi lần render
  const selectedMenuKey = useMemo(
    () => getSelectedKeyFromPath(pathname, trainingMenuItems),
    [pathname]
  );

  const handleSelectBot = (newBotId) => {
    // Compute new path; preserve current child segment
    const parts = pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('training-chatbot');
    if (idx !== -1 && parts.length > idx + 1) {
      parts[idx + 1] = newBotId;
      const newPath = '/' + parts.join('/');
      router.push(newPath);
    } else {
      router.push(`/dashboard/training-chatbot/${newBotId}`);
    }
  };

  // Hàm để tạo menu items với Link
  const buildMenuItems = (items) => {
    return items.map((item) => {
      if (item.type === "group") {
        return {
          ...item,
          children: buildMenuItems(item.children || []),
        };
      }
      return {
        key: item.key,
        icon: item.icon,
        label: (
          <Link href={`/dashboard/training-chatbot/${id}/${item.path}`}>
            {item.label}
          </Link>
        ),
      };
    });
  };

  const menuItemsWithLinks = useMemo(
    () => buildMenuItems(trainingMenuItems),
    [id]
  );

  return (
    <div>
      <Layout style={{ background: "white", display: "flex" }}>
        {/* Left Sidebar */}
        <Sider
          width={220}
          style={{
            background: "white",
            borderRight: "1px solid #f0f0f0",
            overflow: "auto",
            height: "calc(100vh - 100px)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={backToBotList}
            />
            {/* Bot selector and display */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="bot-avatar-input"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                <Select
                  value={currentBot ? currentBot.id : undefined}
                  onChange={handleSelectBot}
                  loading={loadingBots}
                  optionLabelProp="label"
                >
                  {bots.map((b) => (
                    <Select.Option key={b.id} value={b.id} label={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar src={getAvatarUrl(b.avatar_url)} size={30} />
                        <span>{b.name}</span>
                      </div>
                    }>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar src={getAvatarUrl(b.avatar_url)} size={30} />
                        <span style={{ fontWeight: b.id === id ? 600 : 400 }}>{b.name}</span>
                      </div>
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedMenuKey]}
            style={{ borderRight: "none", padding: "8px 0" }}
            items={menuItemsWithLinks}
          />
        </Sider>

        {/* Main Content Area: Renders the child page */}
        <Content style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 100px)" }}>{children}</Content>
      </Layout>
    </div>
  );
}

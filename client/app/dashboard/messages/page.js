'use client';

import { Layout, Input, Select, Button } from 'antd';
import {
  SearchOutlined,
  DownOutlined,
  SwapOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import ChatBox from '@/lib/components/chat/ChatBox';
import ConversationItem from '@/lib/components/chat/ConversationItem';
import FilterModal from '@/lib/components/popup/FilterModal';

const { Sider, Content } = Layout;

export default function ChatManagementPage() {
  const [selectedChat, setSelectedChat] = useState(null);
  const [filterChannel, setFilterChannel] = useState('all');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Mock conversation data
  const [conversations, setConversations] = useState([
    {
      id: 1,
      name: 'Lý Phúc Thành',
      avatar: null,
      platform: 'facebook',
      tag: 'completed',
      secondaryTag: 'Tư vấn',
      lastMessage: 'Dạ, chúng tôi có nhiều sản phẩm mới. Bạn quan tâm đến lĩnh vực nào ạ?',
      time: '03/01',
      isUnread: true,
      messages: [
        {
          id: 1,
          text: 'Chào bạn. Hiện tại bạn cần tư vấn gì về sản phẩm?',
          sender: 'user',
          time: '14:30',
        },
        {
          id: 2,
          text: 'Tôi muốn biết về sản phẩm mới nhất',
          sender: 'bot',
          time: '14:32',
        },
        {
          id: 3,
          text: 'Dạ, chúng tôi có nhiều sản phẩm mới. Bạn quan tâm đến lĩnh vực nào ạ?',
          sender: 'user',
          time: '14:32',
        },
      ],
    },
    {
      id: 2,
      name: 'N/A',
      avatar: null,
      platform: 'instagram',
      tag: 'bot-failed',
      secondaryTag: 'Tư vấn',
      lastMessage: 'Bạn có thể gửi cho tôi thông tin chi tiết không?',
      time: '03/01',
      isUnread: false,
      messages: [
        {
          id: 1,
          text: 'Bạn có thể gửi cho tôi thông tin chi tiết không?',
          sender: 'user',
          time: '10:15',
        },
      ],
    },
    {
      id: 3,
      name: 'Hà Ngô',
      avatar: null,
      platform: 'zalo',
      tag: 'interacting',
      secondaryTag: 'Tư vấn',
      lastMessage: 'Dạ nhà hàng có các món Việt Nam và Á Đông rất đa dạng ạ',
      time: '03/01',
      isUnread: true,
      messages: [
        {
          id: 1,
          text: 'Xin chào! Menu của nhà hàng có những món gì?',
          sender: 'bot',
          time: '16:20',
        },
        {
          id: 2,
          text: 'Dạ nhà hàng có các món Việt Nam và Á Đông rất đa dạng ạ',
          sender: 'user',
          time: '16:21',
        },
      ],
    },
    {
      id: 4,
      name: 'N/A',
      avatar: null,
      platform: 'facebook',
      tag: 'no-response',
      secondaryTag: 'Tư vấn',
      lastMessage: 'Chúc bạn một ngày tốt lành!',
      time: '03/01',
      isUnread: false,
      messages: [
        {
          id: 1,
          text: 'Xin chào, bạn cần hỗ trợ gì không?',
          sender: 'user',
          time: '09:00',
        },
        {
          id: 2,
          text: 'Chúc bạn một ngày tốt lành!',
          sender: 'bot',
          time: '09:30',
        },
      ],
    },
    {
      id: 5,
      name: 'N/A',
      avatar: null,
      platform: 'facebook',
      tag: 'no-response',
      secondaryTag: 'Tư vấn',
      lastMessage: 'Chúc bạn một ngày tốt lành!',
      time: '03/01',
      isUnread: false,
      messages: [
        {
          id: 1,
          text: 'Xin chào, bạn cần hỗ trợ gì không?',
          sender: 'user',
          time: '09:00',
        },
        {
          id: 2,
          text: 'Chúc bạn một ngày tốt lành!',
          sender: 'bot',
          time: '09:30',
        },
      ],
    },
    {
      id: 6,
      name: 'N/A',
      avatar: null,
      platform: 'facebook',
      tag: 'no-response',
      secondaryTag: 'Tư vấn',
      lastMessage: 'Chúc bạn một ngày tốt lành!',
      time: '03/01',
      isUnread: false,
      messages: [
        {
          id: 1,
          text: 'Xin chào, bạn cần hỗ trợ gì không?',
          sender: 'user',
          time: '09:00',
        },
        {
          id: 2,
          text: 'Chúc bạn một ngày tốt lành!',
          sender: 'bot',
          time: '09:30',
        },
      ],
    },
    {
      id: 7,
      name: 'test',
      avatar: null,
      platform: 'facebook',
      tag: 'no-response',
      secondaryTag: 'Tư vấn',
      lastMessage: 'Chúc bạn một ngày tốt lành!',
      time: '03/01',
      isUnread: false,
      messages: [
        {
          id: 1,
          text: 'Xin chào, bạn cần hỗ trợ gì không?',
          sender: 'user',
          time: '09:00',
        },
        {
          id: 2,
          text: 'Chúc bạn một ngày tốt lành!',
          sender: 'bot',
          time: '09:30',
        },
      ],
    },
  ]);

  const handleSelectChat = (conversation) => {
    setSelectedChat(conversation);
    // Mark as read
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversation.id ? { ...conv, isUnread: false } : conv
      )
    );
  };

  // Persist sent messages back to conversations state so switching chats shows updated messages
  const handleSendMessage = (newMessage) => {
    if (!selectedChat) return;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === selectedChat.id
          ? {
            ...conv,
            messages: [...(conv.messages || []), newMessage],
            lastMessage: newMessage.text || 'Image',
            time: newMessage.time,
          }
          : conv
      )
    );
    setSelectedChat((prev) =>
      prev
        ? {
          ...prev,
          messages: [...(prev.messages || []), newMessage],
          lastMessage: newMessage.text || 'Image',
          time: newMessage.time,
        }
        : prev
    );
  };

  const renderLabel = (text, imgPath) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {imgPath && (
        <img
          src={imgPath}
          alt={text}
          style={{ width: '16px', height: '16px', objectFit: 'contain' }}
        />
      )}
      <span>{text}</span>
    </div>
  );

  const filteredConversations = conversations.filter((conv) => {
    if (filterChannel !== 'all' && conv.platform !== filterChannel) {
      return false;
    }
    if (searchQuery && !conv.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <Layout style={{ background: '#f0f2f5', height: 100 }}>
      {/* Left Sidebar - Chat List */}
      <Sider
        width={370}
        style={{
          background: 'white',
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
              Chat
            </h2>
            <Select
              value={filterChannel}
              suffixIcon={<DownOutlined />}
              style={{ width: '180px' }}
              options={[
                { value: 'all', label: renderLabel('Tất cả kênh chat', null) },
                { value: 'facebook', label: renderLabel('Facebook', '/Messenger.png') },
                { value: 'instagram', label: renderLabel('Instagram', '/Instagram.png') },
                { value: 'zalo', label: renderLabel('Zalo', '/Zalo.png') },
              ]}
              onChange={setFilterChannel}
            />
          </div>

          {/* Search */}
          <Input
            placeholder="Tìm kiếm theo tên khách hàng"
            prefix={<SearchOutlined style={{ color: '#999' }} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ marginBottom: '12px' }}
          />

          {/* Stats */}
          <div style={{ marginBottom: '8px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px',
                marginBottom: '4px',
              }}
            >
              <span style={{ color: '#666' }}>Cuộc hội thoại</span>
              <span style={{ fontWeight: '500' }}>
                {conversations.length} / 2,000
              </span>
            </div>
            <div
              style={{
                height: '4px',
                background: '#f0f0f0',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(conversations.length / 2000) * 100}%`,
                  height: '100%',
                  background: '#6c3fb5',
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              marginBottom: '4px',
              color: '#ff7a45',
            }}
          >
            <span>Ngày làm mới dữ liệu gói:</span>
            <span style={{ fontWeight: '500' }}>15/12/2025</span>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            gap: '8px',
            justifyContent: 'space-between',
          }}
        >
          <Button
            icon={<SwapOutlined rotate={90} />}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Gần nhất
          </Button>
          <Button
            icon={<FilterOutlined />}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => setIsFilterModalOpen(true)}
          >
            Lọc
          </Button>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: 'auto', height: `calc(100vh - 350px)`, overflowY: "auto" }}>
          {filteredConversations.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: '40px 20px',
              }}
            >
              <div
                style={{
                  width: '100px',
                  height: '100px',
                  background: '#f5f5f5',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: '40px' }}>📦</span>
              </div>
              <p
                style={{
                  fontSize: '14px',
                  color: '#666',
                  textAlign: 'center',
                  margin: 0,
                }}
              >
                Bạn không có cuộc hội thoại nào đang diễn ra
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedChat?.id === conv.id}
                isUnread={conv.isUnread}
                onClick={() => handleSelectChat(conv)}
              />
            ))
          )}
        </div>
      </Sider>

      {/* Main Content - Chat Box */}
      <Content style={{ display: 'flex' }}>
        {selectedChat ? (
          <ChatBox conversation={selectedChat} onSendMessage={handleSendMessage} />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f8f9fa',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '80px', marginBottom: '16px' }}>💬</div>
              <h2 style={{ fontSize: '24px', color: '#666', marginBottom: '8px' }}>
                Chọn một cuộc hội thoại
              </h2>
              <p style={{ fontSize: '14px', color: '#999' }}>
                Chọn từ danh sách bên trái để bắt đầu trò chuyện
              </p>
            </div>
          </div>
        )}
      </Content>

      {/* Filter Modal */}
      <FilterModal
        open={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
      />
    </Layout>
  );
}
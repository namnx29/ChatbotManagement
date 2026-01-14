'use client';

import { Layout, Input, Select, Button, App } from 'antd';
import {
  SearchOutlined,
  DownOutlined,
  SwapOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import {
  listIntegrations,
  listFacebookConversations,
  listZaloConversations,
  getConversationMessages,
  getZaloConversationMessages,
  sendConversationMessage,
  sendConversationAttachment,
  sendZaloConversationMessage,
  sendZaloConversationAttachment,
  markConversationRead,
  markZaloConversationRead
} from '@/lib/api';
import ChatBox from '@/lib/components/chat/ChatBox';
import ConversationItem from '@/lib/components/chat/ConversationItem';
import FilterModal from '@/lib/components/popup/FilterModal';

const { Sider, Content } = Layout;

// Constants
const SOCKET_URL = "https://elcom.vn";
const SOCKET_CONFIG = {
  transports: ['websocket', 'polling'],
  withCredentials: true,
};
const MESSAGE_TIMEOUT = 5000;
const MESSAGE_LIMIT = 50;
const MAX_CONVERSATIONS = 2000;

// Filter options configuration
const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả kênh chat', icon: null },
  { value: 'facebook', label: 'Facebook', icon: '/Messenger.png' },
  { value: 'instagram', label: 'Instagram', icon: '/Instagram.png' },
  { value: 'zalo', label: 'Zalo', icon: '/Zalo.png' },
];

export default function ChatManagementPage() {
  const { message } = App.useApp();
  // State
  const [selectedChat, setSelectedChat] = useState(null);
  const [filterChannel, setFilterChannel] = useState('all');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Refs
  const socketRef = useRef(null);
  const pendingTimeoutsRef = useRef(new Map());

  // Memoized values
  const accountId = useMemo(() =>
    typeof window !== 'undefined' ? localStorage.getItem('accountId') : null,
    []
  );

  // Utility: Map message document to client format
  const mapMessageDocToClient = useCallback((doc) => {
    const metadata = doc.metadata || {};
    let imageUrl = null;
    let attachment = null;

    // Check for image in metadata
    if (metadata.image) {
      imageUrl = metadata.image;
    }

    // Check for attachments array (from Facebook webhook)
    if (Array.isArray(metadata.attachments) && metadata.attachments.length > 0) {
      const a = metadata.attachments[0];
      const payload = a.payload || {};
      const url = payload.url || payload.attachment_url || payload.attachment_id || null;
      const type = a.type || null;
      const name = payload.filename || payload.name || (url ? url.split('/').pop() : null);

      attachment = { type, url, name };

      if (type?.includes('image') && url) {
        imageUrl = url;
      }
    }

    return {
      id: doc._id || Math.random().toString(),
      text: doc.text,
      sender: doc.direction === 'out' ? 'user' : 'customer',
      name: doc.sender_profile?.name || 'Khách hàng',
      avatar: doc.sender_profile?.avatar || null,
      time: new Date(doc.created_at || Date.now()).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      image: imageUrl,
      fileName: attachment?.name || null,
      attachment,
      pending: false,
      failed: false,
    };
  }, []);

  // Utility: Update conversation in list
  const updateConversationInList = useCallback((convId, updates) => {
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === convId);
      if (idx === -1) return prev;

      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...updates };

      // Move to top if lastMessage changed
      if (updates.lastMessage || updates.time) {
        const [item] = updated.splice(idx, 1);
        updated.unshift(item);
      }

      return updated;
    });
  }, []);

  // Utility: Clear pending timeout
  const clearPendingTimeout = useCallback((tempId) => {
    const timeout = pendingTimeoutsRef.current.get(tempId);
    if (timeout) {
      clearTimeout(timeout);
      pendingTimeoutsRef.current.delete(tempId);
    }
  }, []);

  // Socket: Initialize connection
  useEffect(() => {
    if (!accountId) return;

    socketRef.current = io(SOCKET_URL, SOCKET_CONFIG);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      // Clear all pending timeouts
      pendingTimeoutsRef.current.forEach(clearTimeout);
      pendingTimeoutsRef.current.clear();
    };
  }, [accountId]);

  // Socket: Handle new messages
  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;
    socket.off('new-message');

    const handleNewMessage = (payload) => {
      if (payload.direction === 'in') {
        playNotificationSound();
        showPushNotification(payload);
      }
      const convId = payload.conv_id;
      const newMsgClient = payload.message_doc ? mapMessageDocToClient(payload.message_doc) : null;

      if (!newMsgClient) return;

      // Extract profile info
      const profileInfo = {
        name: payload.direction === 'in'
          ? (payload.sender_profile?.name || 'Khách hàng')
          : (payload.recipient_profile?.name || payload.sender_profile?.name || 'Khách hàng'),
        avatar: payload.direction === 'in'
          ? (payload.sender_profile?.avatar || null)
          : (payload.recipient_profile?.avatar || payload.sender_profile?.avatar || null),
      };

      // Update or create conversation in sidebar
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === convId);

        if (idx === -1) {
          // Create new conversation
          return [{
            id: convId,
            ...profileInfo,
            platform: payload.platform,
            lastMessage: payload.message,
            time: new Date().toISOString(),
            isUnread: payload.direction !== 'out',
            messages: [],
            oa_id: payload.oa_id,
          }, ...prev];
        }

        // Update existing conversation
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessage: payload.message,
          time: new Date().toISOString(),
          isUnread: payload.direction !== 'out' && selectedChat?.id !== convId,
        };

        // Move to top
        const [item] = updated.splice(idx, 1);
        return [item, ...updated];
      });

      // Update selected chat messages
      if (selectedChat?.id === convId) {
        setSelectedChat(prev => {
          if (!prev) return prev;

          // Check if message already exists
          if (prev.messages?.some(m => m.id === newMsgClient.id)) {
            return prev;
          }

          // Handle outgoing messages (replace temp)
          if (newMsgClient.sender === 'user') {
            let foundTemp = false;
            const updatedMessages = prev.messages.map(m => {
              const isMatchingTemp =
                !foundTemp &&
                m.pending &&
                (
                  (!!m.image && !!newMsgClient.image) ||
                  ((m.text || '').trim() === (newMsgClient.text || '').trim())
                );

              if (isMatchingTemp) {
                foundTemp = true;
                clearPendingTimeout(m.id);
                if (m.image && !newMsgClient.image) {
                  try {
                    message.error('Hình ảnh không thể gửi được');
                  } catch (e) {
                    console.error('Failed to show image failure notification:', e);
                  }
                }

                return {
                  ...newMsgClient,
                  pending: false,
                  failed: false,
                  // Respect the server-provided image. If server didn't include it, do not keep the optimistic image.
                  image: newMsgClient.image || null,
                };
              }
              return m;
            });

            if (!foundTemp) {
              return {
                ...prev,
                messages: [...updatedMessages, newMsgClient]
              };
            }

            return { ...prev, messages: updatedMessages };
          }

          // Handle incoming messages (append)
          return {
            ...prev,
            messages: [...prev.messages, newMsgClient]
          };
        });
      }
    };

    socket.on('new-message', handleNewMessage);

    return () => socket.off('new-message');
  }, [selectedChat?.id, mapMessageDocToClient, clearPendingTimeout]);

  // Load initial conversations
  useEffect(() => {
    let mounted = true;

    const loadConversations = async () => {
      if (!accountId) return;

      try {
        setLoading(true);
        const result = await listIntegrations(accountId);
        const integrations = result?.data || [];

        const conversationPromises = integrations.map(async (integration) => {
          try {
            if (integration.platform === 'facebook') {
              const res = await listFacebookConversations(accountId, integration.oa_id);
              return (res?.data || []).map(c => ({
                id: c.id,
                name: c.name,
                avatar: c.avatar || integration.avatar_url,
                platform: 'facebook',
                lastMessage: c.lastMessage,
                time: c.time,
                isUnread: (c.unreadCount || 0) > 0,
                messages: [],
                oa_id: integration.oa_id,
              }));
            }

            if (integration.platform === 'zalo') {
              const res = await listZaloConversations(accountId, integration.oa_id);
              return (res?.data || []).map(c => ({
                id: c.id,
                name: c.name,
                avatar: c.avatar || integration.avatar_url,
                platform: 'zalo',
                lastMessage: c.lastMessage,
                time: c.time,
                isUnread: (c.unreadCount || 0) > 0,
                messages: [],
                oa_id: integration.oa_id,
              }));
            }

            // Unsupported platform or no conversation loader defined
            return [];
          } catch (error) {
            console.error(`Failed to load conversations for ${integration.oa_id}:`, error);
            return [];
          }
        });

        const conversationArrays = await Promise.all(conversationPromises);
        const allConversations = conversationArrays.flat();

        if (mounted) {
          setConversations(allConversations);
        }
      } catch (error) {
        console.error('Failed to load integrations:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadConversations();

    return () => {
      mounted = false;
    };
  }, [accountId]);

  // Handle chat selection
  const handleSelectChat = useCallback(async (conversation) => {
    setSelectedChat({ ...conversation, loadingMessages: true });

    try {
      let res;
      if (conversation.platform === 'zalo') {
        res = await getZaloConversationMessages(accountId, conversation.id, { limit: MESSAGE_LIMIT });
      } else {
        res = await getConversationMessages(accountId, conversation.id, { limit: MESSAGE_LIMIT });
      }

      const msgs = (res?.data || []).map(mapMessageDocToClient);

      // Mark as read in sidebar
      updateConversationInList(conversation.id, { isUnread: false });

      setSelectedChat({
        ...conversation,
        messages: msgs,
        loadingMessages: false
      });

      // Persist selection
      localStorage.setItem('lastSelectedConversation', conversation.id);

      // Mark as read on server
      if (conversation.platform === 'zalo') {
        await markZaloConversationRead(accountId, conversation.id);
      } else {
        await markConversationRead(accountId, conversation.id);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      setSelectedChat({
        ...conversation,
        messages: [],
        loadingMessages: false
      });
    }
  }, [accountId, mapMessageDocToClient, updateConversationInList]);

  // Handle sending messages
  const handleSendMessage = useCallback(async (newMessage) => {
    if (!selectedChat) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create optimistic temp message
    const tempMsg = {
      id: tempId,
      text: newMessage.text?.trim() || null,
      image: newMessage.image || null,
      sender: 'user',
      time: new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      pending: true,
      failed: false,
    };

    // Add temp message to UI
    setSelectedChat(prev => ({
      ...prev,
      messages: [...(prev.messages || []), tempMsg]
    }));

    // Update sidebar preview
    updateConversationInList(selectedChat.id, {
      lastMessage: newMessage.text || 'Đã gửi hình ảnh',
      time: new Date().toISOString()
    });

    // Set timeout for pending state
    const timeoutId = setTimeout(() => {
      setSelectedChat(prev => {
        if (!prev) return prev;

        const stillPending = prev.messages?.some(m => m.id === tempId && m.pending);

        if (stillPending) {
          console.warn('Socket confirmation timeout, removing pending state');
          return {
            ...prev,
            messages: prev.messages.map(m =>
              m.id === tempId ? { ...m, pending: false } : m
            )
          };
        }
        return prev;
      });

      pendingTimeoutsRef.current.delete(tempId);
    }, MESSAGE_TIMEOUT);

    pendingTimeoutsRef.current.set(tempId, timeoutId);

    try {
      // Send to API (platform-specific)
      if (selectedChat.platform === 'zalo') {
        if (newMessage.image) {
          await sendZaloConversationAttachment(accountId, selectedChat.id, newMessage.image, newMessage.text || null);
        } else {
          await sendZaloConversationMessage(accountId, selectedChat.id, newMessage.text);
        }
      } else {
        if (newMessage.image) {
          await sendConversationAttachment(
            accountId,
            selectedChat.id,
            newMessage.image,
            newMessage.text || null
          );
        } else {
          await sendConversationMessage(
            accountId,
            selectedChat.id,
            newMessage.text
          );
        }
      }

    } catch (error) {
      console.error('Send message failed:', error);

      // Clear timeout and mark as failed
      clearPendingTimeout(tempId);

      const isImageTooLarge = (error && (error.status === 413 || (error.body && error.body.error_code === 'IMAGE_TOO_LARGE') || (error.message && error.message.toLowerCase().includes('image must be less'))));

      if (isImageTooLarge) {
        // Remove the optimistic temp message
        setSelectedChat(prev => {
          if (!prev) return prev;
          return { ...prev, messages: (prev.messages || []).filter(m => m.id !== tempId) };
        });

        // Revert sidebar lastMessage/time to previous value
        const conv = conversations.find(c => c.id === selectedChat.id);
        const prevLast = conv ? conv.lastMessage : '';
        updateConversationInList(selectedChat.id, { lastMessage: prevLast, time: new Date().toISOString() });

        // Notify user
        try {
          message.error((error && (error.body && error.body.message)) || error.message || 'Hình ảnh vượt quá kích thước cho phép (1MB)');
        } catch (e) {
          console.error('Failed to show message notification:', e);
        }

        return;
      }

      setSelectedChat(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === tempId
            ? {
              ...m,
              failed: true,
              pending: false,
              errorMessage: error.message || 'Gửi tin nhắn thất bại'
            }
            : m
        )
      }));
    }
  }, [selectedChat, accountId, updateConversationInList, clearPendingTimeout]);

  // Memoized filtered conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      if (filterChannel !== 'all' && conv.platform !== filterChannel) {
        return false;
      }
      if (searchQuery && !conv.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [conversations, filterChannel, searchQuery]);

  // Render helper for select options
  const renderSelectLabel = useCallback((text, icon) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {icon && <img src={icon} alt={text} style={{ width: '16px' }} />}
      <span>{text}</span>
    </div>
  ), []);

  // Memoized select options
  const selectOptions = useMemo(() =>
    FILTER_OPTIONS.map(opt => ({
      value: opt.value,
      label: renderSelectLabel(opt.label, opt.icon)
    })),
    [renderSelectLabel]
  );

  // Empty states
  const renderEmptyState = useCallback((icon, message) => (
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
          background: icon === '⚠️' ? '#fff4e5' : '#f5f5f5',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}
      >
        <span style={{ fontSize: '40px' }}>{icon}</span>
      </div>
      <p style={{ fontSize: '14px', color: '#666', textAlign: 'center', margin: 0 }}>
        {message}
      </p>
    </div>
  ), []);

  useEffect(() => {
    const unreadCount = conversations.reduce((acc, conv) => acc + (conv.isUnread ? 1 : 0), 0);

    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Tin nhắn mới - Quản lý Chat`;
    } else {
      document.title = `Quản lý Chat`;
    }
  }, [conversations]);

  const playNotificationSound = () => {
    const audio = new Audio('/notification-sound.mp3');
    audio.play().catch(e => console.log("Trình duyệt chặn tự động phát âm thanh:", e));
  };

  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  }, []);

  const showPushNotification = (payload) => {
    if (Notification.permission === "granted" && document.hidden) {
      const notification = new Notification(payload.sender_profile?.name || "Tin nhắn mới", {
        body: payload.message,
        icon: payload.sender_profile?.avatar || "/logo.png",
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  };

  return (
    <Layout style={{ background: '#f0f2f5', height: 100 }}>
      {/* Left Sidebar */}
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
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Chat</h2>
            <Select
              value={filterChannel}
              suffixIcon={<DownOutlined />}
              style={{ width: '180px' }}
              options={selectOptions}
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
                {conversations.length} / {MAX_CONVERSATIONS.toLocaleString()}
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
                  width: `${Math.min((conversations.length / MAX_CONVERSATIONS) * 100, 100)}%`,
                  height: '100%',
                  background: '#6c3fb5',
                  transition: 'width 0.3s ease',
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
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
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
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!accountId ? (
            renderEmptyState(
              '⚠️',
              'Không tìm thấy tài khoản. Vui lòng đăng nhập hoặc chọn tài khoản để xem hội thoại.'
            )
          ) : filteredConversations.length === 0 ? (
            renderEmptyState('📦', 'Bạn không có cuộc hội thoại nào đang diễn ra')
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

      {/* Main Content */}
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
      <FilterModal open={isFilterModalOpen} onClose={() => setIsFilterModalOpen(false)} />
    </Layout>
  );
}
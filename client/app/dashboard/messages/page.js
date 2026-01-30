'use client';

import { Layout, Input, Select, Button, App } from 'antd';
import {
  SearchOutlined,
  DownOutlined,
  SwapOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from 'react';
import { io } from 'socket.io-client';
import {
  listAllConversations,
  getConversationMessages,
  sendConversationMessage,
  sendConversationAttachment,
  markConversationRead,
  getZaloConversationMessages,
  sendZaloConversationMessage,
  sendZaloConversationAttachment,
  markZaloConversationRead,
  fetchProfile,
} from '@/lib/api';
import ChatBox from '@/lib/components/chat/ChatBox';
import ConversationItem from '@/lib/components/chat/ConversationItem';
import FilterModal from '@/lib/components/popup/FilterModal';
import { useNotification } from '@/lib/context/NotificationContext';

const { Sider, Content } = Layout;

// Constants
const SOCKET_URL = "https://elcom.vn";
const SOCKET_CONFIG = {
  transports: ['websocket', 'polling'],
  withCredentials: true,
};
const MESSAGE_TIMEOUT = 5000;
const MESSAGE_LIMIT = 10;
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
  const { setActiveConversation, clearActiveConversation } = useNotification();
  // State
  const [selectedChat, setSelectedChat] = useState(null);
  const [filterChannel, setFilterChannel] = useState('all');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const handler = setTimeout(() => {
      startTransition(() => {
        setDebouncedSearch(searchQuery);
      });
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Refs
  const socketRef = useRef(null);
  const pendingTimeoutsRef = useRef(new Map());

  // Memoized values
  const accountId = useMemo(() =>
    typeof window !== 'undefined' ? localStorage.getItem('accountId') : null,
    []
  );

  const handleScrollPositionChange = useCallback((atBottom) => {
    setIsAtBottom(atBottom);
  }, []);

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

  useEffect(() => {
    if (!isAtBottom || !selectedChat) return;

    const conv = conversations.find(c => c.id === selectedChat.id);
    if (!conv || !conv.isUnread) return;

    // Mark as read when at bottom
    (async () => {
      try {
        updateConversationInList(selectedChat.id, { isUnread: false });
        window.dispatchEvent(new CustomEvent('reset-conversation-unread', {
          detail: { conversations: selectedChat.id }
        }));

        if (selectedChat.platform === 'zalo') {
          await markZaloConversationRead(accountId, selectedChat.id);
        } else {
          await markConversationRead(accountId, selectedChat.id);
        }
      } catch (e) {
        console.error('Failed to mark conversation read:', e);
      }
    })();
  }, [isAtBottom, selectedChat?.id, conversations, accountId, updateConversationInList]);

  // Utility: Clear pending timeout
  const clearPendingTimeout = useCallback((tempId) => {
    const timeout = pendingTimeoutsRef.current.get(tempId);
    if (timeout) {
      clearTimeout(timeout);
      pendingTimeoutsRef.current.delete(tempId);
    }
  }, []);

  // Handler: Update conversation when customer name is changed
  const handleConversationUpdate = useCallback((updatedConversation) => {
    // Update the selected chat
    setSelectedChat(prev => {
      if (!prev) return prev;
      return { ...prev, ...updatedConversation };
    });

    // Update the conversations list
    updateConversationInList(updatedConversation.id, {
      name: updatedConversation.name
    });
  }, [updateConversationInList]);

  // Socket: Initialize connection
  useEffect(() => {
    if (!accountId) return;

    socketRef.current = io(SOCKET_URL, {
      ...SOCKET_CONFIG,
      auth: {
        account_id: accountId,  // Pass account_id to backend for room filtering
      }
    });

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
            platform_status: { is_connected: true, disconnected_at: null }
          }, ...prev];
        }

        // Update existing conversation
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessage: payload.message,
          time: new Date().toISOString(),
          isUnread: payload.direction !== 'out' && (selectedChat?.id !== convId || !isAtBottom),
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

        // If the conversation is open and we received an incoming message, mark it as read on the server and in UI
        if (payload.direction === 'in' && isAtBottom) {
          (async () => {
            try {
              updateConversationInList(convId, { isUnread: false });
              window.dispatchEvent(new CustomEvent('reset-conversation-unread', { detail: { conversations: convId } }));
              if (payload.platform === 'zalo') {
                await markZaloConversationRead(accountId, convId);
              } else {
                await markConversationRead(accountId, convId);
              }
            } catch (e) {
              console.error('Failed to mark conversation read on incoming message:', e);
            }
          })();
        }
      }
    };

    socket.on('new-message', handleNewMessage);

    return () => socket.off('new-message');
  }, [selectedChat?.id, mapMessageDocToClient, clearPendingTimeout, accountId, updateConversationInList, isAtBottom,]);

  // Socket: conversation lock/unlock/request-access events
  useEffect(() => {
    if (!socketRef.current) return;
    const socket = socketRef.current;

    const handleLocked = (payload) => {
      const convId = payload.conv_id;
      // Update sidebar
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, current_handler: payload.handler, lock_expires_at: payload.lock_expires_at } : c));
      // Update open chat if selected
      if (selectedChat?.id === convId) {
        setSelectedChat(prev => prev ? { ...prev, current_handler: payload.handler, lock_expires_at: payload.lock_expires_at } : prev);
      }
    };

    const handleUnlocked = (payload) => {
      const convId = payload.conv_id;
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, current_handler: null, lock_expires_at: null } : c));
      if (selectedChat?.id === convId) {
        setSelectedChat(prev => prev ? { ...prev, current_handler: null, lock_expires_at: null } : prev);
      }
    };

    const handleRequestAccess = async (payload) => {
      // If you receive request-access (as handler), show a notification
      const convId = payload.conv_id;
      if (payload.requester && selectedChat?.id === convId) {
        try {
          const result = await fetchProfile(payload.requester);
          if (result.success && result.data) {
            message.info(`Người dùng ${result.data.name} yêu cầu quyền truy cập`);
          }
        } catch (e) { }
      }
    };

    // const handleLockFailed = (payload) => {
    //   try { message.error(`Cuộc trò chuyện đang được xử lý bởi ${payload.current_handler?.name || 'ai đó'}`); } catch (e) { }
    // };

    socket.on('conversation-locked', handleLocked);
    socket.on('conversation-unlocked', handleUnlocked);
    socket.on('request-access', handleRequestAccess);
    // socket.on('lock-failed', handleLockFailed);

    return () => {
      socket.off('conversation-locked', handleLocked);
      socket.off('conversation-unlocked', handleUnlocked);
      socket.off('request-access', handleRequestAccess);
      // socket.off('lock-failed', handleLockFailed);
    };
  }, [selectedChat?.id, message]);

  // Load initial conversations
  useEffect(() => {
    let mounted = true;

    const loadConversations = async () => {
      if (!accountId) return;

      try {
        setLoading(true);
        const res = await listAllConversations(accountId);
        const allConversations = (res?.data || []).map(c => ({
          id: c.id,
          name: c?.name || 'Khách hàng',
          avatar: c.avatar,
          platform: c.platform,
          lastMessage: c.lastMessage,
          time: c.time,
          isUnread: (c.unreadCount || 0) > 0,
          messages: [],
          oa_id: c.oa_id,
          customer_id: c.customer_id,
          current_handler: c.current_handler || null,
          lock_expires_at: c.lock_expires_at || null,
          platform_status: c.platform_status || { is_connected: true, disconnected_at: null },
          chatbot_info: c.chatbot_info || {}
        }));

        const sortedConversations = allConversations.sort((a, b) => {
          const timeA = a.time ? new Date(a.time).getTime() : 0;
          const timeB = b.time ? new Date(b.time).getTime() : 0;
          return timeB - timeA;
        });

        if (mounted) {
          setConversations(sortedConversations);
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
    // Set this conversation as active so notifications don't trigger for it
    setActiveConversation(conversation.id);
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
        loadingMessages: false,
        loadingMore: false,
        skip: msgs.length,
        limit: MESSAGE_LIMIT,
        hasMore: msgs.length === MESSAGE_LIMIT,
      });

      // Persist selection
      localStorage.setItem('lastSelectedConversation', conversation.id);

      // Mark as read on server
      if (conversation.platform === 'zalo') {
        await markZaloConversationRead(accountId, conversation.id);
      } else {
        await markConversationRead(accountId, conversation.id);
      }
      window.dispatchEvent(new CustomEvent('reset-conversation-unread', {
        detail: { conversationId: conversation.id }
      }));
    } catch (error) {
      console.error('Failed to load messages:', error);
      setSelectedChat({
        ...conversation,
        messages: [],
        loadingMessages: false,
        loadingMore: false,
        skip: 0,
        limit: MESSAGE_LIMIT,
        hasMore: false,
      });
    }
  }, [accountId, mapMessageDocToClient, updateConversationInList, setActiveConversation]);

  // Handler to load older messages (lazy-load / infinite scroll)
  const handleLoadMoreMessages = useCallback(async () => {
    if (!selectedChat) return [];
    if (selectedChat.loadingMore) return [];
    if (!selectedChat.hasMore) return [];

    setSelectedChat(prev => ({ ...prev, loadingMore: true }));

    try {
      let res;
      if (selectedChat.platform === 'zalo') {
        res = await getZaloConversationMessages(accountId, selectedChat.id, { limit: selectedChat.limit, skip: selectedChat.skip });
      } else {
        res = await getConversationMessages(accountId, selectedChat.id, { limit: selectedChat.limit, skip: selectedChat.skip });
      }

      const newMsgs = (res?.data || []).map(mapMessageDocToClient);

      // Prepend older messages
      setSelectedChat(prev => ({
        ...prev,
        messages: [...newMsgs, ...(prev.messages || [])],
        skip: (prev.skip || 0) + newMsgs.length,
        hasMore: newMsgs.length === (prev.limit || MESSAGE_LIMIT),
        loadingMore: false,
      }));

      return newMsgs;
    } catch (error) {
      console.error('Failed to load more messages:', error);
      setSelectedChat(prev => ({ ...prev, loadingMore: false }));
      return [];
    }
  }, [selectedChat, accountId, mapMessageDocToClient]);

  // Effect to manage active conversation state
  useEffect(() => {
    return () => {
      // Clear active conversation when page unmounts
      clearActiveConversation();
    };
  }, [clearActiveConversation]);

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

      try {
        updateConversationInList(selectedChat.id, { isUnread: false });
        if (selectedChat.platform === 'zalo') {
          await markZaloConversationRead(accountId, selectedChat.id);
        } else {
          await markConversationRead(accountId, selectedChat.id);
        }
      } catch (e) {
        console.error('Failed to mark conversation read after send:', e);
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
          message.error('Hình ảnh vượt quá kích thước cho phép (1MB)');
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

  const filteredConversations = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return conversations.filter(conv => {
      if (filterChannel !== 'all' && conv.platform !== filterChannel) return false;
      if (query && !conv.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [conversations, filterChannel, debouncedSearch]);

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
            Chưa đọc
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
          <ChatBox
            conversation={selectedChat}
            onSendMessage={handleSendMessage}
            onLoadMore={handleLoadMoreMessages}
            onScrollPositionChange={handleScrollPositionChange}
            onConversationUpdate={handleConversationUpdate}
            socket={socketRef.current}
            accountId={accountId}
          />
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
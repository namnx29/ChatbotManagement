'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const NotificationContext = createContext();

const SOCKET_URL = "https://elcom.vn";
const SOCKET_CONFIG = {
  transports: ['websocket', 'polling'],
  withCredentials: true,
};

export function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnread, setHasUnread] = useState(false);
  const socketRef = useRef(null);
  const conversationUnreadCountsRef = useRef({});
  const currentActiveConversationRef = useRef(null);

  const accountId = typeof window !== 'undefined' ? localStorage.getItem('accountId') : null;

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    const audio = new Audio('/notification-sound.mp3');
    audio.play().catch(e => console.log("Trình duyệt chặn tự động phát âm thanh:", e));
  }, []);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  }, []);

  // Show browser push notification
  const showPushNotification = useCallback((payload) => {
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
  }, []);

  // Update unread count in browser tab title and state
  const updateUnreadCount = useCallback((count) => {
    setUnreadCount(count);
    setHasUnread(count > 0);
    
    if (count > 0) {
      document.title = `(${count}) Tin nhắn mới - Quản lý Chat`;
    } else {
      document.title = `Quản lý Chat`;
    }
  }, []);

  // Set active conversation (called when user opens a conversation)
  const setActiveConversation = useCallback((conversationId) => {
    currentActiveConversationRef.current = conversationId;
  }, []);

  // Clear active conversation (called when user closes/switches away from conversation)
  const clearActiveConversation = useCallback(() => {
    currentActiveConversationRef.current = null;
  }, []);

  // Initialize socket connection and setup message listener
  useEffect(() => {
    if (!accountId) return;

    const socket = io(SOCKET_URL, SOCKET_CONFIG);
    socketRef.current = socket;

    // Setup new message listener
    const handleNewMessage = (payload) => {
      if (payload.direction === 'in') {
        const convId = payload.conv_id;
        const isCurrentActiveConversation = currentActiveConversationRef.current === convId;

        // Only show notification if message is not from the active conversation
        if (!isCurrentActiveConversation) {
          playNotificationSound();
          showPushNotification(payload);
          
          // Update conversation-level unread count
          if (!conversationUnreadCountsRef.current[convId]) {
            conversationUnreadCountsRef.current[convId] = 0;
          }
          conversationUnreadCountsRef.current[convId]++;
          
          // Calculate total unread and update title
          const totalUnread = Object.values(conversationUnreadCountsRef.current).reduce((a, b) => a + b, 0);
          updateUnreadCount(totalUnread);
        }
        // If message is from the active conversation, don't show notification or increment unread
      }
    };

    socket.on('new-message', handleNewMessage);

    return () => {
      if (socket) {
        socket.off('new-message', handleNewMessage);
        socket.disconnect();
      }
    };
  }, [accountId, playNotificationSound, showPushNotification, updateUnreadCount]);

  // Listen for reset-conversation-unread event
  useEffect(() => {
    const handleResetConversationUnread = (event) => {
      const convId = event.detail?.conversationId;
      if (convId && conversationUnreadCountsRef.current[convId]) {
        delete conversationUnreadCountsRef.current[convId];
        
        // Calculate total unread
        const totalUnread = Object.values(conversationUnreadCountsRef.current).reduce((a, b) => a + b, 0);
        updateUnreadCount(totalUnread);
      }
    };

    window.addEventListener('reset-conversation-unread', handleResetConversationUnread);
    return () => window.removeEventListener('reset-conversation-unread', handleResetConversationUnread);
  }, [updateUnreadCount]);

  const value = {
    unreadCount,
    hasUnread,
    updateUnreadCount,
    playNotificationSound,
    showPushNotification,
    socketRef,
    setActiveConversation,
    clearActiveConversation,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}

'use client';

import { Avatar, Input, Button, Switch, Image, Alert, App, Modal, Form } from 'antd';
import {
	SendOutlined,
	PictureOutlined,
	InfoCircleOutlined,
	RobotOutlined,
	EditOutlined,
	TagFilled,
	ArrowDownOutlined,
	GlobalOutlined
} from '@ant-design/icons';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import CustomerNameChangeModal from '@/lib/components/popup/CustomerNameChangeModal';
import { getAvatarUrl, fetchProfile, setConversationBotReply, saveInfoConversation } from '@/lib/api';

dayjs.locale('vi');
const { TextArea } = Input;

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
	),
	widget: (
		<GlobalOutlined style={{ fontSize: '16px' }} />
	),
};

const tagColors = {
	completed: '#52c41a',
	'bot-failed': '#ff4d4f',
	'no-response': '#8c8c8c',
	interacting: '#fa8c16',
};

const getDateLabel = (date) => {
	if (!date) return "";

	let targetDate = dayjs(date);

	if (!targetDate.isValid() && typeof date === 'string' && date.length === 24) {
		const timestamp = parseInt(date.substring(0, 8), 16) * 1000;
		targetDate = dayjs(timestamp);
	}

	if (!targetDate.isValid()) return "";

	const now = dayjs();
	if (targetDate.isSame(now, 'day')) return 'Hôm nay';
	if (targetDate.isSame(now.subtract(1, 'day'), 'day')) return 'Hôm qua';
	if (targetDate.isSame(now, 'year')) return targetDate.format('DD [tháng] MM');
	return targetDate.format('DD/MM/YYYY');
};

const getRawDate = (msg) => {
	if (!msg) return null;
	const date = msg.created_at || msg.id || msg._id;

	if (typeof date === 'string' && date.length === 24 && !dayjs(date).isValid()) {
		return parseInt(date.substring(0, 8), 16) * 1000;
	}
	return date;
};

export default function ChatBox({ conversation, onSendMessage, onLoadMore, onScrollPositionChange, onConversationUpdate, socket, accountId }) {
	const { modal, message } = App.useApp();
	const [form] = Form.useForm();
	const [ChatMessage, setChatMessage] = useState('');
	const [autoReply, setAutoReply] = useState(() => {
		// initialize from conversation flag (support both snake and hyphen)
		try {
			if (conversation && conversation.bot_reply !== undefined) return !!conversation.bot_reply;
		} catch (e) { }
		return false;
	});

	// Keep autoReply in sync with conversation prop updates (realtime via socket)
	useEffect(() => {

		try {
			if (!conversation) return;

			form.setFieldsValue({
				phone: conversation.phone || '',
				note: conversation.note || '',
			});

			if (conversation && conversation.bot_reply !== undefined) setAutoReply(!!conversation.bot_reply);
		} catch (e) {
			// ignore
		}
	}, [conversation]);

	const [messages, setMessages] = useState(conversation.messages || []);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [hasNewMessages, setHasNewMessages] = useState(false);
	const [nameModalVisible, setNameModalVisible] = useState(false);
	const [showSidebar, setShowSidebar] = useState(false);

	// Handler modal state when someone requests access
	const [requestModalVisible, setRequestModalVisible] = useState(false);
	const [requestModalRequester, setRequestModalRequester] = useState(null);
	const [requesterName, setRequesterName] = useState(null);
	const [countdown, setCountdown] = useState(0);
	const timerRef = useRef(null);

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
			}
		};
	}, []);

	// Lock/handler info
	const role = localStorage.getItem('userRole');
	const currentHandler = conversation?.current_handler || null;
	const isHandler = !!(currentHandler && currentHandler.accountId && accountId && String(currentHandler.accountId) === String(accountId));
	const isLocked = !!(currentHandler && currentHandler.accountId && !isHandler && role !== 'admin');


	const handler = conversation.current_handler;
	const startTime = handler?.started_at ? dayjs(handler.started_at).format('HH:mm') : null;
	const title = isHandler ? 'Bạn đang xử lý cuộc hội thoại.' : `${handler?.name} đang xử lý cuộc hội thoại từ ${startTime}.`;

	// Typing debounce management
	const typingRef = useRef(false);
	const typingTimeoutRef = useRef(null);

	const stopTyping = () => {
		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
			typingTimeoutRef.current = null;
		}
		if (typingRef.current && socket && accountId) {
		}
		typingRef.current = false;
	};

	useEffect(() => {
		return () => {
			// cleanup
			stopTyping();
		};
	}, []);

	useEffect(() => {
		if (!socket) return;

		// Handler: listen for incoming requests to confirm end session
		const onRequestAccess = async (payload) => {
			try {
				if (!isHandler) return; // only show modal to current handler
				if (!payload || !payload.conv_id) return;
				if (payload.conv_id !== conversation.id) return;
				try {
					const result = await fetchProfile(payload.requester);
					setRequestModalRequester(payload.requester);
					setRequesterName(result.data.name || 'Người dùng');
				} catch (e) { }
				setRequestModalVisible(true);
			} catch (e) {
				// ignore
			}
		};

		const onRequestAccessResponse = (payload) => {
			try {
				if (!payload || payload.conv_id !== conversation.id) return;
				if (payload.accepted) {
					message.success('Yêu cầu quyền truy cập đã được chấp nhận');
				} else {
					message.info('Yêu cầu quyền truy cập đã bị từ chối');
				}
			} catch (e) { }
		};

		socket.on('request-access', onRequestAccess);
		socket.on('request-access-response', onRequestAccessResponse);

		return () => {
			socket.off('request-access', onRequestAccess);
			socket.off('request-access-response', onRequestAccessResponse);
			if (timerRef.current) {
				clearInterval(timerRef.current);
			}
		};
	}, [socket, isHandler, conversation.id]);

	const handleRequestModalConfirm = async () => {
		// Handler confirms: notify requester and end session
		if (!socket || !requestModalRequester) {
			setRequestModalVisible(false);
			return;
		}
		// Inform requester of acceptance
		socket.emit('request-access-response', { conv_id: conversation.id, requester: requestModalRequester, accepted: true, account_id: accountId });
		// End session (unlock)
		socket.emit('complete-conversation', { account_id: accountId, conv_id: conversation.id });
		setRequestModalVisible(false);
		try { message.success('Bạn đã kết thúc phiên và chấp nhận yêu cầu.'); } catch (e) { }
	};

	const handleRequestModalCancel = () => {
		if (socket && requestModalRequester) {
			socket.emit('request-access-response', { conv_id: conversation.id, requester: requestModalRequester, accepted: false, account_id: accountId });
		}
		setRequestModalVisible(false);
		try { message.info('Bạn đã từ chối yêu cầu truy cập.'); } catch (e) { }
	};

	const handleMessageChange = (e) => {
		setChatMessage(e.target.value);
		if (!socket || !accountId) return;
		// Emit start-typing once, then debounce stop-typing
		if (!typingRef.current) {
			typingRef.current = true;
		}
		if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		typingTimeoutRef.current = setTimeout(() => {
			stopTyping();
		}, 2000);
	};

	const handleRequestAccess = () => {
		if (!socket || !accountId) return;

		if (isHandler) {
			socket.emit('complete-conversation', { account_id: accountId, conv_id: conversation.id });
			message.success('Đã kết thúc phiên xử lý');
			return;
		}

		// Check if countdown is active
		if (countdown > 0) return;

		// Emit event
		socket.emit('request-access', { account_id: accountId, conv_id: conversation.id });
		message.info('Yêu cầu quyền truy cập đã được gửi.');

		// Start 30s Countdown
		setCountdown(30);
		timerRef.current = setInterval(() => {
			setCountdown((prev) => {
				if (prev <= 1) {
					clearInterval(timerRef.current);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
	};

	const platformStatus = conversation.platform_status || { is_connected: true, disconnected_at: null };
	const isDisconnected = platformStatus.is_connected === false;

	const messagesEndRef = useRef(null);
	const fileInputRef = useRef(null);
	const messagesContainerRef = useRef(null);

	const isPrependingRef = useRef(false);
	const prevScrollHeightRef = useRef(0);
	const initialLoadRef = useRef(true);

	useEffect(() => {
		const newMessages = conversation?.messages || [];

		const uniqueMessages = newMessages.reduce((acc, msg) => {
			const key = msg._id || msg.id;
			const existing = acc.find(m => (m._id || m.id) === key);

			if (!existing) {
				acc.push(msg);
			} else if (existing.pending && !msg.pending) {
				const index = acc.indexOf(existing);
				acc[index] = msg;
			}

			return acc;
		}, []);

		setMessages(uniqueMessages);
		initialLoadRef.current = true;
	}, [conversation?.messages]);

	useLayoutEffect(() => {
		const el = messagesContainerRef.current;
		if (!el) return;

		if (isPrependingRef.current) {
			const delta = el.scrollHeight - prevScrollHeightRef.current;
			el.scrollTop = delta;
			isPrependingRef.current = false;
		} else if (messages.length > 0 && !conversation.loadingMore && !showScrollButton && title) {
			el.scrollTop = el.scrollHeight;
		}
	}, [messages]);

	const handleScroll = async (e) => {
		const el = e.currentTarget;

		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
		setShowScrollButton(!atBottom);

		if (onScrollPositionChange) {
			onScrollPositionChange(atBottom);
		}

		if (el.scrollTop <= 5 && !conversation.loadingMore && conversation.hasMore && title) {
			isPrependingRef.current = true;
			prevScrollHeightRef.current = el.scrollHeight;

			if (onLoadMore) {
				await onLoadMore();
			}
		}
	};

	const scrollToBottom = () => {
		const el = messagesContainerRef.current;
		if (el) {
			el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
			setShowScrollButton(false);
			setHasNewMessages(false);
		}
	};

	const handleSend = () => {
		// Prevent sending if conversation is locked by another handler
		if (isLocked && !isHandler) {
			try { message.alert(`${currentHandler?.name || 'Người khác'} đang xử lý cuộc trò chuyện`); } catch (e) { }
			return;
		}
		// Ensure we stop typing when sending
		stopTyping();
		if (ChatMessage.trim()) {
			const newMessage = {
				id: Date.now(),
				created_at: new Date().toISOString(),
				text: ChatMessage,
				sender: 'user',
				time: new Date().toLocaleTimeString('vi-VN', {
					hour: '2-digit',
					minute: '2-digit',
				}),
				pending: true,
			};
			setChatMessage('');
			if (typeof onSendMessage === 'function') {
				onSendMessage(newMessage);
			}
		}
	};

	const handleImageUpload = (e) => {
		// Do not allow image upload if locked by another handler
		if (isLocked && !isHandler) {
			try { message.alert(`${currentHandler?.name || 'Người khác'} đang xử lý cuộc trò chuyện`); } catch (e) { }
			return;
		}
		const file = e.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onloadend = () => {
				const newMessage = {
					id: Date.now(),
					created_at: new Date().toISOString(),
					image: reader.result,
					sender: 'user',
					time: new Date().toLocaleTimeString('vi-VN', {
						hour: '2-digit',
						minute: '2-digit',
					}),
					pending: true,
				};
				if (typeof onSendMessage === 'function') {
					onSendMessage(newMessage);
				}
			};
			reader.readAsDataURL(file);
		}
	};

	const normalizeMessageText = (msg) => {
		if (msg.text && msg.text.trim() !== '') return msg.text;

		if (msg.type && msg.type !== 'text') {
			return '📎 Tệp này không được hỗ trợ';
		}

		return '📎 Tệp này không được hỗ trợ';
	};

	const handleNameModalOpen = () => {
		setNameModalVisible(true);
	};

	const handleNameModalClose = () => {
		setNameModalVisible(false);
	};

	const handleNicknameSuccess = (updatedData) => {
		if (onConversationUpdate) {
			onConversationUpdate(updatedData);
		}
	};

	const handleResetSession = () => {
		modal.confirm({
			title: 'Xác nhận mở khóa',
			content: 'Bạn có chắc chắn muốn mở khóa cuộc hội thoại này? Hành động này sẽ gỡ bỏ người xử lý hiện tại ngay lập tức.',
			okText: 'Mở khóa',
			okType: 'danger',
			cancelText: 'Hủy',
			onOk: () => {
				if (socket && accountId) {
					// We use 'complete-conversation' to unlock it
					socket.emit('complete-conversation', {
						account_id: accountId,
						conv_id: conversation.id
					});
					message.success('Đã reset trạng thái cuộc trò chuyện');
					if (timerRef.current) {
						clearInterval(timerRef.current);
						setCountdown(0);
					}
				}
			},
		});
	};

	const handleSave = async (values) => {
		try {
			const accountId = localStorage.getItem('accountId');

			const result = await saveInfoConversation(accountId, conversation.oa_id, conversation.customer_id, values.phone, values.note);
			if (!result.success) {
				throw new Error(result.message || 'Failed to save conversation info');
			}
			onConversationUpdate({
				...conversation,
				phone: values.phone,
				note: values.note,
			});

			message.success('Lưu thông tin thành công');
		} catch (err) {
			message.error('Lưu thất bại');
		}
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
			{/* Header - Full Width */}
			<div
				style={{
					padding: '16px 20px',
					borderBottom: '1px solid #f0f0f0',
					background: 'white',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
					<Avatar size={40} src={conversation.avatar}>
						{conversation.name[0]}
					</Avatar>
					<div>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
							<span style={{ fontWeight: '600', fontSize: '16px' }}>
								{conversation.name}
							</span>
							<Button type="text" size="small" onClick={handleNameModalOpen} icon={<EditOutlined />} />
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
							{conversation.chatbot_info ? (
								<>
									<Avatar size={16} src={getAvatarUrl(conversation.chatbot_info.avatar)} />
									<span style={{ fontSize: '13px', color: '#666' }}>
										{conversation.chatbot_info.name}
									</span>
								</>
							) : (
								<>
									{platformIcons[conversation.platform]}
									<span style={{ fontSize: '13px', color: '#666' }}>
										{conversation.platform === 'facebook' ? 'Facebook' :
											conversation.platform === 'instagram' ? 'Instagram' :
												conversation.platform === 'zalo' ? 'Zalo' : 'Website'}
									</span>
								</>
							)}
							{conversation.tag && (
								<TagFilled style={{ color: tagColors['completed'] }} />
							)}
							{conversation.secondaryTag && (
								<div
									style={{
										background: '#f0f0f0',
										padding: '2px 6px',
										borderRadius: '4px',
										fontSize: '11px',
										color: '#666',
									}}
								>
									{conversation.secondaryTag}
								</div>
							)}
						</div>
					</div>

					{/* Request Access Modal for handler */}
					<Modal
						title="Yêu cầu quyền xử lý"
						open={requestModalVisible}
						onOk={handleRequestModalConfirm}
						onCancel={handleRequestModalCancel}
						okText="Chấp nhận và kết thúc phiên"
						cancelText="Từ chối"
					>
						<p>Người dùng <strong>{requesterName}</strong> đang yêu cầu quyền xử lý đoạn chat này. Bạn có muốn chấp nhận và kết thúc phiên không?</p>
					</Modal>
				</div>

				<div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
							{/* 1. ADMIN FLOW */}
							{role === 'admin' && conversation.current_handler ? (
								<Button
									size="default"
									danger
									type="primary"
									onClick={handleResetSession}
								>
									Mở khóa chat
								</Button>
							) : (
								/* 2. HANDLER FLOW (Existing) */
								isHandler ? (
									<Button size="default" style={{
										background: '#ff4d4f',
										borderColor: '#ff4d4f',
										color: 'white',
									}} onClick={handleRequestAccess}>Kết thúc</Button>
								) : (
									/* 3. REQUEST ACCESS FLOW (Existing) */
									conversation.current_handler ? (
										<Button
											size="default"
											style={{
												background: '#6c3fb5',
												borderColor: '#6c3fb5',
												color: 'white',
												opacity: (countdown > 0 || !isLocked) ? 0.7 : 1
											}}
											onClick={handleRequestAccess}
											disabled={!isLocked || countdown > 0}
										>
											{countdown > 0 ? `(${countdown}s) Đã gửi yêu cầu` : 'Yêu cầu xử lý'}
										</Button>
									) : null
								)
							)}
						</div>
						<RobotOutlined style={{ fontSize: '18px', color: autoReply ? '#6c3fb5' : '#999' }} />
						<span style={{ fontSize: '14px', marginRight: '4px' }}>Auto-reply</span>
						<Switch
							checked={autoReply}
							onChange={(val) => {
								// Confirm before toggling
								modal.confirm({
									title: val ? 'Bật Auto-reply' : 'Tắt Auto-reply',
									content: val ? 'Bạn có chắc chắn muốn bật Auto-reply cho cuộc hội thoại này? Bot sẽ trả lời tự động thay vì nhân viên.' : 'Bạn có chắc chắn muốn tắt Auto-reply? Sau khi tắt, nhân viên sẽ có thể trả lời như bình thường.',
									okText: 'Xác nhận',
									cancelText: 'Hủy',
									onOk: async () => {
										// Call backend to toggle via centralized API helper
										try {
											const convId = conversation.id || conversation.conv_id || conversation.conversation_id;
											if (!convId) {
												message.error('Conversation id not found');
												return;
											}
											try {
												const data = await setConversationBotReply(conversation.platform || 'facebook', convId, val, accountId);
												setAutoReply(!!val);
												if (onConversationUpdate && data) onConversationUpdate(data);
												socket.emit('complete-conversation', {
													account_id: accountId,
													conv_id: conversation.id
												});
												message.success('Đã chuyển sang chế độ trả lời tự động');
												if (timerRef.current) {
													clearInterval(timerRef.current);
													setCountdown(0);
												}
											} catch (err) {
												console.error('setConversationBotReply error', err);
												const errMsg = (err && err.info && err.info.message) || err.message || 'Không thể cập nhật Auto-reply';
												message.error(errMsg);
											}
										} catch (e) {
											message.error('Lỗi khi gọi API Auto-reply');
										}
									},
								});
							}}
							size="small"
						/>
					</div>
					<InfoCircleOutlined
						style={{ fontSize: '18px', color: showSidebar ? '#6c3fb5' : '#666', cursor: 'pointer' }}
						onClick={() => setShowSidebar(!showSidebar)}
					/>
				</div>
			</div>

			{/* Content Area - Split when sidebar is open */}
			<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

				{/* Messages Section */}
				<div style={{
					display: 'flex',
					flexDirection: 'column',
					flex: 1,
					transition: 'all 0.3s ease',
					minWidth: 0
				}}>
					{conversation.current_handler && (
						(() => {
							return (
								<Alert
									title={title}
									type="info"
									showIcon
									style={{ borderRadius: 0, border: 'none', height: '40px' }}
								/>
							);
						})()
					)}

					{autoReply && (
						<Alert
							type="info"
							showIcon
							title="Bot đang trả lời tự động ..."
							style={{ borderRadius: 0, border: 'none', height: '40px' }}
						/>
					)}
					{/* Messages Area */}
					<div
						ref={messagesContainerRef}
						onScroll={handleScroll}
						style={{
							flex: 1,
							overflowY: 'auto',
							padding: '20px',
							background: '#f8f9fa',
							overflowAnchor: 'none',
							position: 'relative',
						}}
					>
						{conversation.loadingMore && (
							<div style={{ textAlign: 'center', marginBottom: '8px', color: '#666' }}>Đang tải...</div>
						)}

						{messages.map((msg, index) => {
							const prevMsg = messages[index - 1];
							const currentDate = getRawDate(msg);
							const prevDate = getRawDate(prevMsg);

							const isNewDay = !msg.pending && !prevMsg?.pending &&
								(!prevMsg || !dayjs(currentDate).isSame(dayjs(prevDate), 'day'));

							const messageKey = msg._id || msg.id || `temp-${index}`;

							return (
								<div key={`container-${messageKey}`}>
									{isNewDay && !msg.failed && (
										<div style={{
											textAlign: 'center',
											margin: '24px 0 16px',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											gap: '10px'
										}}>
											<span style={{
												background: '#e1e4e8',
												color: '#65676b',
												padding: '2px 12px',
												borderRadius: '12px',
												fontSize: '12px',
												fontWeight: '500',
											}}>
												{getDateLabel(currentDate)}
											</span>
										</div>
									)}

									<div
										style={{
											display: 'flex',
											justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
											marginBottom: '16px',
											alignItems: 'flex-end',
											gap: '8px',
											opacity: (msg.pending || msg.failed) ? 0.6 : 1,
										}}
									>
										{msg.sender === 'customer' && (
											<Avatar size={32} src={msg.avatar || conversation.avatar}>
												{(msg.name || conversation.name || 'U')[0]}
											</Avatar>
										)}
										<div
											style={{
												maxWidth: '60%',
												display: 'flex',
												flexDirection: 'column',
												alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
											}}
										>
											{msg.image ? (
												<div style={{
													maxWidth: '300px',
													height: '200px',
													overflow: 'hidden',
													borderRadius: '12px',
													marginBottom: '4px',
													border: '1px solid #f0f0f0',
													position: 'relative',
												}}>
													<Image
														src={msg.image}
														alt="Sent"
														style={{
															width: '100%',
															height: '100%',
															objectFit: 'cover',
															cursor: 'pointer',
															display: 'block'
														}}
														styles={{
															root: {
																width: '100%',
																height: '100%'
															}
														}}
														preview={{
															cover: <div style={{ fontSize: '12px' }}>Click to view</div>
														}}
													/>
												</div>
											) : (
												<div
													style={{
														background: msg.sender === 'user' ? '#6c3fb5' : 'white',
														color: msg.sender === 'user' ? 'white' : '#333',
														padding: '10px 16px',
														borderRadius: '12px',
														fontSize: '14px',
														boxShadow:
															msg.sender === 'user'
																? '0 2px 4px rgba(108, 63, 181, 0.2)'
																: '0 1px 2px rgba(0,0,0,0.05)',
													}}
												>
													{normalizeMessageText(msg)}
												</div>
											)}
											{msg.failed && (
												<div style={{
													display: 'flex',
													alignItems: 'center',
													gap: '6px',
													color: '#ff4d4f',
													marginTop: '4px',
													fontSize: '12px',
												}}>
													<InfoCircleOutlined style={{ color: '#ff4d4f' }} />
													<span>Gửi tin nhắn bị lỗi</span>
												</div>
											)}
											<span
												style={{
													fontSize: '11px',
													color: '#999',
													marginTop: '4px',
												}}
											>
												{msg.time}
											</span>
										</div>
									</div>
								</div>
							);
						})}
						{showScrollButton && (
							<Button
								icon={<ArrowDownOutlined />}
								onClick={scrollToBottom}
								style={{
									position: 'sticky',
									bottom: '10px',
									left: '50%',
									transform: 'translateX(-50%)',
									zIndex: 100,
									borderRadius: '20px',
									background: '#6c3fb5',
									color: 'white',
									border: hasNewMessages ? '2px solid #52c41a' : 'none',
									boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
									display: 'flex',
									alignItems: 'center',
									gap: '8px',
									padding: '0 16px',
									height: '32px'
								}}
							>
							</Button>
						)}
						<div ref={messagesEndRef} />
					</div>

					{/* Input Footer */}
					<div
						style={{
							padding: '16px 20px',
							borderTop: '1px solid #f0f0f0',
							background: 'white',
							display: 'flex',
							flexDirection: 'column',
							gap: '12px',
						}}
					>
						{isDisconnected && (
							<Alert
								type="warning"
								showIcon
								title="Nền tảng không được kết nối hoặc đã bị ngắt kết nối. Hãy kết nối lại nền tảng này trong phần tích hợp để tiếp tục nhắn tin."
								style={{ marginBottom: '4px' }}
							/>
						)}
						<div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
							<input
								type="file"
								ref={fileInputRef}
								style={{ display: 'none' }}
								accept="image/*"
								onChange={handleImageUpload}
							/>
							<Button
								icon={<PictureOutlined />}
								size="large"
								onClick={() => { if (isDisconnected || (isLocked && !isHandler) || autoReply) return; fileInputRef.current?.click(); }}
								style={{ flexShrink: 0 }}
								disabled={isDisconnected || (isLocked && !isHandler) || autoReply}
							/>
							<Input
								placeholder={isDisconnected ? "Nền tảng không được kết nối..." : "Nhập tin nhắn..."}
								value={ChatMessage}
								onChange={handleMessageChange} onBlur={() => { if (!isDisconnected) stopTyping(); }}
								onPressEnter={!isDisconnected && !(isLocked && !isHandler) && !autoReply ? handleSend : null}
								disabled={isDisconnected || (isLocked && !isHandler) || autoReply}
								size="large"
								style={{
									flex: 1,
									opacity: isDisconnected ? 0.6 : 1,
									cursor: isDisconnected ? 'not-allowed' : 'text'
								}}
							/>
							<Button
								type="primary"
								icon={<SendOutlined />}
								size="large"
								onClick={handleSend}
								disabled={isDisconnected || (isLocked && !isHandler) || autoReply}
								style={{
									background: '#6c3fb5',
									borderColor: '#6c3fb5',
									flexShrink: 0,
								}}
							/>
						</div>
					</div>
				</div>

				{/* Right Sidebar - Slides in from right */}
				<div style={{
					width: showSidebar ? 320 : 0,
					display: showSidebar ? 'flex' : 'none',
					background: 'white',
					borderLeft: '1px solid #f0f0f0',
					flexShrink: 0,
					animation: 'slideIn 0.3s ease',
					flexDirection: 'column',
					height: '100%', // Parent takes full height
					overflow: 'hidden' // Prevent double scrollbars
				}}>
					<Form
						form={form}
						layout="vertical"
						initialValues={{
							phone: conversation.phone || '',
							note: conversation.note || '',
						}}
						onFinish={handleSave}
						style={{
							display: 'flex',
							flexDirection: 'column',
							height: '100%'
						}} // Make Form a flex container
					>
						{/* 1. FIXED HEADER */}
						<div style={{
							padding: 20,
							borderBottom: '1px solid #f0f0f0',
							display: 'flex',
							alignItems: 'center',
							position: 'relative',
							flexShrink: 0 // Prevents header from squishing
						}}>
							<div style={{ display: 'flex', gap: 12 }}>
								<Avatar size={40} src={conversation.avatar}>
									{conversation.name[0]}
								</Avatar>
								<div>
									<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
										<span style={{ fontWeight: '600', fontSize: '16px' }}>
											{conversation.name}
										</span>
										<Button type="text" size="small" onClick={handleNameModalOpen} icon={<EditOutlined />} />
									</div>
									<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
										{conversation.chatbot_info ? (
											<>
												<Avatar size={16} src={getAvatarUrl(conversation.chatbot_info.avatar)} />
												<span style={{ fontSize: '13px', color: '#666' }}>
													{conversation.chatbot_info.name}
												</span>
											</>
										) : (
											<>
												{platformIcons[conversation.platform]}
												<span style={{ fontSize: '13px', color: '#666' }}>
													{conversation.platform === 'facebook' ? 'Facebook' :
														conversation.platform === 'instagram' ? 'Instagram' :
															conversation.platform === 'zalo' ? 'Zalo' : 'Website'}
												</span>
											</>
										)}
										{conversation.tag && (
											<TagFilled style={{ color: tagColors['completed'] }} />
										)}
										{conversation.secondaryTag && (
											<div
												style={{
													background: '#f0f0f0',
													padding: '2px 6px',
													borderRadius: '4px',
													fontSize: '11px',
													color: '#666',
												}}
											>
												{conversation.secondaryTag}
											</div>
										)}
									</div>
								</div>
							</div>
						</div>

						{/* 2. SCROLLABLE CONTENT AREA */}
						<div style={{
							padding: 16,
							flex: 1,
							overflowY: 'auto' // Only this part scrolls
						}}>
							<Form.Item
								label="SĐT"
								name="phone"
								rules={[{ pattern: /^[0-9+ ]*$/, message: 'Số điện thoại không hợp lệ' }]}
							>
								<Input placeholder="Nhập số điện thoại" />
							</Form.Item>

							<Form.Item label="Ghi chú" name="note">
								<TextArea
									placeholder="Nhập ghi chú tại đây..."
									autoSize={{ minRows: 6, maxRows: 6 }}
								/>
							</Form.Item>
						</div>

						{/* 3. FIXED FOOTER BUTTONS */}
						<div style={{
							padding: 20,
							display: 'flex',
							gap: 12,
							borderTop: '1px solid #f0f0f0', // Optional: separator
							background: 'white',
							flexShrink: 0 // Prevents buttons from squishing
						}}>
							<Button
								type="primary"
								htmlType="submit"
								style={{
									flex: 1,
									background: '#6c3fb5',
									borderColor: '#6c3fb5',
								}}
							>
								Lưu
							</Button>
							<Button
								onClick={() => setShowSidebar(false)}
								style={{ flex: 1 }}
							>
								Đóng
							</Button>
						</div>
					</Form>
				</div>
			</div>

			<CustomerNameChangeModal
				visible={nameModalVisible}
				onClose={handleNameModalClose}
				conversation={conversation}
				onSuccess={handleNicknameSuccess}
			/>

			<style jsx>{`
				@keyframes slideIn {
					from {
						transform: translateX(100%);
					}
					to {
						transform: translateX(0);
					}
				}
			`}</style>
		</div >
	);
}
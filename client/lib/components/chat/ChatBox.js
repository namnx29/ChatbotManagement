'use client';

import { Avatar, Input, Button, Switch, Image, Alert } from 'antd';
import {
	SendOutlined,
	PictureOutlined,
	SettingOutlined,
	RobotOutlined,
	FacebookFilled,
	InstagramFilled,
	TagFilled,
	ArrowDownOutlined
} from '@ant-design/icons';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

dayjs.locale('vi');

const platformIcons = {
	facebook: <FacebookFilled style={{ fontSize: '14px', color: '#1877f2' }} />,
	instagram: <InstagramFilled style={{ fontSize: '14px', color: '#e4405f' }} />,
	zalo: <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0068ff' }}>Z</span>,
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

export default function ChatBox({ conversation, onSendMessage, onLoadMore, onScrollPositionChange }) {
	const [message, setMessage] = useState('');
	const [autoReply, setAutoReply] = useState(true);
	const [messages, setMessages] = useState(conversation.messages || []);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [hasNewMessages, setHasNewMessages] = useState(false);
	const [isAtBottom, setIsAtBottom] = useState(true);

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
		} else if (messages.length > 0 && !conversation.loadingMore && !showScrollButton) {
			el.scrollTop = el.scrollHeight;
		}
	}, [messages]);

	const handleScroll = async (e) => {
		const el = e.currentTarget;

		// Check if user is at bottom (with small threshold for precision)
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
		setShowScrollButton(!atBottom);
		setIsAtBottom(atBottom);

		if (onScrollPositionChange) {
			onScrollPositionChange(atBottom);
		}
		// Load more messages when scrolling to top
		if (el.scrollTop <= 5 && !conversation.loadingMore && conversation.hasMore) {
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
		if (message.trim()) {
			const newMessage = {
				id: Date.now(),
				created_at: new Date().toISOString(),
				text: message,
				sender: 'user',
				time: new Date().toLocaleTimeString('vi-VN', {
					hour: '2-digit',
					minute: '2-digit',
				}),
				pending: true,
			};
			setMessage('');
			if (typeof onSendMessage === 'function') {
				onSendMessage(newMessage);
			}
		}
	};

	const handleImageUpload = (e) => {
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


	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
			{/* Header */}
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
							{conversation.tag && (
								<TagFilled style={{ color: tagColors[conversation.tag] }} />
							)}
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
							{platformIcons[conversation.platform]}
							<span style={{ fontSize: '13px', color: '#666' }}>
								{conversation.platform === 'facebook' ? 'Facebook' :
									conversation.platform === 'instagram' ? 'Instagram' : 'Zalo'}
							</span>
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

				<div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
						<RobotOutlined style={{ fontSize: '18px', color: autoReply ? '#6c3fb5' : '#999' }} />
						<span style={{ fontSize: '14px', marginRight: '4px' }}>Auto-reply</span>
						<Switch
							checked={autoReply}
							onChange={setAutoReply}
							size="small"
						/>
					</div>
					<SettingOutlined
						style={{ fontSize: '18px', color: '#666', cursor: 'pointer' }}
					/>
				</div>
			</div>

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
							{isNewDay && (
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
									opacity: msg.pending ? 0.6 : 1,
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
						title="Nền tảng không được kết nối"
						description="Bạn không thể gửi tin nhắn vì nền tảng này đã bị ngắt kết nối. Hãy kết nối lại nền tảng này trong phần tích hợp để tiếp tục nhắn tin."
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
						onClick={() => fileInputRef.current?.click()}
						style={{ flexShrink: 0 }}
						disabled={isDisconnected}
					/>
					<Input
						placeholder={isDisconnected ? "Nền tảng không được kết nối" : "Nhập tin nhắn..."}
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onPressEnter={!isDisconnected ? handleSend : null}
						disabled={isDisconnected}
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
						disabled={isDisconnected}
						style={{
							background: '#6c3fb5',
							borderColor: '#6c3fb5',
							flexShrink: 0,
						}}
					/>
				</div>
			</div>
		</div>
	);
}
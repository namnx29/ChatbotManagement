'use client';

import { Select, Space, Avatar, Input, Button, Switch, Image, Alert, App } from 'antd';
import {
	SendOutlined,
	PictureOutlined,
	InfoCircleOutlined,
	RobotOutlined,
	EditOutlined,
	TagFilled,
	ArrowDownOutlined,
	DownOutlined
} from '@ant-design/icons';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import CustomerNameChangeModal from '@/lib/components/popup/CustomerNameChangeModal';
import { getAvatarUrl } from '@/lib/api';

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
	const { message } = App.useApp();
	const [ChatMessage, setChatMessage] = useState('');
	const [autoReply, setAutoReply] = useState(true);
	const [messages, setMessages] = useState(conversation.messages || []);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [hasNewMessages, setHasNewMessages] = useState(false);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [nameModalVisible, setNameModalVisible] = useState(false);
	const [showSidebar, setShowSidebar] = useState(false);

	// Lock/handler info
	const currentHandler = conversation?.current_handler || null;
	const isHandler = !!(currentHandler && currentHandler.accountId && accountId && String(currentHandler.accountId) === String(accountId));
	const isLocked = !!(currentHandler && currentHandler.accountId && !isHandler);

	// Typing debounce management
	const typingRef = useRef(false);
	const typingTimeoutRef = useRef(null);

	const stopTyping = () => {
		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
			typingTimeoutRef.current = null;
		}
		if (typingRef.current && socket && accountId) {
			socket.emit('stop-typing', { account_id: accountId, conv_id: conversation.id });
		}
		typingRef.current = false;
	};

	useEffect(() => {
		return () => {
			// cleanup
			stopTyping();
		};
	}, []);

	const handleMessageChange = (e) => {
		setChatMessage(e.target.value);
		if (!socket || !accountId) return;
		// Emit start-typing once, then debounce stop-typing
		if (!typingRef.current) {
			typingRef.current = true;
			socket.emit('start-typing', { account_id: accountId, conv_id: conversation.id, ttl_seconds: 300 });
		}
		if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		typingTimeoutRef.current = setTimeout(() => {
			stopTyping();
		}, 2000);
	};

	const handleRequestAccess = () => {
		if (!socket || !accountId) return;
		socket.emit('request-access', { account_id: accountId, conv_id: conversation.id });
		try { message.alert('Yêu cầu quyền truy cập đã được gửi tới người xử lý.'); } catch (e) { }
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
		} else if (messages.length > 0 && !conversation.loadingMore && !showScrollButton) {
			el.scrollTop = el.scrollHeight;
		}
	}, [messages]);

	const handleScroll = async (e) => {
		const el = e.currentTarget;

		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
		setShowScrollButton(!atBottom);
		setIsAtBottom(atBottom);

		if (onScrollPositionChange) {
			onScrollPositionChange(atBottom);
		}

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
											conversation.platform === 'instagram' ? 'Instagram' : 'Zalo'}
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
					<InfoCircleOutlined
						style={{ fontSize: '18px', color: showSidebar ? '#6c3fb5' : '#666', cursor: 'pointer' }}
						onClick={() => setShowSidebar(!showSidebar)}
					/>
				</div>
			</div>

			{conversation.current_handler && (
				<Alert
					title={`${conversation.current_handler.name} đang xử lý cuộc trò chuyện`}
					type="info"
					showIcon
					action={!isHandler && <Button size="default" style={{
						background: '#6c3fb5',
						borderColor: '#6c3fb5',
						color: 'white',
					}} onClick={handleRequestAccess}>Yêu cầu quyền chat</Button>}
					style={{ margin: '8px 16px' }}
				/>
			)}

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
								onClick={() => { if (isDisconnected || (isLocked && !isHandler)) return; fileInputRef.current?.click(); }}
								style={{ flexShrink: 0 }}
								disabled={isDisconnected || (isLocked && !isHandler)}
							/>
							<Input
								placeholder={isDisconnected ? "Nền tảng không được kết nối..." : "Nhập tin nhắn..."}
								value={ChatMessage}
								onChange={handleMessageChange} onBlur={() => { if (!isDisconnected) stopTyping(); }}
								onPressEnter={!isDisconnected && !(isLocked && !isHandler) ? handleSend : null}
								disabled={isDisconnected || (isLocked && !isHandler)}
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
								disabled={isDisconnected || (isLocked && !isHandler)}
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
				{showSidebar && (
					<div style={{
						width: '320px',
						background: 'white',
						borderLeft: '1px solid #f0f0f0',
						overflowY: 'auto',
						flexShrink: 0,
						animation: 'slideIn 0.3s ease',
						display: 'flex',
						flexDirection: 'column',
						height: '100%',
					}}>
						<div style={{ flex: 1, overflowY: 'auto' }}>
							{/* Sidebar Header */}
							<div style={{
								padding: '20px',
								borderBottom: '1px solid #f0f0f0',
								display: 'flex',
								alignItems: 'center',
								position: 'relative'
							}}>
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
															conversation.platform === 'instagram' ? 'Instagram' : 'Zalo'}
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

							<div style={{ padding: '16px' }}>
								{/* Tags Section */}
								<div style={{ marginBottom: '18px' }}>
									<div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '8px', color: '#333' }}>
										SĐT
									</div>
									<Input
										value={conversation.phone || ''}
										placeholder="Nhập số điện thoại"
										style={{ width: '100%' }}
									/>
								</div>
								<div style={{ marginBottom: '18px' }}>
									<div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '8px', color: '#333' }}>
										Tag
									</div>
									<Select
										defaultValue="interacting"
										style={{ width: '100%' }}
										options={[
											{
												value: 'completed',
												label: (
													<Space>
														<div style={{ width: 8, height: 8, borderRadius: '50%', background: '#52c41a' }} />
														Chốt đơn
													</Space>
												),
											},
											{
												value: 'bot-failed',
												label: (
													<Space>
														<div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f' }} />
														Bot không trả lời được
													</Space>
												),
											},
											{
												value: 'no-response',
												label: (
													<Space>
														<div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8c8c8c' }} />
														Khách không phản hồi
													</Space>
												),
											},
											{
												value: 'interacting',
												label: (
													<Space>
														<div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fa8c16' }} />
														Đang tương tác
													</Space>
												),
											},
										]}
									/>
								</div>

								{/* Status Section (Tư vấn) */}
								<div>
									<div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '8px', color: '#333' }}>
										Trạng thái
									</div>
									<Select
										defaultValue="tu-van"
										style={{ width: '100%', marginBottom: '16px' }}
										optionLabelProp="label" // This tells AntD to only show the 'label' prop in the selection box
										suffixIcon={<DownOutlined style={{ fontSize: '10px', color: '#bfbfbf' }} />}
									>
										<Select.Option value="tu-van" label="Tư vấn">
											<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
												<span>Tư vấn</span>
												<div style={{ width: 24, height: 6, borderRadius: 3, background: '#bae7ff' }} />
											</div>
										</Select.Option>

										<Select.Option value="tiem-nang" label="Tiềm năng">
											<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
												<span>Tiềm năng</span>
												<div style={{ width: 24, height: 6, borderRadius: 3, background: '#ffe58f' }} />
											</div>
										</Select.Option>

										<Select.Option value="chot-don" label="Chốt đơn">
											<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
												<span>Chốt đơn</span>
												<div style={{ width: 24, height: 6, borderRadius: 3, background: '#b7eb8f' }} />
											</div>
										</Select.Option>
									</Select>
								</div>

								<div style={{ marginBottom: '14px' }}>
									<div style={{
										fontWeight: '600',
										fontSize: '14px',
										marginBottom: '8px',
										color: '#333'
									}}>
										Ghi chú
									</div>
									<TextArea
										placeholder="Nhập ghi chú tại đây..."
										autoSize={{ minRows: 6, maxRows: 6 }}
										style={{
											borderRadius: '6px',
											fontSize: '13px',
											border: '1px solid #d9d9d9'
										}}
									/>
								</div>
							</div>
						</div>

						{/* Action Buttons */}
						<div style={{
							padding: '16px',
							display: 'flex',
							gap: '12px',
							background: 'white'
						}}>
							<Button
								onClick={() => setShowSidebar(false)}
								style={{
									flex: 1,
									borderRadius: '8px',
									height: '40px'
								}}
							>
								Đóng
							</Button>
							<Button
								type="primary"
								style={{
									flex: 1,
									background: '#6c3fb5',
									borderColor: '#6c3fb5',
									borderRadius: '8px',
									height: '40px'
								}}
							>
								Lưu
							</Button>
						</div>
					</div>
				)}
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
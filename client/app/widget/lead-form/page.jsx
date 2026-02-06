"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Typography, Space, App } from 'antd';
import { CloseOutlined, SendOutlined, PaperClipOutlined, ExpandAltOutlined, CompressOutlined } from '@ant-design/icons';
import { io } from 'socket.io-client';

const { Text } = Typography;
const STORAGE_KEY = 'widget_lead_form_v1';
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export default function LeadFormPage() {
	const { message } = App.useApp();
	const [form] = Form.useForm();
	const [showChat, setShowChat] = useState(false);
	const [userData, setUserData] = useState({ name: '', phone: '' });
	const [messages, setMessages] = useState([]);
	const [inputValue, setInputValue] = useState('');
	const [loading, setLoading] = useState(false);
	const [conversationId, setConversationId] = useState(null);
	const scrollRef = useRef(null);
	const socketRef = useRef(null);
	const fileInputRef = useRef(null);
	const [orgId, setOrgId] = useState(null);
	const [accountId, setAccountId] = useState(null);
	const [chatbotId, setChatbotId] = useState(null);
	const [isMaximized, setIsMaximized] = useState(false);

	const toggleExpand = () => {
		if (isMaximized) {
			window.parent.postMessage({ type: 'CHAT_WIDGET_MINIMIZE' }, '*');
		} else {
			window.parent.postMessage({ type: 'CHAT_WIDGET_EXPAND' }, '*');
		}
		setIsMaximized(!isMaximized);
	};

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	// 1. Get ChatbotId from URL
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const cid = params.get('chatbotId');
		if (cid) setChatbotId(cid);
	}, []);

	// 2. Load session from LocalStorage (including previous Org/Account IDs)
	useEffect(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
			if (saved.name && saved.phone) {
				setUserData({ name: saved.name, phone: saved.phone });
				if (saved.conversationId) setConversationId(saved.conversationId);
				if (saved.orgId) setOrgId(saved.orgId);
				if (saved.accountId) setAccountId(saved.accountId);

				setShowChat(true);
				setMessages([{
					id: 'greeting',
					text: 'Xin chào, tôi có thể giúp gì cho bạn?',
					sender: 'bot',
					time: ''
				}]);
			}
		} catch (e) { }
	}, []);

	// 3. Socket Connection - Triggers automatically once IDs are set
	useEffect(() => {
		if (!accountId || socketRef.current) return;

		socketRef.current = io('https://elcom.vn', {
			transports: ['websocket', 'polling'],
			auth: { account_id: accountId }
		});

		return () => {
			if (socketRef.current) {
				socketRef.current.disconnect();
				socketRef.current = null;
			}
		};
	}, [accountId]);

	useEffect(() => {
		if (!socketRef.current || !conversationId) return;

		const handleNewMessage = (payload) => {
			if (payload.direction !== 'out' || payload.conv_id !== conversationId) return;

			const messageText = payload.message || payload.text || '';
			const imageUrl = payload.message_doc?.metadata?.image || null;
			if (!messageText && !imageUrl) return;

			const newId = payload.message_doc?._id || payload.id || Date.now();
			setMessages(prev => {
				if (prev.find(m => m.id === newId)) return prev;
				return [
					...prev,
					{
						id: newId,
						text: imageUrl ? (messageText || 'Tệp đính kèm') : messageText,
						image: imageUrl || null,
						sender: 'bot',
						time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
					},
				];
			});

			window.parent.postMessage(
				{ type: 'CHAT_WIDGET_NEW_MESSAGE' },
				'*'
			);
		};

		socketRef.current.on('new-message', handleNewMessage);
		return () => {
			if (socketRef.current) socketRef.current.off('new-message', handleNewMessage);
		};
	}, [conversationId]);

	const closeWidget = () => {
		window.parent.postMessage({ type: 'CHAT_WIDGET_CLOSE' }, '*');
	};

	useEffect(() => {
		const loadHistory = async () => {
			if (!conversationId || !accountId) return;
			try {
				const url = new URL(`${BASE_URL}/api/widget/conversations/${encodeURIComponent(conversationId)}/messages`);
				const res = await fetch(url.toString(), {
					headers: { 'X-Account-Id': accountId },
				});
				const json = await res.json();
				if (res.ok && json.success && Array.isArray(json.data)) {
					const mapped = json.data.map((m) => {
						const meta = m.metadata || {};
						const imageUrl = meta.image || null;
						return {
							id: m._id || m.id,
							text: imageUrl ? (m.text || 'Tệp đính kèm') : (m.text || ''),
							image: imageUrl || null,
							sender: m.direction === 'out' ? 'bot' : 'user',
							time: m.created_at
								? new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
								: '...',
						};
					});
					setMessages(mapped);
				}
			} catch (e) { }
		};
		loadHistory();
	}, [conversationId, accountId]);

	const handleFormSubmit = (values) => {
		setUserData(values);
		setShowChat(true);
		setMessages([{
			id: 'greeting',
			text: 'Xin chào, tôi có thể giúp gì cho bạn?',
			sender: 'bot',
			time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
		}]);
	};

	const handleSendMessage = async () => {
		if (!inputValue.trim() || loading) return;

		const textToSend = inputValue;
		setMessages(prev => [...prev, { id: Date.now(), text: textToSend, sender: 'user', time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }]);
		setInputValue('');
		setLoading(true);

		try {
			if (conversationId) {
				await fetch(`${BASE_URL}/api/widget/conversations/${encodeURIComponent(conversationId)}/messages`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Organization-ID': orgId
					},
					body: JSON.stringify({ text: textToSend, organizationId: orgId }),
				});
			} else {
				// FIRST MESSAGE: Create Lead and Get IDs
				const res = await fetch(`${BASE_URL}/api/widget/lead`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Chatbot-ID': chatbotId
					},
					body: JSON.stringify({
						name: userData.name,
						phone: userData.phone,
						message: textToSend,
						chatbotId: chatbotId,
					}),
				});
				const data = await res.json();
				if (data.success && data.conv_id) {
					// Update local state with new IDs from API
					setConversationId(data.conv_id);
					setOrgId(data.message_doc.organizationId);
					setAccountId(data.message_doc.accountId);

					// Save everything to LocalStorage for persistence
					localStorage.setItem(STORAGE_KEY, JSON.stringify({
						name: userData.name,
						phone: userData.phone,
						conversationId: data.conv_id,
						orgId: data.message_doc.organizationId,
						accountId: data.message_doc.accountId
					}));
				}
			}
		} catch (err) {
			message.error('Có lỗi xảy ra khi gửi tin nhắn');
		} finally {
			setLoading(false);
		}
	};

	const handleImageUpload = (e) => {
		const file = e.target.files?.[0];
		if (!file) return;

		// Reset input so the same file can be selected again
		e.target.value = '';

		const reader = new FileReader();
		reader.onloadend = async () => {
			const imageData = reader.result;
			if (!imageData) return;

			// Optimistic UI update
			const imgMsg = {
				id: Date.now(),
				image: imageData,
				text: '',
				sender: 'user',
				time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
			};
			setMessages(prev => [...prev, imgMsg]);

			if (!conversationId) {
				message.warn('Không thể gửi ảnh trước khi cuộc trò chuyện được tạo');
				return;
			}

			setLoading(true);
			try {
				const url = `${BASE_URL}/api/widget/conversations/${encodeURIComponent(conversationId)}/messages`;
				const res = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(orgId ? { 'X-Organization-ID': orgId } : {}),
					},
					body: JSON.stringify({
						image: imageData,
						organizationId: orgId,
					}),
				});
				const data = await res.json();
				if (!res.ok || !data.success) {
					message.error('Có lỗi xảy ra khi gửi ảnh');
				}
			} catch (err) {
				message.error('Có lỗi xảy ra khi gửi ảnh');
			} finally {
				setLoading(false);
			}
		};

		reader.readAsDataURL(file);
	};

	if (showChat) {
		return (
			<div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'white', color: 'black' }}>
				{/* Updated Header */}
				<div style={{
					padding: '12px 16px',
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					borderBottom: '1px solid #f0f0f0',
					background: 'white'
				}}>
					{/* Left Side: Avatar and Name */}
					<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
						<div style={{
							width: '36px',
							height: '36px',
							borderRadius: '50%',
							background: '#6c3fb5',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: 'white',
							fontWeight: 'bold',
							fontSize: '16px'
						}}>
							{/* You can replace "S" with the first letter of the business name */}
							S
						</div>
						<div style={{ display: 'flex', flexDirection: 'column' }}>
							<Text strong style={{ fontSize: '14px', lineHeight: '1.2' }}>Support Team</Text>
							<Text type="secondary" style={{ fontSize: '11px' }}>
								<span style={{ color: '#52c41a', marginRight: '4px' }}>●</span>
								Online
							</Text>
						</div>
					</div>

					{/* Right Side: Action Buttons */}
					<Space size={4}>
						<Button
							type="text"
							icon={isMaximized ? <CompressOutlined /> : <ExpandAltOutlined />}
							onClick={toggleExpand}
						/>
						<Button
							type="text"
							icon={<CloseOutlined />}
							onClick={closeWidget}
						/>
					</Space>
				</div>

				<div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
					{messages.map((msg) => (
						<div
							key={msg.id}
							style={{
								marginBottom: '10px',
								display: 'flex', // Enable flex for the row
								flexDirection: 'column', // Stack bubble and time
								alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start' // Push to right or left
							}}
						>
							{msg.image ? (
								<img
									src={msg.image}
									alt="attachment"
									style={{ maxWidth: '260px', maxHeight: '200px', borderRadius: '12px', display: 'block' }}
								/>
							) : (
								<div style={{
									display: 'inline-block',
									padding: '12px 16px',
									borderRadius: msg.sender === 'user' ? '20px 20px 0 20px' : '20px 20px 20px 0',
									background: msg.sender === 'user' ? '#6c3fb5' : '#2a2a2a',
									color: 'white',
									maxWidth: '85%',
									fontSize: '15px',
									textAlign: 'left',
									lineHeight: '1.4',
									wordBreak: 'break-word',
									whiteSpace: 'pre-wrap'
								}}>

									{msg.text}
								</div>
							)}

							<div style={{
								fontSize: '11px',
								color: '#888',
								marginTop: '4px',
								// Ensure time also aligns with the bubble
								alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start'
							}}>
								{msg.time}
							</div>
						</div>
					))}
				</div>

				<div style={{ padding: '16px' }}>
					<div style={{ background: 'white', borderRadius: '24px', border: '1px solid #888', padding: '8px 16px' }}>
						<Input.TextArea
							autoSize={{ minRows: 1, maxRows: 4 }}
							placeholder="Message..."
							variant="borderless"
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onPressEnter={(e) => {
								if (!e.shiftKey) {
									e.preventDefault();
									handleSendMessage();
								}
							}}
							style={{ padding: '8px 0' }}
						/>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
							<Space size="middle" style={{ color: '#888', fontSize: '18px' }}>
								<PaperClipOutlined
									style={{ cursor: 'pointer' }}
									onClick={() => {
										if (fileInputRef.current) {
											fileInputRef.current.click();
										}
									}}
								/>
								<input
									type="file"
									ref={fileInputRef}
									style={{ display: 'none' }}
									accept="image/*"
									onChange={handleImageUpload}
								/>
							</Space>
							<Button
								type="primary"
								shape="circle"
								icon={<SendOutlined />}
								disabled={!inputValue.trim() || loading}
								onClick={handleSendMessage}
								style={{ border: 'none' }}
							/>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div style={{ padding: '24px', background: 'white', height: '100vh', position: 'relative' }}>
			<Button type="text" icon={<CloseOutlined />} onClick={closeWidget} style={{ position: 'absolute', right: 16, top: 16 }} />
			<div style={{ marginTop: 40 }}>
				<Text style={{ fontSize: '15px', fontWeight: 500, marginBottom: 16, display: 'block' }}>
					Vui lòng cung cấp một số thông tin sau đây để chúng tôi có thể hỗ trợ tốt hơn.
				</Text>
				<Form form={form} layout="vertical" onFinish={handleFormSubmit} requiredMark={false}>
					<Form.Item label={<Text strong>Họ tên <span style={{ color: 'red' }}>*</span></Text>} name="name" rules={[{ required: true }]}>
						<Input placeholder="Nhập họ tên của bạn" size="large" />
					</Form.Item>
					<Form.Item label={<Text strong>Số điện thoại <span style={{ color: 'red' }}>*</span></Text>} name="phone" rules={[{ required: true, message: "Vui lòng nhập số điện thoại!" }, { pattern: /^[0-9]{10,11}$/, message: "Số điện thoại không hợp lệ!" }]}>
						<Input placeholder="Nhập số điện thoại" size="large" />
					</Form.Item>
					<Form.Item style={{ marginTop: 40 }}>
						<Button type="primary" htmlType="submit" block size="large" style={{ background: '#6c3fb5', borderColor: '#6c3fb5', height: '48px', fontWeight: '600' }}>
							Bắt đầu
						</Button>
					</Form.Item>
				</Form>
			</div>
		</div>
	);
}
'use client';

import { Avatar, Input, Button, Switch, Image } from 'antd';
import {
	SendOutlined,
	PictureOutlined,
	SettingOutlined,
	RobotOutlined,
	FacebookFilled,
	InstagramFilled,
	TagFilled
} from '@ant-design/icons';
import { useState, useRef, useEffect } from 'react';

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

export default function ChatBox({ conversation, onSendMessage }) {
	const [message, setMessage] = useState('');
	const [autoReply, setAutoReply] = useState(true);
	const [messages, setMessages] = useState(conversation.messages || []);
	const messagesEndRef = useRef(null);
	const fileInputRef = useRef(null);

	// Keep local messages in sync when conversation changes or when messages array updates
	useEffect(() => {
		setMessages(conversation?.messages || []);
	}, [conversation]);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	const handleSend = () => {
		if (message.trim()) {
			const newMessage = {
				id: Date.now(),
				text: message,
				sender: 'user',
				time: new Date().toLocaleTimeString('vi-VN', {
					hour: '2-digit',
					minute: '2-digit',
				}),
			};
			setMessage('');
			// inform parent so it can persist the message (parent will update conversation prop)
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
					image: reader.result,
					sender: 'user',
					time: new Date().toLocaleTimeString('vi-VN', {
						hour: '2-digit',
						minute: '2-digit',
					}),
				};
				if (typeof onSendMessage === 'function') {
					onSendMessage(newMessage);
				}
			};
			reader.readAsDataURL(file);
		}
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
				style={{
					flex: 1,
					overflowY: 'auto',
					padding: '20px',
					background: '#f8f9fa',
				}}
			>
				{messages.map((msg) => (
					<div
						key={msg.id}
						style={{
							display: 'flex',
							justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
							marginBottom: '16px',
							alignItems: 'flex-end',
							gap: '8px',
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
									maxHeight: '300px',
									overflow: 'hidden',
									borderRadius: '12px',
									marginBottom: '4px',
									border: '1px solid #f0f0f0'
								}}>
									<Image
										src={msg.image}
										alt="Sent"
										style={{
											width: '100%',
											height: '100%',
											objectFit: 'cover',
											cursor: 'pointer'
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
									{msg.text}
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
				))}
				<div ref={messagesEndRef} />
			</div>

			{/* Input Footer */}
			<div
				style={{
					padding: '16px 20px',
					borderTop: '1px solid #f0f0f0',
					background: 'white',
					display: 'flex',
					gap: '12px',
					alignItems: 'center',
				}}
			>
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
				/>
				<Input
					placeholder="Nhập tin nhắn..."
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					onPressEnter={handleSend}
					size="large"
					style={{ flex: 1 }}
				/>
				<Button
					type="primary"
					icon={<SendOutlined />}
					size="large"
					onClick={handleSend}
					style={{
						background: '#6c3fb5',
						borderColor: '#6c3fb5',
						flexShrink: 0,
					}}
				/>
			</div>
		</div>
	);
}
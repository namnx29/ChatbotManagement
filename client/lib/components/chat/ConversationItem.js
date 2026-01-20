'use client';

import { Avatar, Dropdown, Tooltip } from 'antd';
import { MoreOutlined, TagFilled, DisconnectOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';

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

function parseToDate(s) {
	if (!s) return null;
	if (s instanceof Date) return s;
	if (typeof s === 'number') return new Date(s);
	let str = String(s);
	// If string looks like 'YYYY-MM-DD HH:MM:SS', convert to ISO and assume UTC
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
		str = str.replace(' ', 'T') + 'Z';
	}
	// If looks like 'YYYY-MM-DD', make it start of day UTC
	if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
		str = str + 'T00:00:00Z';
	}
	const d = new Date(str);
	if (isNaN(d.getTime())) return null;
	return d;
}

function formatRelativeTime(time) {
	const d = parseToDate(time);
	if (!d) return '';
	const now = new Date();
	const diff = Math.floor((now.getTime() - d.getTime()) / 1000);

	if (diff < 10) return 'Vừa xong';
	if (diff < 60) return `${diff} giây`;

	const mins = Math.floor(diff / 60);
	if (mins < 60) return `${mins} phút`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs} giờ`;
	const days = Math.floor(hrs / 24);
	if (days === 1) return 'Hôm qua';
	if (days < 7) return `${days} ngày`;
	// older: show date (local)
	return d.toLocaleDateString();
}

export default function ConversationItem({ conversation, isSelected, onClick, isUnread }) {
	const [relativeTime, setRelativeTime] = useState(formatRelativeTime(conversation.time));

	// Safely determine if platform is disconnected
	const platformStatus = conversation.platform_status || { is_connected: true, disconnected_at: null };
	const isDisconnected = platformStatus.is_connected === false;

	useEffect(() => {
		setRelativeTime(formatRelativeTime(conversation.time));

		const timer = setInterval(() => {
			setRelativeTime(formatRelativeTime(conversation.time));
		}, 60000);

		return () => clearInterval(timer);
	}, [conversation.time]);

	const menuItems = [
		{ key: 'mark-read', label: 'Đánh dấu đã đọc' },
		{ key: 'delete', label: 'Xóa', danger: true },
	];

	return (
		<div
			onClick={onClick}
			style={{
				padding: '12px 16px',
				borderBottom: '1px solid #f0f0f0',
				cursor: 'pointer',
				background: isSelected ? '#f5f5ff' : 'transparent',
				position: 'relative',
			}}
		>
			<div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
				{/* Avatar with Platform Badge */}
				<div style={{ position: 'relative' }}>
					<Avatar size={48} src={conversation.avatar}>
						{conversation.name[0]}
					</Avatar>
					<Tooltip
						title={isDisconnected ? "Nền tảng không được kết nối" : ""}
						trigger={isDisconnected ? "hover" : ""}
					>
						<div
							style={{
								position: 'absolute',
								bottom: '0',
								left: '0',
								width: '18px',
								height: '18px',
								borderRadius: '50%',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								opacity: isDisconnected ? 0.5 : 1,
							}}
						>
							{platformIcons[conversation.platform]}
							{isDisconnected && (
								<DisconnectOutlined
									style={{
										position: 'absolute',
										fontSize: '10px',
										color: '#ff4d4f',
										borderRadius: '50%',
										padding: '2px',
									}}
								/>
							)}
						</div>
					</Tooltip>
				</div>

				{/* Content */}
				<div style={{ flex: 1, minWidth: 0 }}>
					{/* Header Line */}
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginBottom: '4px',
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
							<span
								style={{
									fontWeight: isUnread ? '600' : '500',
									fontSize: '14px',
								}}
							>
								{conversation.name}
							</span>
							{conversation.tag && (
								<TagFilled style={{ color: tagColors[conversation.tag] }} />
							)}
						</div>
						<Dropdown menu={{ items: menuItems }} trigger={['click']}>
							<MoreOutlined
								style={{ fontSize: '16px', color: '#999', cursor: 'pointer' }}
								onClick={(e) => e.stopPropagation()}
							/>
						</Dropdown>
					</div>

					{/* Message Preview */}
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
							{isUnread && (
								<div
									style={{
										width: '8px',
										height: '8px',
										borderRadius: '50%',
										background: '#ff4d4f',
									}}
								/>
							)}
							<div
								style={{
									fontSize: '13px',
									color: '#000000ff',
									overflow: 'hidden',
									width: '200px',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									fontWeight: isUnread ? '700' : '400',
									marginBottom: '4px',
								}}
							>
								{conversation.lastMessage || 'Tệp đính kèm'}
							</div>
						</div>
						<span
							style={{
								fontSize: '12px',
								color: '#000000ff',
								fontWeight: isUnread ? '700' : '400',
							}}
						>
							{relativeTime}
						</span>
					</div>

					{/* Footer Line */}
					{conversation.secondaryTag && (
						<div
							style={{
								background: '#f0f0f0',
								padding: '2px 6px',
								borderRadius: '4px',
								fontSize: '11px',
								color: '#666',
								width: 'fit-content',
							}}
						>
							{conversation.secondaryTag}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
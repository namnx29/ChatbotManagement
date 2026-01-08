'use client';

import { Avatar, Dropdown } from 'antd';
import { MoreOutlined, TagFilled } from '@ant-design/icons';

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

export default function ConversationItem({ conversation, isSelected, onClick, isUnread }) {
	const menuItems = [
		{ key: 'mark-read', label: 'Đánh dấu đã đọc' },
		{ key: 'archive', label: 'Lưu trữ' },
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
						}}
					>
						{platformIcons[conversation.platform]}
					</div>
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
									width: '220px',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									fontWeight: isUnread ? '700' : '400',
									marginBottom: '4px',
								}}
							>
								{conversation.lastMessage}
							</div>
						</div>
						<span
							style={{
								fontSize: '12px',
								color: '#000000ff',
								fontWeight: isUnread ? '700' : '400',
							}}
						>
							{conversation.time}
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
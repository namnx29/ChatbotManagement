'use client';

import { Modal, Checkbox, Button, Radio } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';

export default function FilterModal({ open, onClose, initialFilters = {}, bots = [], onApply = () => { }, onReset = () => { } }) {
	const [selectedFilters, setSelectedFilters] = useState({
		channels: [],
		conversationStatus: [],
		bots: [],
		tags: [],
	});

	// Sync filters when the modal opens or when initial filters update
	useEffect(() => {
		if (!open) return;
		setSelectedFilters({
			channels: initialFilters.channels || [],
			conversationStatus: initialFilters.conversationStatus || [],
			bots: initialFilters.bots || [],
			tags: initialFilters.tags || [],
		});
	}, [open, initialFilters]);

	const [expandedSections, setExpandedSections] = useState({
		channel: false,
		conversationStatus: false,
		bot: false,
		tags: false,
	});

	const channels = [
		{ value: 'facebook', label: 'Facebook' },
		{ value: 'zalo', label: 'Zalo' },
		{ value: 'widget', label: 'Website' },
	];

	const botOptions = bots.map(bot => ({ value: bot.id || bot.value, label: bot.name || bot.label }));

	const tags = [
		{ value: 'bot-failed', label: 'Bot không trả lời được', color: '#ff4d4f' },
		{ value: 'staff-interacting', label: 'Nhân viên khác đang tương tác', color: '#6c3fb5' },
		{ value: 'bot-interacting', label: 'Bot đang tương tác', color: '#fa8c16' },
	];

	const toggleSection = (section) => {
		setExpandedSections(prev => ({
			...prev,
			[section]: !prev[section]
		}));
	};

	const handleFilterChange = (filterType, checkedValues) => {
		setSelectedFilters(prev => ({
			...prev,
			[filterType]: checkedValues
		}));
	};

	const handleApply = () => {
		onApply(selectedFilters);
		onClose();
	};

	const handleReset = () => {
		const resetFilters = {
			channels: [],
			conversationStatus: [],
			bots: [],
			tags: [],
		};
		setSelectedFilters(resetFilters);
		onReset(resetFilters);
	};

	return (
		<Modal
			open={open}
			onCancel={onClose}
			footer={null}
			width={700}
			closable={false}
			styles={{
				body: { padding: 0 },
			}}
		>
			{/* Header */}
			<div
				style={{
					marginBottom: '20px',
					borderRadius: '8px 8px 0 0',
				}}
			>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
					}}
				>
					<h2
						style={{
							fontSize: '20px',
							fontWeight: '600',
							margin: 0,
						}}
					>
						Lọc
					</h2>
					<Button
						type="primary"
						style={{
							border: 'none',
							backdropFilter: 'blur(10px)',
						}}
						onClick={handleReset}
					>
						Đặt lại
					</Button>
				</div>
			</div>

			{/* Content */}
			<div style={{ padding: '0' }}>
				<div style={{ display: 'flex', height: '300px', borderTop: '1px solid #f0f0f0' }}>
					{/* Left Column */}
					<div
						style={{
							flex: 1,
							borderRight: '1px solid #f0f0f0',
							overflowY: 'auto',
						}}
					>
						{/* Kênh */}
						<div
							style={{
								borderBottom: '1px solid #f0f0f0',
							}}
						>
							<div
								style={{
									padding: '16px 24px',
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
									cursor: 'pointer',
								}}
								onClick={() => toggleSection('channel')}
							>
								<span style={{ fontSize: '15px', fontWeight: '500' }}>Kênh</span>
								{expandedSections.channel ? (
									<UpOutlined style={{ fontSize: '12px', color: '#999' }} />
								) : (
									<DownOutlined style={{ fontSize: '12px', color: '#999' }} />
								)}
							</div>
							{expandedSections.channel && (
								<div style={{ padding: '0 24px 16px' }}>
									<Checkbox.Group
										value={selectedFilters.channels}
										onChange={(values) => handleFilterChange('channels', values)}
										style={{ width: '100%' }}
									>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
											{channels.map((channel) => (
												<Checkbox key={channel.value} value={channel.value}>
													{channel.label}
												</Checkbox>
											))}
										</div>
									</Checkbox.Group>
								</div>
							)}
						</div>

						{/* Trạng thái hội thoại */}
						{/* <div
							style={{
								borderBottom: '1px solid #f0f0f0',
							}}
						>
							<div
								style={{
									padding: '16px 24px',
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
									cursor: 'pointer',
								}}
								onClick={() => toggleSection('conversationStatus')}
							>
								<span style={{ fontSize: '15px', fontWeight: '500' }}>
									Trạng thái hội thoại
								</span>
								{expandedSections.conversationStatus ? (
									<UpOutlined style={{ fontSize: '12px', color: '#999' }} />
								) : (
									<DownOutlined style={{ fontSize: '12px', color: '#999' }} />
								)}
							</div>
							{expandedSections.conversationStatus && (
								<div style={{ padding: '0 24px 16px' }}>
									<Checkbox.Group
										value={selectedFilters.conversationStatus}
										onChange={(values) => handleFilterChange('conversationStatus', values)}
										style={{ width: '100%' }}
									>
										<div
											style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
										>
											{conversationStatuses.map((status) => (
												<div
													key={status.value}
													style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
												>
													<Checkbox value={status.value} />
													<div
														style={{
															background: status.color,
															color: 'white',
															padding: '6px 16px',
															borderRadius: '16px',
															fontSize: '13px',
															fontWeight: '500',
														}}
													>
														{status.label}
													</div>
												</div>
											))}
										</div>
									</Checkbox.Group>
								</div>
							)}
						</div> */}
						{/* Tags */}
						<div style={{ borderBottom: '1px solid #f0f0f0' }}>
							<div
								style={{
									padding: '16px 24px',
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
									cursor: 'pointer',
								}}
								onClick={() => toggleSection('tags')}
							>
								<span style={{ fontSize: '15px', fontWeight: '500' }}>Tags</span>
								{expandedSections.tags ? (
									<UpOutlined style={{ fontSize: '12px', color: '#999' }} />
								) : (
									<DownOutlined style={{ fontSize: '12px', color: '#999' }} />
								)}
							</div>

							{/* Tag Checkboxes */}
							{expandedSections.tags && (
								<div style={{ padding: '0 24px 16px' }}>
									<Checkbox.Group
										value={selectedFilters.tags}
										onChange={(values) => handleFilterChange('tags', values)}
										style={{ width: '100%' }}
									>
										<div
											style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
										>
											{tags.map((tag) => (
												<div
													key={tag.value}
													style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
												>
													<Checkbox value={tag.value} />
													<div
														style={{
															background: tag.color,
															color: 'white',
															padding: '6px 16px',
															borderRadius: '16px',
															fontSize: '13px',
															fontWeight: '500',
														}}
													>
														{tag.label}
													</div>
												</div>
											))}
										</div>
									</Checkbox.Group>
								</div>
							)}
						</div>

					</div>
					{/* Right Column */}
					<div
						style={{
							flex: 1,
							overflowY: 'auto',
						}}
					>
						<div
							style={{
								borderBottom: '1px solid #f0f0f0',
							}}
						>
							<div
								style={{
									padding: '16px 24px',
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
									cursor: 'pointer',
								}}
								onClick={() => toggleSection('bot')}
							>
								<span style={{ fontSize: '15px', fontWeight: '500' }}>Bot</span>
								{expandedSections.bot ? (
									<UpOutlined style={{ fontSize: '12px', color: '#999' }} />
								) : (
									<DownOutlined style={{ fontSize: '12px', color: '#999' }} />
								)}
							</div>
							{expandedSections.bot && (
								<div style={{ padding: '0 24px 16px' }}>
									<Checkbox.Group
										value={selectedFilters.bots}
										onChange={(values) => handleFilterChange('bots', values)}
										style={{ width: '100%' }}
									>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
											{botOptions.length === 0 ? (
												<div style={{ color: '#999' }}>Không có chatbot nào</div>
											) : (
												botOptions.map((bot) => (
													<Checkbox key={bot.value} value={bot.value}>
														{bot.label}
													</Checkbox>
												))
											)}
										</div>
									</Checkbox.Group>
								</div>
							)}

						</div>
					</div>
				</div>
			</div>

			{/* Footer */}
			<div
				style={{
					paddingTop: '16px',
					borderTop: '1px solid #f0f0f0',
					display: 'flex',
					justifyContent: 'flex-end',
					gap: '12px',
				}}
			>
				<Button size="large" onClick={onClose}>
					Thoát
				</Button>
				<Button
					type="primary"
					size="large"
					onClick={handleApply}
					style={{
						background: '#6c3fb5',
						borderColor: '#6c3fb5',
					}}
				>
					Áp dụng
				</Button>
			</div>
		</Modal >
	);
}
'use client';

import { Button, Table, Avatar, Tag, App } from 'antd';
import { UserOutlined, PlusOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { useRouter } from "next/navigation";
import { fetchProfile, getAvatarUrl } from "@/lib/api";
import dayjs from 'dayjs';
import CreateStaffModal from '@/lib/components/popup/CreateStaffModal';

export default function MembersPermissionsPage() {
	const { message } = App.useApp();
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [members, setMembers] = useState([]);
	const [isModalOpen, setIsModalOpen] = useState(false);

	useEffect(() => {
		const checkAuth = async () => {
			const storedUserEmail = localStorage.getItem("userEmail");
			const accountId = localStorage.getItem("accountId");

			if (!storedUserEmail || !accountId) {
				router.push("/login");
				return;
			}

			try {
				const result = await fetchProfile(accountId);

				if (result.success && result.data) {
					const memberData = {
						id: accountId,
						name: result.data.name,
						email: storedUserEmail,
						role: 'Chủ sở hữu',
						roleColor: 'green',
						phone: result.data.phone_number || "Chưa cập nhật",
						createdAt: result.data.created_at
							? dayjs(result.data.created_at).format('DD/MM/YYYY - HH:mm')
							: "N/A",
						avatar: result.data.avatar_url,
					};

					setMembers([memberData]);
				}
			} catch (error) {
				console.error("Failed to fetch profile:", error);
				message.error("Failed to load profile data");
			}
			setIsLoading(false);
		};

		checkAuth();
	}, [router]);

	const columns = [
		{
			title: 'Tên',
			dataIndex: 'name',
			key: 'name',
			render: (text, record) => (
				<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
					<Avatar
						size={40}
						src={record.avatar ? getAvatarUrl(record.avatar) : null}
						icon={!record.avatar && <UserOutlined />}
						style={{ background: '#d9d9d9' }}
					/>
					<div>
						{/* Name and Tag in a flex container */}
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
							<span style={{ fontWeight: '500', fontSize: '14px' }}>
								{text}
							</span>
							<Tag
								color={record.roleColor}
								style={{ margin: 0, lineHeight: '20px' }}
							>
								{record.role}
							</Tag>
						</div>

						<div style={{
							fontSize: '13px',
							color: '#666',
							marginTop: '2px'
						}}>
							{record.email}
						</div>
					</div>
				</div>
			),
		},
		{
			title: 'Vai trò',
			dataIndex: 'role',
			key: 'role',
			align: 'center',
			render: (text) => (
				<span style={{ color: '#6c3fb5', cursor: 'pointer', fontWeight: '500' }}>
					{text}
				</span>
			),
		},
		{
			title: 'Số điện thoại',
			dataIndex: 'phone',
			key: 'phone',
			align: 'center',
		},
		{
			title: 'Ngày tạo',
			dataIndex: 'createdAt',
			key: 'createdAt',
			align: 'center',
		},
	];

	return (
		<div style={{ padding: '24px' }}>
			{/* Header */}
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginBottom: '24px',
				}}
			>
				<h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>
					Thành viên & Quyền truy cập
				</h1>
				<div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
					<span style={{ fontSize: '14px', color: '#666' }}>Thành viên</span>
					<div
						style={{
							background: '#f0f0f0',
							padding: '4px 12px',
							borderRadius: '4px',
							fontWeight: '500',
						}}
					>
						0/5
					</div>
					<Button
						type="primary"
						icon={<PlusOutlined />}
						style={{
							background: '#6c3fb5',
							borderColor: '#6c3fb5',
							display: 'flex',
							alignItems: 'center',
							gap: '8px',
						}}
						onClick={() => setIsModalOpen(true)}
					>
						Thêm thành viên
					</Button>
				</div>
			</div>

			{/* Members Table */}
			<div>
				<h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
					Thành viên
				</h2>
				<Table
					columns={columns}
					dataSource={members}
					rowKey="id"
					pagination={false}
					style={{
						background: 'white',
						borderRadius: '8px',
					}}
				/>
			</div>

			<CreateStaffModal
				open={isModalOpen}
				onClose={() => setIsModalOpen(false)}
			/>
		</div>
	);
}
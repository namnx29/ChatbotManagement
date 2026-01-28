'use client';

import { Button, Table, Avatar, Tag, App, Popconfirm, Space, Input } from 'antd';
import { UserOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { useRouter } from "next/navigation";
import { getAvatarUrl, listStaffAccounts, deleteStaff } from "@/lib/api";
import CreateStaffModal from '@/lib/components/popup/CreateStaffModal';
import EditStaffModal from '@/lib/components/popup/EditStaffModal';
import VerifyPasswordModal from '@/lib/components/popup/VerifyPasswordModal';
import ConfirmModal from '@/lib/components/popup/ConfirmModal';

export default function MembersPermissionsPage() {
	const { message } = App.useApp();
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [staffList, setStaffList] = useState([]);
	const [staffLoading, setStaffLoading] = useState(false);
	const [searchText, setSearchText] = useState('');

	// Modal states
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isVerifyPasswordModalOpen, setIsVerifyPasswordModalOpen] = useState(false);
	const [selectedStaff, setSelectedStaff] = useState(null);
	const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

	// Load admin profile and staff list
	useEffect(() => {
		const checkAuth = async () => {
			const storedUserEmail = localStorage.getItem("userEmail");
			const accountId = localStorage.getItem("accountId");

			if (!storedUserEmail || !accountId) {
				router.push("/login");
				return;
			}

			// Load staff list
			await loadStaffList();
			setIsLoading(false);
		};

		checkAuth();
	}, [router]);

	// Load staff list
	const loadStaffList = async () => {
		try {
			setStaffLoading(true);
			const result = await listStaffAccounts(0, 50, searchText || null);

			if (result.success) {
				const formatted = result.data.staff.map((staff) => ({
					id: staff.accountId,
					avatar: staff.avatarUrl,
					accountId: staff.accountId,
					name: staff.name,
					username: staff.username,
					phone: staff.phoneNumber || "",
				}));
				setStaffList(formatted);
			} else {
				message.error(result.message || "Failed to load staff");
			}
		} catch (error) {
			console.error("Failed to load staff:", error);
			message.error("Failed to load staff list");
		} finally {
			setStaffLoading(false);
		}
	};

	// Handle delete staff
	const handleDeleteStaff = async (staffAccountId) => {
		try {
			const result = await deleteStaff(staffAccountId);
			if (result.success) {
				message.success("Staff deleted successfully");
				setIsConfirmModalOpen(false);
				setSelectedStaff(null);
				await loadStaffList();
			} else {
				message.error(result.message || "Failed to delete staff");
			}
		} catch (error) {
			message.error(error.message || "Failed to delete staff");
		}
	};

	// Handle edit staff
	const handleEditStaff = (staff) => {
		setSelectedStaff({
			accountId: staff.id,
			username: staff.username,
			name: staff.name,
			phoneNumber: staff.phone,
		});
		setIsEditModalOpen(true);
	};

	// Handle view password
	const handleViewPassword = (staff) => {
		setSelectedStaff(staff);
		setIsVerifyPasswordModalOpen(true);
	};

	// Handle success callbacks
	const handleCreateSuccess = () => {
		loadStaffList();
	};

	const handleEditSuccess = () => {
		loadStaffList();
		setIsEditModalOpen(false);
	};

	const staffColumns = [
		{
			title: 'Tên',
			dataIndex: 'name',
			key: 'name',
			render: (text, record) => (
				<div>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
						<Avatar
							size={40}
							src={record.avatar ? getAvatarUrl(record.avatar) : null}
							icon={!record.avatar && <UserOutlined />}
							style={{ background: '#d9d9d9' }}
						/>
						<div>
							<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
								<span style={{ fontWeight: '500', fontSize: '14px' }}>
									{text}
								</span>
							</div>

							<div style={{
								fontSize: '13px',
								color: '#666',
								marginTop: '2px'
							}}>
								{record.username}
							</div>
						</div>
					</div>
				</div>
			),
		},
		{
			title: 'Số điện thoại',
			dataIndex: 'phone',
			key: 'phone',
			align: 'center',
		},
		{
			title: 'Mật khẩu',
			key: 'password',
			align: 'center',
			render: (_, record) => (
				<Space>
					<Button
						type="primary"
						size="small"
						icon={<EyeOutlined />}
						onClick={() => handleViewPassword(record)}
						style={{
							background: '#6c3fb5',
							borderColor: '#6c3fb5',
						}}
						title="View password"
					/>
				</Space>
			)
		},
		{
			title: 'Hành động',
			key: 'action',
			align: 'center',
			render: (_, record) => (
				<Space>
					<Button
						type="default"
						size="small"
						icon={<EditOutlined />}
						onClick={() => handleEditStaff(record)}
						title="Edit"
					/>
					<Button
						danger
						type="default"
						size="small"
						icon={<DeleteOutlined />}
						title="Delete"
						onClick={() => { setIsConfirmModalOpen(true), setSelectedStaff(record) }}
					/>
				</Space>
			),
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
						{staffList.length}/5
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
						onClick={() => setIsCreateModalOpen(true)}
						disabled={staffList.length >= 5}
					>
						Thêm thành viên
					</Button>
				</div>
			</div>

			{/* Staff Section */}
			<div>
				<div style={{ marginBottom: '16px' }}>
					<h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>
						Nhân viên ({staffList.length})
					</h2>
					<Input.Search
						placeholder="Search by name or username"
						onChange={(e) => setSearchText(e.target.value)}
						onSearch={() => loadStaffList()}
						style={{ marginBottom: '16px', width: '300px' }}
					/>
				</div>
				<Table
					columns={staffColumns}
					dataSource={staffList}
					rowKey="id"
					pagination={false}
					loading={staffLoading}
					style={{
						background: 'white',
						borderRadius: '8px',
					}}
				/>
			</div>

			{/* Modals */}
			<CreateStaffModal
				open={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				onSuccess={handleCreateSuccess}
			/>

			<EditStaffModal
				open={isEditModalOpen}
				onClose={() => {
					setIsEditModalOpen(false);
					setSelectedStaff(null);
				}}
				staff={selectedStaff}
				onSuccess={handleEditSuccess}
			/>

			<VerifyPasswordModal
				open={isVerifyPasswordModalOpen}
				onClose={() => {
					setIsVerifyPasswordModalOpen(false);
					setSelectedStaff(null);
				}}
				staffAccountId={selectedStaff?.id}
				onPasswordRetrieved={() => {
					// Password retrieved successfully
				}}
			/>

			<ConfirmModal
				open={isConfirmModalOpen}
				onClose={() => setIsConfirmModalOpen(false)}
				onCancel={() => setIsConfirmModalOpen(false)}
				title="Xác nhận xóa thành viên"
				description="Bạn có chắc chắn muốn xóa thành viên này không?"
				onConfirm={() => handleDeleteStaff(selectedStaff?.id)}
			/>
		</div>
	);
}

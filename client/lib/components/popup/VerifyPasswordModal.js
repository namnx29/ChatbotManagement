'use client';

import { Modal, Form, Input, Button, App, Spin, Card, Typography } from 'antd';
import { LockOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import { verifyAdminPassword, getStaffPassword } from '@/lib/api';

const { Text } = Typography;

export default function VerifyPasswordModal({
	open,
	onClose,
	staffAccountId,
	onPasswordRetrieved,
}) {
	const [form] = Form.useForm();
	const { message } = App.useApp();
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [retrievedPassword, setRetrievedPassword] = useState(null);
	const [expiryTime, setExpiryTime] = useState(null);

	// Helper: Check if the current session in localStorage is still valid
	const getValidSession = useCallback(() => {
		const token = localStorage.getItem('admin_verify_token');
		const expiresAt = localStorage.getItem('admin_verify_expiry');

		if (!token || !expiresAt) return null;

		// Ensure the ISO string is treated as UTC by adding 'Z' if missing
		const expiryDate = new Date(expiresAt.endsWith('Z') ? expiresAt : `${expiresAt}Z`);
		const now = new Date();

		if (expiryDate > now) {
			return { token, expiresAt: expiryDate };
		} else {
			// Clean up expired session
			localStorage.removeItem('admin_verify_token');
			localStorage.removeItem('admin_verify_expiry');
			return null;
		}
	}, []);

	// Helper: Fetch staff password using a token
	const fetchStaffPassword = async (token) => {
		setLoading(true);
		const result = await getStaffPassword(staffAccountId, token);
		if (result.success) {
			setRetrievedPassword(result.data.password);
			if (onPasswordRetrieved) onPasswordRetrieved(result.data.password);
		} else {
			message.error(result.message || 'Không thể lấy mật khẩu');
			// If token is invalid/expired on server side, clear local session
			localStorage.removeItem('admin_verify_token');
			localStorage.removeItem('admin_verify_expiry');
		}
		setLoading(false);
	};

	// Check session every time the modal opens
	useEffect(() => {
		if (open) {
			const session = getValidSession();
			if (session) {
				setExpiryTime(session.expiresAt);
				fetchStaffPassword(session.token);
			}
		} else {
			// Reset local states when closing, but keep localStorage
			setRetrievedPassword(null);
			setShowPassword(false);
			form.resetFields();
		}
	}, [open, getValidSession, staffAccountId]);

	const handleVerifyPassword = async () => {
		try {
			const values = await form.validateFields();
			setLoading(true);

			const verifyResult = await verifyAdminPassword(values.password);

			if (verifyResult.success) {
				const { token, expires_at } = verifyResult.data;

				// Save to localStorage for 5-minute persistence
				localStorage.setItem('admin_verify_token', token);
				localStorage.setItem('admin_verify_expiry', expires_at);

				// Set local display time (handling UTC)
				setExpiryTime(new Date(expires_at.endsWith('Z') ? expires_at : `${expires_at}Z`));

				// Proceed to get the staff password
				await fetchStaffPassword(token);
				message.success('Xác thực thành công');
			} else {
				message.error(verifyResult.message || 'Mật khẩu không chính xác');
			}
		} catch (error) {
			console.error('Verify error:', error);
		} finally {
			setLoading(false);
		}
	};

	const handleCancel = () => {
		onClose();
	};

	return (
		<Modal
			open={open}
			onCancel={handleCancel}
			footer={null}
			destroyOnHidden
			forceRender
			width={500}
			title={
				<h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
					{retrievedPassword ? 'Mật khẩu thành viên' : 'Xác thực mật khẩu'}
				</h2>
			}
		>
			<Spin spinning={loading}>
				<div style={{ marginTop: '24px' }}>
					{retrievedPassword ? (
						/* VIEW 1: SHOW STAFF PASSWORD */
						<>
							<p style={{ color: '#666', marginBottom: '16px' }}>
								Phiên xác thực sẽ hết hạn lúc: <strong>{expiryTime?.toLocaleTimeString('vi-VN')}</strong>
							</p>

							<Card
								size="small"
								styles={{
									body: {
										background: '#f5f5f5',
										borderRadius: 4,
									},
								}}
								extra={
									<Text
										copyable={{
											text: retrievedPassword,
										}}
									>
										Sao chép
									</Text>
								}
							>
								<div
									style={{
										display: 'flex',
										justifyContent: 'space-between',
										alignItems: 'center',
									}}
								>
									<Text
										style={{
											fontFamily: 'monospace',
											fontSize: 16,
											fontWeight: 600,
										}}
									>
										{showPassword ? retrievedPassword : '•'.repeat(6)}
									</Text>

									<Button
										type="text"
										icon={showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
										onClick={() => setShowPassword(!showPassword)}
									/>
								</div>
							</Card>
						</>
					) : (
						/* VIEW 2: ADMIN PASSWORD FORM */
						<Form
							form={form}
							layout="vertical"
							onFinish={handleVerifyPassword}
							requiredMark={false}
						>
							<p style={{ color: '#666', marginBottom: '16px' }}>
								Nhập mật khẩu của bạn để xem mật khẩu thành viên. Phiên xác thực sẽ tồn tại trong 5 phút.
							</p>

							<Form.Item
								label={<span style={{ fontWeight: '500' }}>Mật khẩu của bạn</span>}
								name="password"
								rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
							>
								<Input.Password
									prefix={<LockOutlined style={{ color: '#999' }} />}
									placeholder="Nhập mật khẩu"
									size="large"
									disabled={loading}
								/>
							</Form.Item>

							<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}>
								<Button size="large" onClick={handleCancel} disabled={loading}>Hủy</Button>
								<Button
									type="primary"
									size="large"
									htmlType="submit"
									loading={loading}
									style={{ background: '#6c3fb5', borderColor: '#6c3fb5' }}
								>
									Xác thực
								</Button>
							</div>
						</Form>
					)}
				</div>
			</Spin>
		</Modal>
	);
}
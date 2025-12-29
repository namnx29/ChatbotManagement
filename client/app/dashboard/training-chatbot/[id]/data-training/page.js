"use client";

import { useEffect, useState, useMemo, use } from "react";
import { Button, Badge, Empty, Table, Space, Typography, message } from "antd";
import {
  QuestionCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  LockOutlined,
  EditOutlined,
} from "@ant-design/icons";

import DataTrainingDrawer from "@/lib/components/training/DataTrainingDrawer";
import ConfirmModal from "@/lib/components/popup/ConfirmModal";
import {
  listTrainingData,
  createTrainingData,
  updateTrainingData,
  deleteTrainingData,
  deleteTrainingDataMultiple,
} from "@/lib/api";

const { Title, Text } = Typography;

export default function TrainingDataPage({ params }) {
  const { id } = use(params);
  const botId = id || (typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean).pop() : 'default');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMultiple, setConfirmMultiple] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortOrder, setSortOrder] = useState('newest');

  const fetchData = async () => {
    setLoading(true);
    try {
      const skip = (currentPage - 1) * pageSize;
      const res = await listTrainingData(botId, { limit: pageSize, skip, order: sortOrder });
      if (res.success) {
        setItems(res.data || []);
        if (res.total !== undefined) setTotal(res.total);
      } else {
        message.error(res.message || 'Failed to load data training');
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to load data training');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [botId, pageSize, sortOrder, currentPage]);

  // Reset to first page when pageSize or sortOrder changes
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, sortOrder]);

  // FAQ count should reflect the total number of records in DB (not current page size)
  const faqCount = total;

  const handleAddClick = () => {
    setEditingItem(null);
    setDrawerOpen(true);
  };

  const handleDrawerSubmit = async (values) => {
    setDrawerLoading(true);
    try {
      if (editingItem) {
        const res = await updateTrainingData(botId, editingItem.id, values);
        if (res.success) {
          message.success('Cập nhật thành công');
          await fetchData();
          setDrawerOpen(false);
        } else {
          message.error(res.message || 'Cập nhật thất bại');
        }
      } else {
        const res = await createTrainingData(botId, values);
        if (res.success) {
          message.success('Thêm thành công');
          await fetchData();
          setDrawerOpen(false);
        } else {
          message.error(res.message || 'Thêm thất bại');
        }
      }
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu dữ liệu');
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleEdit = (record) => {
    setEditingItem(record);
    setDrawerOpen(true);
  };

  const handleDelete = (record) => {
    setConfirmMultiple(false);
    setConfirmOpen(true);
    setEditingItem(record);
  };

  const confirmDelete = async () => {
    if (!editingItem) return;
    try {
      const res = await deleteTrainingData(botId, editingItem.id);
      if (res.success) {
        message.success('Xóa thành công');
        await fetchData();
        setConfirmOpen(false);
        setEditingItem(null);
      } else {
        message.error(res.message || 'Xóa thất bại');
      }
    } catch (err) {
      console.error(err);
      message.error('Xóa thất bại');
    }
  };

  const confirmDeleteMultiple = async () => {
    if (!selectedRowKeys.length) return;
    try {
      await deleteTrainingDataMultiple(botId, selectedRowKeys);
      message.success('Xóa thành công');
      setSelectedRowKeys([]);
      await fetchData();
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      message.error('Xóa thất bại');
    }
  };

  const columns = useMemo(() => [
    {
      title: 'Câu hỏi',
      dataIndex: 'question',
      key: 'question',
      render: (text) => <Text ellipsis={{ tooltip: text }} style={{ maxWidth: 420 }}>{text}</Text>,
    },
    {
      title: 'Câu trả lời',
      dataIndex: 'answer',
      key: 'answer',
      render: (text) => <Text ellipsis={{ tooltip: text }} style={{ maxWidth: 420 }}>{text}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => (
        <span>
          {status === 'active' ? (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          ) : (
            <LockOutlined style={{ color: '#999' }} />
          )}
        </span>
      ),
    },
    {
      title: 'Hành động',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button icon={<DeleteOutlined />} danger onClick={() => handleDelete(record)} />
        </Space>
      ),
    },
  ], []);

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  return (
    <div style={{ minHeight: '100%', background: '#fff' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>
          Dữ liệu huấn luyện
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {<SwapOutlined />}
            Sắp xếp theo
          </div>
          <Button type={sortOrder === 'newest' ? 'primary' : 'default'} onClick={() => { setSortOrder('newest'); fetchData(); }}>Mới nhất</Button>
          <Button type={sortOrder === 'oldest' ? 'primary' : 'default'} onClick={() => { setSortOrder('oldest'); fetchData(); }}>Cũ nhất</Button>
        </div>
      </div>

      {/* FAQ Section Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '500', margin: 0 }}>
            FAQ ({faqCount})
          </h2>
          <Button
            type="link"
            icon={<QuestionCircleOutlined />}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6c3fb5' }}
          >
            Tôi phải thêm câu hỏi bằng cách nào
          </Button>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Badge count={selectedRowKeys.length}>
            <Button icon={<DeleteOutlined />} disabled={!selectedRowKeys.length} onClick={() => { setConfirmMultiple(true); setConfirmOpen(true); }} />
          </Badge>
          <Button icon={<DownloadOutlined />}>Xuất file FAQs</Button>
          <Button icon={<UploadOutlined />} style={{ background: '#6c3fb5', color: 'white', borderColor: '#6c3fb5' }}>Nhập file FAQs</Button>
          <Button type="primary" icon={<PlusOutlined />} style={{ background: '#6c3fb5', borderColor: '#6c3fb5' }} onClick={handleAddClick}>Thêm FAQs</Button>
        </div>
      </div>

      {/* Table or Empty */}
      <div style={{ padding: 20 }}>
        {items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
            <Empty description={<span>Không có dữ liệu. Hãy thêm Câu hỏi thường gặp để bắt đầu.</span>} />
          </div>
        ) : (
          <Table
            rowKey={(r) => r.id}
            dataSource={items}
            columns={columns}
            loading={loading}
            rowSelection={rowSelection}
            scroll={{ y: 55 * 6}}
            pagination={{ current: currentPage, pageSize: pageSize, total: total, pageSizeOptions: ['5','10','20','50','100'], showSizeChanger: true, onChange: (page, size) => { setCurrentPage(page); setPageSize(size); } }}
          />
        )}
      </div>

      <DataTrainingDrawer
        open={drawerOpen}
        initialValues={editingItem}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleDrawerSubmit}
        loading={drawerLoading}
      />

      <ConfirmModal
        open={confirmOpen}
        title={confirmMultiple ? `Xóa ${selectedRowKeys.length} mục?` : 'Xóa mục này?'}
        description={confirmMultiple ? 'Bạn có chắc muốn xóa các mục đã chọn không?' : 'Bạn có chắc muốn xóa mục này không?'}
        onCancel={() => { setConfirmOpen(false); setEditingItem(null); }}
        onConfirm={confirmMultiple ? confirmDeleteMultiple : confirmDelete}
        confirmText="Xóa"
      />
    </div>
  );
}
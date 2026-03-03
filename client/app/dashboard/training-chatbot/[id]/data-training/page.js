"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Button, Table, Space, Typography, App,
  Breadcrumb, Input, Progress, Modal, Upload, Card, Flex, Dropdown
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  GlobalOutlined,
  ArrowLeftOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  FolderOutlined,
  PlusOutlined
} from "@ant-design/icons";

const { Title, Text } = Typography;

// --- MOCK DATA ---
const MOCK_DB = [
  { id: '1', name: 'Tài liệu kỹ thuật', type: 'folder', parentId: null, updatedAt: '2024-03-01' },
  { id: '2', name: 'Quy trình nhân sự.pdf', type: 'file', parentId: null, updatedAt: '2024-02-28' },
  { id: '3', name: 'Hướng dẫn sử dụng.docx', type: 'file', parentId: '1', updatedAt: '2024-03-02' },
  { id: '4', name: 'API_Specs.json', type: 'file', parentId: '1', updatedAt: '2024-03-03' },
  { id: '5', name: 'Hình ảnh dự án', type: 'folder', parentId: '1', updatedAt: '2024-03-01' },
];

export default function TrainingDataPage() {
  const { message, modal } = App.useApp();

  // Refs để trigger hidden upload inputs
  const fileUploadRef = useRef(null);
  const folderUploadRef = useRef(null);

  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [btnLoading, setBtnLoading] = useState({
    scan: false, export: false, upload: false, delete: null
  });

  const [allData, setAllData] = useState(MOCK_DB);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [scanUrl, setScanUrl] = useState("");

  const runProgress = () => {
    setShowProgress(true);
    setLoadingProgress(20);
    const interval = setInterval(() => {
      setLoadingProgress(prev => (prev < 90 ? prev + 5 : prev));
    }, 200);
    return interval;
  };

  const finishProgress = (interval) => {
    clearInterval(interval);
    setLoadingProgress(100);
    setTimeout(() => {
      setShowProgress(false);
      setLoadingProgress(0);
    }, 400);
  };

  const handleUploadFiles = async (options) => {
    const { file } = options;
    setBtnLoading(prev => ({ ...prev, upload: true }));
    const progressInterval = runProgress();

    setTimeout(() => {
      const newEntry = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.webkitRelativePath || file.name,
        type: 'file',
        parentId: currentFolderId,
        updatedAt: new Date().toISOString().split('T')[0]
      };
      setAllData(prev => [...prev, newEntry]);
      finishProgress(progressInterval);
      setBtnLoading(prev => ({ ...prev, upload: false }));
      message.success(`Đã tải lên: ${file.name}`);
    }, 1000);
  };

  // Cấu hình Menu cho Dropdown
  const uploadMenuItems = [
    {
      key: '1',
      label: 'Tải lên tệp tin',
      icon: <FileTextOutlined />,
      onClick: () => {
        const input = document.getElementById('hidden-file-upload');
        if (input) input.click();
      }
    },
    {
      key: '2',
      label: 'Tải lên thư mục',
      icon: <FolderOutlined />,
      onClick: () => {
        const input = document.getElementById('hidden-folder-upload');
        if (input) input.click();
      }
    },
  ];

  // Logic hiển thị Files/Folders & Breadcrumbs (Giữ nguyên từ code cũ)
  const displayItems = useMemo(() => allData.filter(i => i.parentId === currentFolderId), [allData, currentFolderId]);
  const breadcrumbItems = useMemo(() => {
    const items = [{ title: <span onClick={() => setCurrentFolderId(null)} style={{ cursor: 'pointer' }}>Root</span> }];
    const path = [];
    let current = allData.find(i => i.id === currentFolderId);
    while (current) {
      path.unshift(current);
      current = allData.find(i => i.id === current.parentId);
    }
    path.forEach(p => {
      items.push({ title: <span onClick={() => setCurrentFolderId(p.id)} style={{ cursor: 'pointer' }}>{p.name}</span> });
    });
    return items;
  }, [allData, currentFolderId]);

  const columns = [
    {
      title: 'Tên',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space onClick={() => record.type === 'folder' && setCurrentFolderId(record.id)} style={{ cursor: record.type === 'folder' ? 'pointer' : 'default' }}>
          {record.type === 'folder' ? <FolderOpenOutlined style={{ color: '#faad14' }} /> : <FileTextOutlined style={{ color: '#1890ff' }} />}
          <Text strong={record.type === 'folder'}>{text}</Text>
        </Space>
      ),
    },
    { title: 'Ngày cập nhật', dataIndex: 'updatedAt', key: 'updatedAt', width: 150 },
    {
      title: 'Hành động',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button type="text" danger icon={<DeleteOutlined />} loading={btnLoading.delete === record.id} onClick={() => handleDelete(record)} />
      ),
    },
  ];

  // --- HANDLERS HOÀN CHỈNH ---

  const handleScanUrl = () => {
    if (!scanUrl) return message.warning("Vui lòng nhập URL");

    setBtnLoading(prev => ({ ...prev, scan: true }));
    const progressInterval = runProgress();

    setTimeout(() => {
      const newFile = {
        id: Date.now().toString(),
        name: `Scanned: ${scanUrl.replace(/(^\w+:|^)\/\//, '')}.txt`,
        type: 'file',
        parentId: currentFolderId,
        updatedAt: new Date().toISOString().split('T')[0]
      };
      setAllData(prev => [...prev, newFile]);
      finishProgress(progressInterval);
      setBtnLoading(prev => ({ ...prev, scan: false }));
      message.success("Đã scan và đưa vào hàng chờ huấn luyện");
      setScanUrl("");
    }, 2000);
  };

  const handleExportJson = () => {
    setBtnLoading(prev => ({ ...prev, export: true }));
    const progressInterval = runProgress();

    setTimeout(() => {
      const dataToExport = { organizationId: "org_123", data: allData };
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai_training_data_${new Date().getTime()}.json`;
      a.click();

      finishProgress(progressInterval);
      setBtnLoading(prev => ({ ...prev, export: false }));
      message.success("Đã xuất file JSON thành công");
    }, 1500);
  };

  const handleDelete = (record) => {
    modal.confirm({
      title: `Xóa ${record.type === 'folder' ? 'thư mục' : 'tập tin'}?`,
      icon: <ExclamationCircleOutlined />,
      content: `Dữ liệu "${record.name}" sẽ bị gỡ bỏ khỏi mô hình huấn luyện.`,
      okText: 'Xóa',
      okType: 'danger',
      onOk: () => {
        setBtnLoading(prev => ({ ...prev, delete: record.id }));
        const progressInterval = runProgress();

        return new Promise((resolve) => {
          setTimeout(() => {
            setAllData(prev => prev.filter(item => item.id !== record.id));
            finishProgress(progressInterval);
            setBtnLoading(prev => ({ ...prev, delete: null }));
            message.success("Đã xóa dữ liệu");
            resolve();
          }, 1000);
        });
      },
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff' }}>
      <Card variant="flat" style={{ borderRadius: 0, borderBottom: '1px solid #f0f0f0' }}>
        <Flex justify="space-between" align="center">
          <div>
            <Title level={3} style={{ margin: 0 }}>Dữ liệu huấn luyện AI</Title>
            <Text type="secondary">Cung cấp dữ liệu để AI học từ File, Folder hoặc Website</Text>
          </div>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleExportJson} loading={btnLoading.export}>
              Xuất Chat JSON
            </Button>

            {/* DROPDOWN UPLOAD DUY NHẤT */}
            <Dropdown menu={{ items: uploadMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={{ background: '#6c3fb5', borderColor: '#6c3fb5' }}
                loading={btnLoading.upload}
              >
                Tải lên mới
              </Button>
            </Dropdown>

            {/* Hidden Upload Components */}
            <div style={{ display: 'none' }}>
              <Upload
                id="hidden-file-upload"
                multiple
                showUploadList={false}
                customRequest={handleUploadFiles}
              />
              <Upload
                id="hidden-folder-upload"
                directory
                showUploadList={false}
                customRequest={handleUploadFiles}
              />
            </div>
          </Space>
        </Flex>
      </Card>

      <div>
        {showProgress && <Progress percent={loadingProgress} showInfo={false} strokeColor="#6c3fb5" size="small" />}
        <Flex vertical>
          {/* Web Scanner */}
          <Card title={<Space><GlobalOutlined /> Trình quét Website</Space>}>
            <Flex gap="middle">
              <Input placeholder="Nhập link tài liệu huấn luyện..." value={scanUrl} onChange={(e) => setScanUrl(e.target.value)} prefix={<SearchOutlined />} />
              <Button type="primary" onClick={handleScanUrl} loading={btnLoading.scan}>Scan & Training</Button>
            </Flex>
          </Card>

          {/* File Explorer */}
          <Card title={<Space><FolderOutlined /> Danh sách files/folders</Space>}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
              <Breadcrumb items={breadcrumbItems} />
              {currentFolderId && (
                <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => {
                  const parent = allData.find(i => i.id === currentFolderId)?.parentId;
                  setCurrentFolderId(parent || null);
                }}>Quay lại</Button>
              )}
            </Flex>
            <Table
              dataSource={displayItems}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="middle"
              style={{ overflow: 'auto', height: `calc(100vh - 450px)` }}
            />
          </Card>
        </Flex>
      </div>
      {/* Đặt đoạn này ở cuối cùng, ngay trước thẻ đóng </div> của return */}
      <div style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }}>
        <Upload
          id="hidden-file-upload"
          multiple
          showUploadList={false}
          customRequest={handleUploadFiles}
        >
          <button type="button"></button>
        </Upload>
        <Upload
          id="hidden-folder-upload"
          directory
          showUploadList={false}
          customRequest={handleUploadFiles}
        >
          <button type="button"></button>
        </Upload>
      </div>
    </div>
  );
}
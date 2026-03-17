"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Button, Table, Space, Typography, App,
  Breadcrumb, Input, Progress, Modal, Upload, Card, Flex, Dropdown
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
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
const baseUrl = process.env.NEXT_PUBLIC_API_URL;

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

  const [allData, setAllData] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [scanUrl, setScanUrl] = useState("");

  const convertFilesToTree = (files) => {
    const result = [];
    const folderMap = {};

    files.forEach((path) => {
      const parts = path.split("/");
      let parentId = null;
      let currentPath = "";

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        const isFile = index === parts.length - 1;

        if (isFile) {
          result.push({
            id: `file-${currentPath}`,
            name: part,
            type: "file",
            parentId: parentId,
            fullPath: currentPath,
            updatedAt: new Date().toISOString().split("T")[0]
          });
        } else {
          if (!folderMap[currentPath]) {
            const folderId = `folder-${currentPath}`;

            folderMap[currentPath] = folderId;

            result.push({
              id: folderId,
              name: part,
              type: "folder",
              parentId: parentId,
              updatedAt: new Date().toISOString().split("T")[0]
            });
          }

          parentId = folderMap[currentPath];
        }
      });
    });

    return result;
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/files`);
      const data = await res.json();

      const structuredData = convertFilesToTree(data.files);

      setAllData(structuredData);

    } catch (error) {
      message.error("Không thể tải danh sách file");
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

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
    const { file, onSuccess, onError } = options;

    try {
      const formData = new FormData();
      formData.append("file", file);

      await fetch(`${baseUrl}/api/upload`, {
        method: "POST",
        body: formData
      });

      onSuccess("ok");

      message.success(`Uploaded ${file.name}`);

      await fetchFiles();

    } catch (err) {
      onError(err);
    }
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

  const exportTrainingJson = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/export-training-json`);

      const blob = await res.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "training_data.json";
      a.click();

      window.URL.revokeObjectURL(url);

      message.success("Xuất file JSON thành công");

    } catch (err) {
      message.error("Không thể xuất file JSON");
    }
  };

  const handleDelete = (record) => {
    modal.confirm({
      title: `Xóa ${record.type === 'folder' ? 'thư mục' : 'tập tin'}?`,
      icon: <ExclamationCircleOutlined />,
      content: `Dữ liệu "${record.name}" sẽ bị gỡ bỏ khỏi mô hình huấn luyện.`,
      okText: 'Xóa',
      okType: 'danger',

      onOk: async () => {
        setBtnLoading(prev => ({ ...prev, delete: record.id }));

        const progressInterval = runProgress();

        try {
          const res = await fetch(`${baseUrl}/api/files/${encodeURIComponent(record.fullPath)}`, {
            method: "DELETE"
          });

          const data = await res.json();

          if (data.status === "success") {
            message.success(`Đã xóa ${record.name}`);

            await fetchFiles(); // refresh list
          } else {
            message.error("Xóa file thất bại");
          }

        } catch (error) {
          message.error("Không thể xóa file");
        }

        finishProgress(progressInterval);

        setBtnLoading(prev => ({ ...prev, delete: null }));
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
            <Button icon={<DownloadOutlined />} onClick={exportTrainingJson} loading={btnLoading.export}>
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
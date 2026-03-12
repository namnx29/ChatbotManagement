// app/dashboard/chatbot/[id]/overview/page.js
"use client";

import {
  Input,
  Button,
  Avatar,
  Select,
  Slider,
  Switch,
  InputNumber,
  Card,
  Tooltip,
} from "antd";
import {
  QuestionCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  MinusOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { useState } from "react";

const { TextArea } = Input;

export default function BotOverviewPage() {
  const [botName, setBotName] = useState("bot-demo");
  const [businessName, setBusinessName] = useState("");
  const [temperature, setTemperature] = useState(0.85);
  const [responseTime, setResponseTime] = useState(5);
  const [phoneToggle, setPhoneToggle] = useState(false);
  const [addressToggle, setAddressToggle] = useState(false);
  const [greetingEnabled, setGreetingEnabled] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [reactionEnabled, setReactionEnabled] = useState(false);
  const [imageReadingEnabled, setImageReadingEnabled] = useState(false);
  const [autoReplyMessage, setAutoReplyMessage] = useState("Xác thực ngay!");
  const [silentMode, setSilentMode] = useState(false);
  const [useLLM, setUseLLM] = useState(true);
  const [silentOnOtherPlatform, setSilentOnOtherPlatform] = useState(false);

  return (
    <div
      style={{
        maxWidth: "100%",
        flexGrow: 1,
        overflowY: "auto",
        height: "calc(100vh - 100px)",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "13px 20px",
          borderBottom: "1px solid #f0f0f0",
          position: "sticky",
          top: 0,
          zIndex: 999,
          background: "#fff",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: "600", margin: 0 }}>
          Tổng quan
        </h1>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 12px",
              background: "#f5f5f5",
              borderRadius: "6px",
            }}
          >
            <QuestionCircleOutlined />
            <span style={{ fontSize: "14px" }}>Bot version 1</span>
          </div>
          <Button
            style={{
              color: "#6c3fb5",
              borderColor: "#6c3fb5",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <RobotOutlined /> Nhân bản bot
          </Button>
          <Button
            type="primary"
            style={{
              background: "#6c3fb5",
              borderColor: "#6c3fb5",
            }}
          >
            Lưu thay đổi
          </Button>
        </div>
      </div>
      <div style={{ display: "flex", gap: "24px" }}>
        {/* Left Column - Form */}
        <div style={{ flex: 1 }}>
          {/* Header */}

          {/* Section 1: Basic Info */}
          <Card style={{ marginBottom: "24px" }}>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "600",
                marginBottom: "16px",
              }}
            >
              1. Thông tin cơ bản
            </h2>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Tên <span style={{ color: "red" }}>*</span>
              </label>
              <Input
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                size="large"
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Tên doanh nghiệp <span style={{ color: "red" }}>*</span>
              </label>
              <Input
                placeholder="Tên doanh nghiệp của bạn"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                size="large"
              />
            </div>

            <div style={{ display: "flex", gap: "24px", marginBottom: "16px" }}>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "500",
                  }}
                >
                  Avatar
                </label>
                <Avatar size={64} src="/bg-login.jpg" />
              </div>

              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "500",
                  }}
                >
                  Theme
                </label>
                <div
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      background: "#4608AB",
                      borderRadius: "4px",
                    }}
                  />
                  <span>#4608AB</span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Ngôn ngữ trả lời
              </label>
              <Select
                defaultValue="vi"
                style={{ width: "100%" }}
                size="large"
                options={[
                  { value: "vi", label: "Tiếng Việt" },
                  { value: "en", label: "Tiếng Anh" },
                ]}
              />
            </div>

            <Button
              danger
              icon={<DeleteOutlined />}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              Xóa
            </Button>
          </Card>

          {/* Section 2: AI Configuration */}
          <Card style={{ marginBottom: "24px" }}>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "600",
                marginBottom: "16px",
              }}
            >
              2. Cấu hình AI và hành vi
            </h2>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Tốc độ bot trả lời
              </label>
              <Select
                defaultValue="default"
                style={{ width: "100%" }}
                size="large"
                options={[
                  { value: "slow", label: "Chậm (5-8 giây)" },
                  { value: "default", label: "Chậm (mặc định)" },
                  { value: "fast", label: "Nhanh (1-3 giây)" },
                ]}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Cài đặt kiểu tư vấn
                </label>
                <Tooltip title="Lưỡng tư vấn phù hợp với các ngành tư vấn ít sản phẩm như: khóa học, nhà hàng, khác...">
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
              </div>
              <Select
                defaultValue="advisor"
                style={{ width: "100%" }}
                size="large"
                options={[
                  { value: "advisor", label: "Tư vấn" },
                  { value: "sales", label: "Bán hàng" },
                ]}
              />
              <div
                style={{ fontSize: "13px", color: "#666", marginTop: "8px" }}
              >
                <div>
                  Lưỡng tư vấn phù hợp với các ngành tư vấn ít sản phẩm như:
                  khóa học, nhà hàng, Khác...
                </div>
                <div>
                  Lưỡng ecommerce phù hợp với các ngành: Thời trang, mỹ phẩm,
                  nội thất, bán lẻ ...
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Temperature của bot
                </label>
                <Tooltip title="Giá trị mặc định thường là 1.0">
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  width: "50%",
                }}
              >
                <Button
                  icon={<MinusOutlined />}
                  onClick={() =>
                    setTemperature(Math.max(0, temperature - 0.05))
                  }
                />
                <div style={{ flex: 1 }}>
                  <InputNumber
                    value={temperature}
                    onChange={setTemperature}
                    min={0}
                    max={2}
                    step={0.05}
                    style={{ width: "100%" }}
                    size="large"
                  />
                </div>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() =>
                    setTemperature(Math.min(2, temperature + 0.05))
                  }
                />
              </div>
              <div
                style={{ fontSize: "13px", color: "#666", marginTop: "8px" }}
              >
                <div>Giá trị mặc định thường là 1.0.</div>
                <div>
                  Giá trị thấp hơn 1.0 sẽ làm mô hình trả lời logic hơn, chính
                  xác hơn, ít sáng tạo hơn, nghiêng về các câu trả lời quen
                  thuộc, phổ biến.
                </div>
                <div>
                  Giá trị cao hơn 1.0 sẽ làm mô hình sáng độ ngẫu nhiên, sáng
                  tạo, nhưng có thể kém ổn định hoặc kém chính xác hơn.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Bot không trả lời khi người dùng nhập
                </label>
                <Tooltip title="Bot sẽ không trả lời khi phát hiện số điện thoại hoặc địa chỉ">
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
              </div>
              <div style={{ display: "flex", gap: "32px" }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span>Số điện thoại</span>
                  <Switch checked={phoneToggle} onChange={setPhoneToggle} />
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span>Địa chỉ</span>
                  <Switch checked={addressToggle} onChange={setAddressToggle} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Cài đặt cách xưng/hô
                </label>
                <Tooltip title="Cách bot xưng hô với khách hàng">
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "4px",
                      fontSize: "13px",
                    }}
                  >
                    Xưng
                  </label>
                  <Input placeholder="mình" size="large" />
                </div>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "4px",
                      fontSize: "13px",
                    }}
                  >
                    Hô
                  </label>
                  <Input placeholder="bạn" size="large" />
                </div>
              </div>
            </div>
          </Card>

          {/* Section 3: Schedule and Response */}
          <Card style={{ marginBottom: "24px" }}>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "600",
                marginBottom: "16px",
              }}
            >
              3. Lên lịch và thời gian phản hồi
            </h2>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Thời gian nhận tự động (phút)
                </label>
                <Tooltip title="Thời gian bot chờ trước khi tự động trả lời">
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  width: "50%",
                }}
              >
                <Button
                  icon={<MinusOutlined />}
                  onClick={() => setResponseTime(Math.max(1, responseTime - 1))}
                />
                <InputNumber
                  value={responseTime}
                  onChange={setResponseTime}
                  min={1}
                  max={60}
                  style={{ width: "100%" }}
                  size="large"
                />
                <Button
                  icon={<PlusOutlined />}
                  onClick={() =>
                    setResponseTime(Math.min(60, responseTime + 1))
                  }
                />
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  fontWeight: "500",
                  marginBottom: "12px",
                  display: "block",
                }}
              >
                Khung giờ hoạt động
              </label>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <QuestionCircleOutlined style={{ color: "#999" }} />
                <span style={{ fontSize: "14px" }}>
                  Thiết lập khung giờ hoạt động
                </span>
                <Switch />
              </div>
            </div>
          </Card>

          {/* Section 4: Response Content */}
          <Card style={{ marginBottom: "24px" }}>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "600",
                marginBottom: "16px",
              }}
            >
              4. Nội dung phản hồi
            </h2>

            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Tính năng trả lời tin nhắn đầu tiên
                </label>
                <Switch
                  checked={greetingEnabled}
                  onChange={setGreetingEnabled}
                />
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Câu chào hỏi
                </label>
                <Tooltip title="Tin nhắn chào hỏi đầu tiên">
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
              </div>
              <TextArea
                placeholder="Xin chào bạn cần hỗ trợ gì"
                rows={3}
                style={{ resize: "none" }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Tin nhắn tự động
                </label>
                <Tooltip title="Tin nhắn gửi tự động sau khi khách hàng nhắn tin">
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
              </div>
              <TextArea
                placeholder="Dạ bạn còn cần mình hỗ trợ gì không"
                rows={3}
                style={{ resize: "none" }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Tin nhắn reaction
                </label>
                <Tooltip title="Tin nhắn phản ứng với khách hàng">
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
              </div>
              <TextArea
                placeholder="Vui lòng nhập tin nhắn reaction"
                rows={3}
                style={{ resize: "none" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Tính năng đọc hình ảnh
                </label>
                <Switch
                  checked={imageReadingEnabled}
                  onChange={setImageReadingEnabled}
                />
              </div>
              <Input
                placeholder="Tin nhắn Bot trả lời khi người dùng gửi hình ảnh"
                size="large"
              />
            </div>
          </Card>

          {/* Section 5: Intelligence and Auto-Response */}
          <Card>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "600",
                marginBottom: "16px",
              }}
            >
              5. Xử lý tình huống và phản hồi tự động
            </h2>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Tự động trả lời
                </label>
                <Tooltip>
                  <QuestionCircleOutlined style={{ color: "#999" }} />
                </Tooltip>
                <span style={{ color: "red", fontSize: "13px" }}>
                  ⚠️ {autoReplyMessage}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#666" }}>
                Bot sẽ tự động trả lời tin nhắn
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Bot im lặng
                </label>
                <Switch checked={silentMode} onChange={setSilentMode} />
              </div>
              <div style={{ fontSize: "13px", color: "#666" }}>
                Khi bật, bot sẽ không trả lời lại sau khi người dùng đã cung cấp
                số điện thoại
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Sử dụng kiến thức LLM
                </label>
                <Switch checked={useLLM} onChange={setUseLLM} />
              </div>
              <div style={{ fontSize: "13px", color: "#666" }}>
                Khi bot không thể tìm thấy thông tin, bot sẽ sử dụng kiến thức
                từ mô hình LLM để trả lời. Điều này giúp bot linh hoạt hơn trong
                việc phản hồi, nhưng cũng dễ dẫn đến việc bot cung cấp thông tin
                không liên quan đến doanh nghiệp của bạn.
              </div>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <label style={{ fontWeight: "500", margin: 0 }}>
                  Bot im lặng khi nhắn tin từ nền tảng khác
                </label>
                <Switch
                  checked={silentOnOtherPlatform}
                  onChange={setSilentOnOtherPlatform}
                />
              </div>
              <div style={{ fontSize: "13px", color: "#666" }}>
                Bot sẽ im lặng trong 5 phút khi nhận tin từ nền tảng khác (
                fanpage, Pancake, Haravan)
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Chat Preview */}
        <div style={{ width: "450px" }}>
          <Card
            style={{
              position: "fixed",
              top: "28vh",
              overflow: "hidden",
              width: "430px",
            }}
          >
            {/* Chat Header */}
            <div
              style={{
                background: "white",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: 20,
              }}
            >
              <Avatar size={40} src="/bg-login.jpg" />
              <span style={{ fontSize: "16px", fontWeight: "500" }}>
                bot-demo
              </span>
            </div>

            {/* Chat Messages Area */}
            <div
              style={{
                background: "#f8f9fa",
                padding: "24px 20px",
                maxHeight: "600px",
                overflowY: "auto",
              }}
            >
              {/* Bot Message - Left */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: 150,
                  margin: "12px 0",
                  alignItems: "flex-start",
                }}
              >
                <Avatar
                  size={32}
                  src="/bg-login.jpg"
                  style={{ flexShrink: 0 }}
                />
                <div
                  style={{
                    background: "white",
                    borderRadius: "12px",
                    padding: "4px 10px",
                    maxWidth: "70%",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "#333" }}>
                      👋 Hello! How can I help you today?
                    </span>
                  </div>
                </div>
              </div>

              {/* User Message - Right */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: "0px",
                }}
              >
                <div
                  style={{
                    background: "#6c3fb5",
                    color: "white",
                    borderRadius: "12px",
                    padding: "4px 10px",
                    maxWidth: "90%",
                    boxShadow: "0 2px 4px rgba(108, 63, 181, 0.2)",
                  }}
                >
                  <span style={{ fontSize: "13px" }}>
                    My email is example@example.com
                  </span>
                </div>
              </div>
            </div>

            {/* Chat Action Button */}
            <div
              style={{
                background: "white",
                padding: "16px 0px",
                borderTop: "1px solid #f0f0f0",
              }}
            >
              <Button
                type="primary"
                block
                size="large"
                style={{
                  background: "#6c3fb5",
                  borderColor: "#6c3fb5",
                  height: "48px",
                  fontSize: "16px",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  borderRadius: "8px",
                }}
              >
                <span>Chat với</span>
                <RobotOutlined />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

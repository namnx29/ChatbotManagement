"use client";

import { Input, Typography } from "antd";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  CloseCircleFilled,
  CheckCircleFilled,
} from "@ant-design/icons";
import { useMemo } from "react";

const { Text } = Typography;

const PasswordStrengthBar = ({ score }) => {
  let color = '#ccc';
  let text = '';
  let percentage = 0;
  
  if (score === 0) {
      color = '#ccc';
      text = '';
  } else if (score === 1) {
      color = '#ef4444';
      text = 'Mật khẩu yếu';
  } else if (score >= 2 && score < 5) {
      color = '#f97316';
      text = 'Mật khẩu trung bình';
  } else if (score === 5) {
      color = '#22c55e';
      text = 'Mật khẩu mạnh';
  }
  
  percentage = (score / 5) * 100;

  return (
    <div style={{ marginTop: '8px' }}>
      <div
        style={{
          height: '6px',
          backgroundColor: '#f0f0f0',
          borderRadius: '3px',
          overflow: 'hidden',
          marginBottom: '4px',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: color, 
            transition: 'width 0.3s ease-in-out, background-color 0.3s',
          }}
        />
      </div>
      <Text style={{ fontSize: '13px', color: color, fontWeight: '500' }}>
        {text}
      </Text>
    </div>
  );
};

const ValidationItem = ({ isValid, text }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "4px",
    }}
  >
    {isValid ? (
      <CheckCircleFilled style={{ color: "#52c41a", fontSize: "14px" }} />
    ) : (
      <CloseCircleFilled style={{ color: "#ff4d4f", fontSize: "14px" }} />
    )}
    <Text
      style={{ fontSize: "13px", color: isValid ? "#52c41a" : "#ff4d4f" }}
    >
      {text}
    </Text>
  </div>
);

/**
 * Reusable Password Input Component with Strength Checker
 * 
 * Props:
 * - value: Current password value
 * - onChange: Callback when password changes
 * - placeholder: Input placeholder text
 * - size: Input size (default: "large")
 * - showValidation: Show validation checklist (default: true)
 */
export default function PasswordInputWithStrength({
  value = "",
  onChange,
  placeholder = "Nhập mật khẩu",
  size = "large",
  showValidation = true,
}) {
  const hasMinLength = value.length >= 6;
  const hasNumber = /\d/.test(value);
  const hasUpperCase = /[A-Z]/.test(value);
  const hasLowerCase = /[a-z]/.test(value);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);

  const strengthScore = useMemo(() => {
    if (value.length === 0) return 0;
    
    let score = 0;
    if (hasMinLength) score += 1;
    if (hasNumber) score += 1;
    if (hasUpperCase) score += 1;
    if (hasLowerCase) score += 1;
    if (hasSpecialChar) score += 1;
    
    return score; 
  }, [value, hasMinLength, hasNumber, hasUpperCase, hasLowerCase, hasSpecialChar]);

  return (
    <div>
      <Input.Password
        placeholder={placeholder}
        size={size}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        iconRender={(visible) =>
          visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
        }
        style={{ fontSize: "14px" }}
      />
      
      <PasswordStrengthBar score={strengthScore} />
      
      {showValidation && (
        <div style={{ marginTop: "12px" }}>
          <Text
            strong
            style={{
              fontSize: "14px",
              marginBottom: "8px",
              display: "block",
            }}
          >
            Phải chứa ít nhất:
          </Text>
          <ValidationItem isValid={hasMinLength} text="Tối thiểu 6 ký tự" />
          <ValidationItem isValid={hasNumber} text="Có ít nhất 1 số" />
          <ValidationItem
            isValid={hasLowerCase}
            text="Có ít nhất 1 chữ cái viết thường"
          />
          <ValidationItem
            isValid={hasUpperCase}
            text="Có ít nhất 1 chữ cái viết hoa"
          />
          <ValidationItem
            isValid={hasSpecialChar}
            text="Có ít nhất 1 ký tự đặc biệt"
          />
        </div>
      )}
    </div>
  );
}

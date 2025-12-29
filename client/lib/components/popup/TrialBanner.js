"use client";

export default function TrialBanner() {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        background: "#ede6f7",
        padding: "10px 24px",
        textAlign: "center",
        zIndex: 998,
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      Bạn còn <strong style={{ color: "#6c3fb5", margin: "0 4px" }}>7 ngày</strong> sử dụng gói
      dùng thử.{" "}
      <a href="#" style={{ color: "#6c3fb5", fontWeight: "bold", marginLeft: "4px" }}>
        Nâng cấp ngay ↗
      </a>
    </div>
  );
}

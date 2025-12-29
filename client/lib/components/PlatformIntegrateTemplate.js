export default function PlatformConnectTemplate({
  title,
  description,
  buttonText,
  buttonColor = "#6c3fb5",
  platformLogo,
  onClick,
}) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "500px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "40px",
        textAlign: "center",
      }}
    >
      {platformLogo && (
        <div style={{ marginBottom: "16px" }}>{platformLogo}</div>
      )}

      <h2 style={{ fontSize: "22px", fontWeight: "600", marginBottom: "12px" }}>
        {title}
      </h2>

      <p
        style={{
          fontSize: "15px",
          color: "#666",
          maxWidth: "480px",
          marginBottom: "20px",
        }}
      >
        {description}
      </p>

      <button
        onClick={onClick}
        style={{
          marginTop: "16px",
          height: "44px",
          padding: "0 28px",
          borderRadius: "6px",
          background: buttonColor,
          color: "white",
          border: "none",
          cursor: "pointer",
          fontSize: "15px",
        }}
      >
        {buttonText}
      </button>
    </div>
  );
}

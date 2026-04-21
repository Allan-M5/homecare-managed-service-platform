export default function StatCard({
  label,
  value,
  hint = "",
  accent = "",
  badge = "",
  badgeTone = "",
  blink = false,
  onClick = null
}) {
  const clickable = typeof onClick === "function";

  return (
    <div
      className="glass-card stat-card"
      onClick={onClick || undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      style={{
        cursor: clickable ? "pointer" : "default",
        border: accent ? `1px solid ${accent}40` : undefined,
        boxShadow: accent ? `0 12px 30px ${accent}1c` : undefined,
        transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <span className="stat-label">{label}</span>
        {badge ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 9px",
              borderRadius: "999px",
              background: `${badgeTone || accent || "#94a3b8"}22`,
              border: `1px solid ${(badgeTone || accent || "#94a3b8")}55`,
              color: badgeTone || accent || "#e2e8f0",
              fontSize: "0.72rem",
              fontWeight: 800,
              lineHeight: 1
            }}
          >
            {blink ? (
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: badgeTone || accent || "#94a3b8",
                  animation: "adminBlink 1.3s ease-in-out infinite"
                }}
              />
            ) : null}
            {badge}
          </span>
        ) : null}
      </div>
      <strong className="stat-value" style={accent ? { color: accent } : undefined}>{value}</strong>
      {hint ? <small className="stat-hint">{hint}</small> : null}
    </div>
  );
}

import { NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const roleLinks = {
  admin: [{ to: "/admin", label: "Dashboard" }],
  client: [{ to: "/client", label: "Dashboard" }],
  worker: [{ to: "/worker", label: "Dashboard" }]
};

const roleTheme = {
  admin: {
    accent: "#c084fc",
    soft: "rgba(192,132,252,0.16)",
    border: "rgba(192,132,252,0.34)",
    glow: "0 18px 40px rgba(168,85,247,0.18)"
  },
  client: {
    accent: "#60a5fa",
    soft: "rgba(96,165,250,0.16)",
    border: "rgba(96,165,250,0.34)",
    glow: "0 18px 40px rgba(59,130,246,0.18)"
  },
  worker: {
    accent: "#34d399",
    soft: "rgba(52,211,153,0.16)",
    border: "rgba(52,211,153,0.34)",
    glow: "0 18px 40px rgba(16,185,129,0.18)"
  }
};

function formatRoleLabel(role) {
  if (!role) return "Guest";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function AppShell({
  title,
  subtitle,
  children,
  sidebarExtra = null,
  hideMainHeader = false,
  hideDefaultNav = false,
  sidebarHeaderTitle = "",
  sidebarHeaderSubtitle = "",
  hideSidebarUserBlock = false,
  hideSidebarLogoutButton = false,
  sidebarLogoutInline = false
}) {
  const { user, logout } = useAuth();
  const links = roleLinks[user?.role] || [];
  const theme = roleTheme[user?.role] || roleTheme.client;

  return (
    <div className="app-shell">
      <aside
        className="sidebar glass-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          gap: "14px",
          padding: "14px 12px",
          border: `1px solid ${theme.border}`,
          boxShadow: theme.glow
        }}
      >
        <div
          className="brand-mark"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "6px 4px 10px"
          }}
        >
          <div
            className="brand-badge"
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "16px",
              display: "grid",
              placeItems: "center",
              background: `linear-gradient(135deg, ${theme.soft} 0%, rgba(255,255,255,0.06) 100%)`,
              border: `1px solid ${theme.border}`,
              color: "#f8fafc",
              fontWeight: 800,
              fontSize: "18px",
              letterSpacing: "0.04em",
              boxShadow: theme.glow,
              flexShrink: 0
            }}
          >
            HC
          </div>

          <div>
            <h2
              style={{
                margin: 0,
                color: "#f8fafc",
                fontSize: "17px",
                fontWeight: 800,
                lineHeight: 1.1
              }}
            >
              HomeCare
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                color: "#cbd5e1",
                fontSize: "11px",
                lineHeight: 1.3
              }}
            >
              Managed Service Platform
            </p>
          </div>
        </div>

        {sidebarHeaderTitle ? (
          <div
            className="glass-card"
            style={{
              padding: "14px 14px 12px",
              borderRadius: "18px",
              background: `linear-gradient(135deg, ${theme.soft} 0%, rgba(255,255,255,0.08) 100%)`,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.glow
            }}
          >
            <div
              style={{
                color: "#f8fafc",
                fontSize: "1.05rem",
                fontWeight: 900,
                marginBottom: "6px",
                lineHeight: 1.2
              }}
            >
              {sidebarHeaderTitle}
            </div>
            {sidebarHeaderSubtitle ? (
              <div
                style={{
                  color: "#dbe7f5",
                  fontSize: "0.86rem",
                  lineHeight: 1.55
                }}
              >
                {sidebarHeaderSubtitle}
              </div>
            ) : null}
          </div>
        ) : null}

        {!hideDefaultNav ? (
          <nav
            className="sidebar-nav"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              marginTop: "2px"
            }}
          >
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `nav-link ${isActive ? "active-link" : ""}`}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: "16px",
                  textDecoration: "none",
                  color: isActive ? "#f8fafc" : "#dbe7f5",
                  fontWeight: isActive ? 800 : 600,
                  fontSize: "14px",
                  letterSpacing: "0.01em",
                  background: isActive
                    ? `linear-gradient(135deg, ${theme.soft} 0%, rgba(255,255,255,0.08) 100%)`
                    : "rgba(255,255,255,0.04)",
                  border: isActive
                    ? `1px solid ${theme.border}`
                    : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: isActive ? theme.glow : "none"
                })}
              >
                <span>{link.label}</span>
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "999px",
                    background: theme.accent,
                    opacity: 0.9
                  }}
                />
              </NavLink>
            ))}
          </nav>
        ) : null}

        {sidebarExtra ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {sidebarExtra}
          </div>
        ) : null}

        {!hideSidebarLogoutButton && sidebarLogoutInline ? (
          <button
            type="button"
            className="primary-button"
            onClick={logout}
            style={{ width: "100%", marginTop: "2px" }}
          >
            Logout
          </button>
        ) : null}

        <div style={{ flex: 1 }} />

        {!hideSidebarUserBlock ? (
        <div
          className="glass-card"
          style={{
            padding: "14px",
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.08)"
          }}
        >
          <div
            style={{
              color: "#f8fafc",
              fontSize: "14px",
              fontWeight: 800,
              marginBottom: "8px"
            }}
          >
            {user?.fullName || "User"}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 10px",
              borderRadius: "999px",
              background: theme.soft,
              border: `1px solid ${theme.border}`,
              color: "#f5f3ff",
              fontSize: "12px",
              fontWeight: 700
            }}
          >
            {formatRoleLabel(user?.role)}
          </div>
        </div>
        ) : null}

        {!hideSidebarLogoutButton && !sidebarLogoutInline ? (
        <button
          type="button"
          className="primary-button"
          onClick={logout}
          style={{
            width: "100%",
            marginTop: "-2px"
          }}
        >
          Logout
        </button>
        ) : null}
      </aside>

      <main className="main-content">
        {!hideMainHeader ? (
          <div
            className="glass-card page-header"
            style={{
              marginBottom: "18px"
            }}
          >
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        ) : null}

        {children}
      </main>
    </div>
  );
}

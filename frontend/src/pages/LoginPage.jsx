import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getRoleHomePath } from "../utils/roleRedirect";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, requestForgotPassword, handleAdminRecovery, isLoading } = useAuth();

  const initialRoleFromQuery = searchParams.get("role");
  const allowedRoles = ["admin", "client", "worker"];
  const [selectedRole, setSelectedRole] = useState(
    allowedRoles.includes(initialRoleFromQuery) ? initialRoleFromQuery : "client"
  );

  const [form, setForm] = useState({
    identifier: "",
    password: ""
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [totpState] = useState({ active: false, requiresSetup: false, manualEntryKey: "", otpauthUrl: "" });

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotPreview, setForgotPreview] = useState(null);
  const [forgotError, setForgotError] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);

  const roleCopy = {
    admin: {
      title: "Admin Sign in",
      subtitle: "Access dispatch control, pricing, approvals, and service oversight."
    },
    client: {
      title: "Client Sign in",
      subtitle: "Request trusted services, review quotes, and track your job flow."
    },
    worker: {
      title: "Worker Sign in",
      subtitle: "Access assignments, respond to dispatches, and track job progress."
    }
  };

  const handleChange = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      const response = await login({
        identifier: form.identifier,
        password: form.password,
        role: selectedRole
      });

      if (response?.user?.role !== selectedRole) {
        throw new Error(`This account is registered as ${response.user.role}, not ${selectedRole}.`);
      }

      navigate(getRoleHomePath(response.user.role));
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Login failed. Please try again.");
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setForgotError("");
    setForgotMessage("");
    setForgotPreview(null);

    try {
      setIsSendingReset(true);

      let response;
      if (selectedRole === "admin") {
        response = await handleAdminRecovery({ email: forgotEmail, recoveryKey });
      } else {
        response = await requestForgotPassword(forgotEmail);
      }

      setForgotMessage(response?.message || "If your email exists, a reset message has been prepared.");
      setForgotPreview(response?.data?.developmentRecoveryPreview || null);
    } catch (err) {
      setForgotError(err?.response?.data?.message || "Failed to process password recovery.");
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <section className={`glass-card auth-hero auth-hero-${selectedRole}`}>
          <div className="hero-badge hero-brand-badge">
            <span className="hero-brand-name">HomeCare</span>
            <span className="hero-brand-sub">Platform</span>
          </div>

          <h1 className="hero-title-structured">
            <span className="hero-line hero-line-1">
              <span className="hero-word hero-word-strong">Reliable</span>
              <span className="hero-word hero-word-soft">home</span>
            </span>
            <span className="hero-line hero-line-2">
              <span className="hero-word hero-word-cool">services,</span>
              <span className="hero-word hero-word-soft">managed</span>
            </span>
            <span className="hero-line hero-line-3">
              <span className="hero-word hero-word-soft">with</span>
              <span className="hero-word hero-word-strong">order</span>
              <span className="hero-word hero-word-cool">and trust.</span>
            </span>
          </h1>

          <p>
            Admin-controlled dispatching, worker accountability, and a premium
            service experience for clients, workers, and operators.
          </p>

          <div className="pill-row role-pill-row">
            {["admin", "client", "worker"].map((role) => (
              <button
                key={role}
                type="button"
                className={`pill role-pill role-pill-${role} ${selectedRole === role ? "active" : ""}`}
                onClick={() => {
                  setSelectedRole(role);
                  setSearchParams({ role });
                  setError("");
                  setSuccess("");
                  setForm({
                    identifier: "",
                    password: ""
                  });
                }}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className={`glass-card auth-form-card auth-form-card-${selectedRole}`}>
          <div className="form-heading">
            <h2>{roleCopy[selectedRole].title}</h2>
            <p>{roleCopy[selectedRole].subtitle}</p>
          </div>

          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="field">
              <span>Phone Number or Email</span>
              <input
                type="text"
                name="identifier"
                value={form.identifier}
                onChange={handleChange}
                placeholder="+254700000001 or you@example.com"
                autoComplete={`section-${selectedRole} username`}
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter password"
                autoComplete={`section-${selectedRole} current-password`}
                required
              />
            </label>

            {error ? <div className="error-banner">{error}</div> : null}
            {success ? <div className="success-banner">{success}</div> : null}

            <button
              type="submit"
              className={`primary-button role-primary-button role-primary-button-${selectedRole}`}
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowForgotModal(true);
                setForgotEmail("");
                setRecoveryKey("");
                setForgotMessage("");
                setForgotPreview(null);
                setForgotError("");
              }}
              style={{
                marginTop: "4px",
                minHeight: "44px",
                width: "100%",
                borderRadius: "14px",
                border: selectedRole === "admin"
                  ? "1px solid rgba(196,181,253,0.32)"
                  : selectedRole === "client"
                    ? "1px solid rgba(125,211,252,0.30)"
                    : "1px solid rgba(253,186,116,0.30)",
                background: selectedRole === "admin"
                  ? "linear-gradient(135deg, rgba(196,181,253,0.14) 0%, rgba(255,255,255,0.04) 100%)"
                  : selectedRole === "client"
                    ? "linear-gradient(135deg, rgba(125,211,252,0.14) 0%, rgba(255,255,255,0.04) 100%)"
                    : "linear-gradient(135deg, rgba(253,186,116,0.14) 0%, rgba(255,255,255,0.04) 100%)",
                color: selectedRole === "admin"
                  ? "#ddd6fe"
                  : selectedRole === "client"
                    ? "#bae6fd"
                    : "#fed7aa",
                fontWeight: 800,
                fontSize: "0.96rem",
                cursor: "pointer",
                boxShadow: "0 10px 24px rgba(2,6,23,0.12)",
                transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease"
              }}
            >
              Forgot Password
            </button>

            {selectedRole === "client" ? (
              <button
                type="button"
                className={`ghost-button role-secondary-button role-secondary-button-${selectedRole}`}
                onClick={() => navigate("/register-client")}
              >
                Create Client Account
              </button>
            ) : null}

            {selectedRole === "worker" ? (
              <button
                type="button"
                className={`ghost-button role-secondary-button role-secondary-button-${selectedRole}`}
                onClick={() => navigate("/apply-worker")}
              >
                Apply as Worker
              </button>
            ) : null}
          </form>
        </section>
      </div>

      {showForgotModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3, 7, 18, 0.72)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px"
          }}
        >
          <div
            className="glass-card"
            style={{
              width: "100%",
              maxWidth: "560px",
              padding: "28px",
              borderRadius: "24px",
              background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              color: "#111827",
              border: "1px solid rgba(203,213,225,0.9)",
              boxShadow: "0 24px 60px rgba(15,23,42,0.28)"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
                marginBottom: "14px"
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    color: "#0f172a",
                    fontSize: "30px",
                    lineHeight: 1.1,
                    fontWeight: 800
                  }}
                >
                  Forgot Password
                </h3>
                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#475569",
                    lineHeight: 1.75,
                    fontSize: "15px"
                  }}
                >
                  {selectedRole === "admin"
                    ? "Enter the email registered on your admin account together with the recovery key. Temporary access details will only be sent through the approved recovery channel."
                    : "Enter the email registered on your HomeCare account. A temporary password will be prepared and sent only to that email."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                style={{
                  minWidth: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontSize: "20px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleForgotPassword}>
              <label className="field" style={{ display: "block", marginTop: "16px" }}>
                <span
                  style={{
                    display: "block",
                    color: "#334155",
                    fontWeight: 800,
                    marginBottom: "10px",
                    fontSize: "14px"
                  }}
                >
                  Registered Email
                </span>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  placeholder="Enter your registered email"
                  required
                  style={{
                    width: "100%",
                    background: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                    borderRadius: "14px",
                    padding: "15px 16px",
                    outline: "none",
                    boxSizing: "border-box",
                    fontSize: "15px"
                  }}
                />
              </label>

              {selectedRole === "admin" ? (
                <div style={{ marginTop: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      color: "#334155",
                      fontWeight: 800,
                      marginBottom: "10px",
                      fontSize: "14px"
                    }}
                  >
                    Recovery Key (Admin Only)
                  </label>
                  <input
                    type="text"
                    value={recoveryKey}
                    onChange={(event) => setRecoveryKey(event.target.value)}
                    placeholder="Enter your recovery key"
                    required
                    style={{
                      width: "100%",
                      background: "#ffffff",
                      color: "#0f172a",
                      border: "1px solid #cbd5e1",
                      borderRadius: "14px",
                      padding: "15px 16px",
                      outline: "none",
                      boxSizing: "border-box",
                      fontSize: "15px"
                    }}
                  />
                </div>
              ) : null}

              <div
                style={{
                  marginTop: "12px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1e3a8a",
                  fontSize: "13px",
                  lineHeight: 1.7
                }}
              >
                This recovery flow uses the email saved on your account profile. For security, temporary access details are never shown directly on the login screen.
              </div>

              {forgotError ? (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "13px 14px",
                    borderRadius: "14px",
                    background: "#fee2e2",
                    color: "#991b1b",
                    border: "1px solid #fca5a5",
                    lineHeight: 1.6
                  }}
                >
                  {forgotError}
                </div>
              ) : null}

                            {forgotPreview ? (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "18px",
                    borderRadius: "20px",
                    background: "linear-gradient(135deg, rgba(34,197,94,0.14) 0%, rgba(255,255,255,0.88) 100%)",
                    border: "1px solid rgba(34,197,94,0.28)",
                    boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
                    display: "grid",
                    gap: "12px"
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: "1.02rem", color: "#166534" }}>
                    Development Recovery Preview
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "14px",
                      background: "rgba(255,255,255,0.72)",
                      border: "1px solid rgba(239,68,68,0.18)",
                      color: "#7f1d1d",
                      fontWeight: 700,
                      lineHeight: 1.6
                    }}
                  >
                    Save or send these details before closing. If closed, you will need to run recovery again to generate a new temporary password.
                  </div>

                  <div
                    style={{
                      padding: "14px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.66)",
                      border: "1px solid rgba(15,23,42,0.08)",
                      color: "#0f172a",
                      lineHeight: 1.8
                    }}
                  >
                    <div><strong>Admin:</strong> {forgotPreview?.fullName || "-"}</div>
                    <div><strong>Email:</strong> {forgotPreview?.email || "-"}</div>
                    <div><strong>Phone:</strong> {forgotPreview?.phone || "-"}</div>
                    <div><strong>Temporary Password:</strong> <span style={{ color: "#1d4ed8", fontWeight: 900 }}>{forgotPreview?.temporaryPassword || "-"}</span></div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={{
                        padding: "11px 16px",
                        borderRadius: "12px",
                        border: "1px solid rgba(59,130,246,0.26)",
                        background: "rgba(59,130,246,0.12)",
                        color: "#1d4ed8",
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                      onClick={() => {
                        const text = [
                          `Hello ${forgotPreview?.fullName || "Admin"},`,
                          "",
                          "Your HomeCare admin recovery was completed successfully.",
                          `Temporary password: ${forgotPreview?.temporaryPassword || "-"}`,
                          "",
                          "Please sign in and change this password immediately."
                        ].join("\n");
                        navigator.clipboard.writeText(text);
                      }}
                    >
                      Copy Details
                    </button>

                    <button
                      type="button"
                      style={{
                        padding: "11px 16px",
                        borderRadius: "12px",
                        border: "1px solid rgba(34,197,94,0.26)",
                        background: "rgba(34,197,94,0.12)",
                        color: "#166534",
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                      onClick={() => {
                        const text = encodeURIComponent([
                          `Hello ${forgotPreview?.fullName || "Admin"},`,
                          "",
                          "Your HomeCare admin recovery was completed successfully.",
                          `Temporary password: ${forgotPreview?.temporaryPassword || "-"}`,
                          "",
                          "Please sign in and change this password immediately."
                        ].join("\n"));
                        const phone = String(forgotPreview?.phone || "").replace(/\D/g, "");
                        window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener,noreferrer");
                      }}
                    >
                      Send WhatsApp
                    </button>

                    <button
                      type="button"
                      style={{
                        padding: "11px 16px",
                        borderRadius: "12px",
                        border: "1px solid rgba(168,85,247,0.26)",
                        background: "rgba(168,85,247,0.12)",
                        color: "#7c3aed",
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                      onClick={() => {
                        const subject = encodeURIComponent("HomeCare Admin Recovery");
                        const body = encodeURIComponent([
                          `Hello ${forgotPreview?.fullName || "Admin"},`,
                          "",
                          "Your HomeCare admin recovery was completed successfully.",
                          `Temporary password: ${forgotPreview?.temporaryPassword || "-"}`,
                          "",
                          "Please sign in and change this password immediately."
                        ].join("\n"));
                        window.open(`mailto:${forgotPreview?.email || ""}?subject=${subject}&body=${body}`, "_self");
                      }}
                    >
                      Send Email
                    </button>
                  </div>
                </div>
              ) : null}
{forgotMessage ? (
                <div
                  style={{
                    marginTop: "14px",
                    padding: "13px 14px",
                    borderRadius: "14px",
                    background: "#dcfce7",
                    color: "#166534",
                    border: "1px solid #86efac",
                    lineHeight: 1.6
                  }}
                >
                  {forgotMessage}
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 150px",
                  gap: "12px",
                  marginTop: "20px"
                }}
              >
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSendingReset}
                  style={{
                    width: "100%",
                    minHeight: "52px",
                    borderRadius: "14px",
                    fontWeight: 800,
                    fontSize: "15px"
                  }}
                >
                  {isSendingReset ? "Processing..." : "Send Recovery Email"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  style={{
                    minHeight: "52px",
                    borderRadius: "14px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#334155",
                    fontWeight: 700,
                    fontSize: "15px",
                    cursor: "pointer"
                  }}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}











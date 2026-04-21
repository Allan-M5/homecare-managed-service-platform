import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerClientRequest } from "../api/authApi";

export default function RegisterClientPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    password: "",
    email: "",
    estate: ""
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      await registerClientRequest(form);
      setSuccess("Client account created successfully. You can now sign in.");
      setForm({
        fullName: "",
        phone: "",
        password: "",
        email: "",
        estate: ""
      });
    } catch (err) {
      const backendMessage = err?.response?.data?.message || "Registration failed.";
      setError(backendMessage.includes("duplicate key") ? "An account with those details already exists." : backendMessage);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <section className="glass-card auth-hero auth-hero-client">
          <div className="hero-badge hero-brand-badge">
            <span className="hero-brand-name">Client</span>
            <span className="hero-brand-sub">Onboarding</span>
          </div>

          <h1>Get your own client account and request service with confidence.</h1>

          <p>
            Start with basic identity and area details. Specific house or task
            details will be completed later when creating a new job request.
          </p>

          <div className="pill-row role-pill-row">
            <button type="button" className="pill role-pill role-pill-client active">
              Client
            </button>
          </div>
        </section>

        <section className="glass-card auth-form-card auth-form-card-client">
          <div className="form-heading">
            <h2>Create Client Account</h2>
            <p>Register a new client profile and continue to sign in.</p>
          </div>

          <form onSubmit={handleSubmit} className="form-grid">
            <label className="field">
              <span>Full Name</span>
              <input
                name="fullName"
                placeholder="e.g. Mary Wanjiru"
                value={form.fullName}
                onChange={handleChange}
                required
              />
            </label>

            <label className="field">
              <span>Phone Number</span>
              <input
                name="phone"
                placeholder="+2547..."
                value={form.phone}
                onChange={handleChange}
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                placeholder="Create password"
                value={form.password}
                onChange={handleChange}
                required
              />
            </label>

            <label className="field">
              <span>Email Address</span>
              <input
                type="email"
                name="email"
                placeholder="Optional email for password recovery"
                value={form.email}
                onChange={handleChange}
              />
            </label>

            <label className="field">
              <span>Area / Estate</span>
              <input
                name="estate"
                placeholder="e.g. South B"
                value={form.estate}
                onChange={handleChange}
              />
            </label>

            {error ? <div className="error-banner field-span-2">{error}</div> : null}
            {success ? <div className="success-banner field-span-2">{success}</div> : null}

            <button type="submit" className="primary-button role-primary-button role-primary-button-client field-span-2">
              Create Account
            </button>

            <button
              type="button"
              className="ghost-button role-secondary-button role-secondary-button-client field-span-2"
              onClick={() => navigate("/login")}
            >
              Back to Sign in
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}


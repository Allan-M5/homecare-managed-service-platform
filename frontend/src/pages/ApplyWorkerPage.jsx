import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "../api/http";

const serviceOptions = [
  "Studio / bedsitter cleaning",
  "1 bedroom house cleaning",
  "2 bedroom house cleaning",
  "3+ bedroom house cleaning",
  "Kitchen deep cleaning",
  "Bathroom deep cleaning",
  "Sofa / upholstery cleaning",
  "Mattress cleaning",
  "Carpet / rug cleaning",
  "Balcony / outdoor cleaning",
  "Laundry washing",
  "Laundry washing + ironing",
  "Utensils / dishes cleaning",
  "Move-in / move-out cleaning",
  "After-event cleaning",
  "Office cleaning",
  "Grocery pickup",
  "Parcel delivery",
  "Pharmacy pickup",
  "House supplies purchase",
  "Queue / bill payment errand",
  "Document drop-off / pickup",
  "Delivery transportation",
  "Movers services",
  "Custom errand",
  "Salon services",
  "Barber services",
  "Babysitting services",
  "Pet care services",
  "Plumbing services",
  "Electrical services",
  "Pest control services",
  "Car wash services",
  "Urgent same-day service",
  "Bring cleaning supplies",
  "Bring tools/materials",
  "Fragile-space handling",
  "Elderly-friendly service",
  "Pet-sensitive cleaning",
  "Night/early-morning booking"
];

const dayOptions = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

const initialForm = {
  fullName: "",
  phone: "",
  alternatePhone: "",
  email: "",
  dateOfBirth: "",
  nationalIdNumber: "",
  county: "",
  town: "",
  estate: "",
  addressLine: "",
  googleMapPinUrl: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  nextOfKinRelationship: "",
  neighborFriendContact: "",
  experienceSummary: "",
  canBringOwnSupplies: "",
  preferredWorkRadiusKm: "",
  availabilityStartTime: "",
  availabilityEndTime: "",
  mpesaNumber: "",
  mpesaRegisteredName: "",
  bankAccountDetails: "",
  consentAccepted: false,
  trackingConsentAccepted: false
};

function PreviewImage({ src, alt }) {
  if (!src) return null;

  return (
    <div
      style={{
        marginTop: "12px",
        borderRadius: "18px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)"
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "180px",
          objectFit: "cover",
          display: "block"
        }}
      />
    </div>
  );
}

export default function ApplyWorkerPage() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("apply-worker-mobile-fix")) return;

    const style = document.createElement("style");
    style.id = "apply-worker-mobile-fix";
    style.innerHTML = `
      @media (max-width: 768px) {
        .apply-worker-grid,
        .apply-worker-grid-2,
        .apply-worker-form-grid,
        .details-grid,
        .form-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .apply-worker-form-grid > *,
        .form-grid > *,
        .details-grid > * {
          min-width: 0 !important;
          width: 100% !important;
        }

        .field {
          min-width: 0 !important;
          width: 100% !important;
          overflow: hidden !important;
        }

        input,
        textarea,
        select {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }

        input[type="date"],
        input[type="time"],
        input[type="datetime-local"] {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          display: block !important;
          -webkit-appearance: none !important;
          appearance: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [touchStartX, setTouchStartX] = useState(null);

  const [form, setForm] = useState(initialForm);
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedDays, setSelectedDays] = useState([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);

  const [files, setFiles] = useState({
    profilePhoto: null,
    nationalIdFront: null,
    nationalIdBack: null,
    selfieWithId: null
  });

  const [previews, setPreviews] = useState({
    profilePhoto: "",
    nationalIdFront: "",
    nationalIdBack: "",
    selfieWithId: ""
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const filteredServices = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase();
    if (!query) return serviceOptions;
    return serviceOptions.filter((item) => item.toLowerCase().includes(query));
  }, [serviceSearch]);

  const handleTouchStart = (event) => {
    setTouchStartX(event.changedTouches?.[0]?.clientX ?? null);
  };

  const handleTouchEnd = (event) => {
    const endX = event.changedTouches?.[0]?.clientX ?? null;
    if (touchStartX === null || endX === null) return;
    const delta = endX - touchStartX;
    if (delta < -70 && step === 1) {
      setStep(2);
    }
    if (delta > 70 && step === 2) {
      setStep(1);
    }
    setTouchStartX(null);
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
    setFieldErrors((current) => ({
      ...current,
      [name]: false
    }));
  };

  const handleFileChange = (event) => {
    const { name, files: pickedFiles } = event.target;
    const file = pickedFiles?.[0] || null;

    setFiles((current) => ({
      ...current,
      [name]: file
    }));

    setFieldErrors((current) => ({
      ...current,
      [name]: false
    }));

    if (!file) {
      setPreviews((current) => ({
        ...current,
        [name]: ""
      }));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPreviews((current) => ({
      ...current,
      [name]: previewUrl
    }));
  };

  const toggleService = (service) => {
    setSelectedServices((current) =>
      current.includes(service)
        ? current.filter((item) => item !== service)
        : [...current, service]
    );
  };

  const toggleDay = (day) => {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    );
  };

  const requiredFieldLabels = {
    fullName: "Full Legal Name",
    dateOfBirth: "Date of Birth",
    phone: "Phone Number",
    email: "Email Address",
    nationalIdNumber: "National ID Number",
    county: "County",
    town: "Current Region / Town",
    estate: "Estate / Area",
    addressLine: "Home Address Notes",
    nextOfKinName: "Next of Kin Full Name",
    nextOfKinPhone: "Next of Kin Phone Number",
    profilePhoto: "Profile Photo",
    nationalIdFront: "National ID Front",
    nationalIdBack: "National ID Back",
    selfieWithId: "Selfie Holding ID"
  };

  const requiredStepTwoFields = new Set([
    "nextOfKinName",
    "nextOfKinPhone",
    "profilePhoto",
    "nationalIdFront",
    "nationalIdBack",
    "selfieWithId"
  ]);

  const focusFirstMissingField = (name) => {
    setTimeout(() => {
      const target = document.querySelector(`[name="${name}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus?.();
      }
    }, 100);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setFieldErrors({});

    const missing = [];
    const requiredFormFields = [
      "fullName",
      "dateOfBirth",
      "phone",
      "email",
      "nationalIdNumber",
      "county",
      "town",
      "estate",
      "addressLine",
      "nextOfKinName",
      "nextOfKinPhone"
    ];

    requiredFormFields.forEach((name) => {
      if (!String(form[name] || "").trim()) {
        missing.push(name);
      }
    });

    if (selectedServices.length === 0) {
      setError("Please select at least one service category.");
      return;
    }

    if (selectedDays.length === 0) {
      setError("Please select at least one available day.");
      return;
    }

    if (!form.availabilityStartTime || !form.availabilityEndTime) {
      setError("Please select available start and end times.");
      return;
    }

    if (!files.profilePhoto) missing.push("profilePhoto");
    if (!files.nationalIdFront) missing.push("nationalIdFront");
    if (!files.nationalIdBack) missing.push("nationalIdBack");
    if (!files.selfieWithId) missing.push("selfieWithId");

    if (!form.consentAccepted || !form.trackingConsentAccepted) {
      setError("You must accept the platform rules and tracking consent before submitting.");
      return;
    }

    if (missing.length > 0) {
      const nextFieldErrors = {};
      missing.forEach((name) => {
        nextFieldErrors[name] = true;
      });
      setFieldErrors(nextFieldErrors);

      const firstMissing = missing[0];
      setStep(requiredStepTwoFields.has(firstMissing) ? 2 : 1);
      focusFirstMissingField(firstMissing);

      setError(
        `Complete these required fields: ${missing
          .map((name) => requiredFieldLabels[name] || name)
          .join(", ")}`
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = new FormData();
      payload.append("fullName", form.fullName);
      payload.append("phone", form.phone);
      payload.append("alternatePhone", form.alternatePhone);
      payload.append("email", form.email);
      payload.append("dateOfBirth", form.dateOfBirth);
      payload.append("nationalIdNumber", form.nationalIdNumber);
      payload.append("county", form.county);
      payload.append("town", form.town);
      payload.append("estate", form.estate);
      payload.append("addressLine", form.addressLine);
      payload.append("googleMapPinUrl", form.googleMapPinUrl);
      payload.append("nextOfKinName", form.nextOfKinName);
      payload.append("nextOfKinPhone", form.nextOfKinPhone);
      payload.append("nextOfKinRelationship", form.nextOfKinRelationship);
      payload.append("neighborFriendContact", form.neighborFriendContact);
      payload.append("experienceSummary", form.experienceSummary);
      payload.append("canBringOwnSupplies", String(form.canBringOwnSupplies).toLowerCase() === "yes");
      payload.append("preferredWorkRadiusKm", form.preferredWorkRadiusKm || "10");
      payload.append("availabilityStartTime", form.availabilityStartTime);
      payload.append("availabilityEndTime", form.availabilityEndTime);
      payload.append("mpesaNumber", form.mpesaNumber);
      payload.append("mpesaRegisteredName", form.mpesaRegisteredName);
      payload.append("bankAccountDetails", form.bankAccountDetails);
      payload.append("consentAccepted", String(form.consentAccepted));
      payload.append("trackingConsentAccepted", String(form.trackingConsentAccepted));

      selectedServices.forEach((service) => payload.append("serviceCategories", service));
      selectedDays.forEach((day) => payload.append("availableDays", day));

      payload.append("profilePhoto", files.profilePhoto);
      payload.append("nationalIdFront", files.nationalIdFront);
      payload.append("nationalIdBack", files.nationalIdBack);
      payload.append("selfieWithId", files.selfieWithId);

      await http.post("/api/worker-applications", payload, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      setSuccess("Application submitted successfully.");
      setSubmissionComplete(true);
    } catch (err) {
      const apiMissing = err?.response?.data?.details?.missingFields;
      if (Array.isArray(apiMissing) && apiMissing.length > 0) {
        setError(`Complete these required fields: ${apiMissing.join(", ")}`);
      } else {
        setError(err?.response?.data?.message || "Failed to submit worker application.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submissionComplete) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background:
            "radial-gradient(circle at top, rgba(34,211,238,0.16), transparent 26%), linear-gradient(135deg, #071224 0%, #0f172a 45%, #082f49 100%)"
        }}
      >
        <div
          className="glass-card"
          style={{
            width: "100%",
            maxWidth: "760px",
            padding: "30px",
            borderRadius: "28px",
            background: "linear-gradient(155deg, rgba(30,41,59,0.92) 0%, rgba(15,23,42,0.94) 100%)",
            border: "1px solid rgba(125,211,252,0.28)",
            boxShadow: "0 24px 80px rgba(34,211,238,0.18), 0 0 0 1px rgba(192,132,252,0.18) inset"
          }}
        >
          <div style={{ fontSize: "2rem", fontWeight: 900, color: "#f8fafc", marginBottom: "12px" }}>
            Application Received
          </div>

          <div style={{ color: "#dbe7f5", lineHeight: 1.9, fontSize: "1rem", marginBottom: "18px" }}>
            Thank you for choosing HomeCare Platform to work and earn as a trusted service person.
            Your application has been received and is now being processed. You will receive a response
            through the email address or WhatsApp contact you submitted. On approval, Admin may choose
            to send onboarding details through email or WhatsApp with your approved access guidance.
          </div>

          <div
            style={{
              padding: "14px 16px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(255,255,255,0.04))",
              border: "1px solid rgba(96,165,250,0.20)",
              color: "#bfdbfe",
              marginBottom: "18px",
              lineHeight: 1.7
            }}
          >
            Keep your submitted phone and email active so you do not miss review feedback, incomplete application guidance, or approval onboarding instructions.
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button"
              onClick={() => navigate("/login?role=worker")}
            >
              Close Application Page
            </button>

            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setSubmissionComplete(false);
                setSuccess("");
                setError("");
                setForm(initialForm);
                setSelectedServices([]);
                setSelectedDays([]);
                setFiles({
                  profilePhoto: null,
                  nationalIdFront: null,
                  nationalIdBack: null,
                  selfieWithId: null
                });
                setPreviews({
                  profilePhoto: "",
                  nationalIdFront: "",
                  nationalIdBack: "",
                  selfieWithId: ""
                });
                setStep(1);
              }}
            >
              Submit Fresh Application
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="auth-page"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: "100vh" }}
    >
      {step === 1 ? (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px 20px"
          }}
        >
          <section
            className="glass-card auth-hero auth-hero-worker"
            style={{
              width: "100%",
              maxWidth: "580px",
              minHeight: "700px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center"
            }}
          >
            <div className="hero-badge hero-brand-badge">
              <span className="hero-brand-name">HomeCare</span>
              <span className="hero-brand-sub">Platform</span>
            </div>

            <h1 className="hero-title-structured">
              <span className="hero-line hero-line-1">
                <span className="hero-word hero-word-strong">Build</span>
                <span className="hero-word hero-word-soft">your</span>
              </span>
              <span className="hero-line hero-line-2">
                <span className="hero-word hero-word-cool">worker</span>
                <span className="hero-word hero-word-soft">profile</span>
              </span>
              <span className="hero-line hero-line-3">
                <span className="hero-word hero-word-soft">for</span>
                <span className="hero-word hero-word-strong">trusted</span>
                <span className="hero-word hero-word-cool">jobs.</span>
              </span>
            </h1>

            <p>
              Submit your worker profile, KYC details, and service capability for admin review,
              secure access, and live job opportunities.
            </p>

            <div
              className="pill-row role-pill-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "14px"
              }}
            >
              <button type="button" className="pill role-pill role-pill-worker active">
                Worker
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ minWidth: "170px" }}
                onClick={() => setStep(2)}
              >
                Apply Now
              </button>
              <button
                type="button"
                className="ghost-button role-secondary-button role-secondary-button-worker"
                onClick={() => navigate("/login?role=worker")}
              >
                Back to Login
              </button>
            </div>
          </section>

          
        </div>
      ) : (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px 20px"
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="glass-card"
            style={{
              width: "100%",
              maxWidth: "1150px",
              borderRadius: "34px",
              padding: "24px"
            }}
          >
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "2.1rem", marginBottom: "10px" }}>Complete Worker Application</h1>
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Fill all required sections below. You can still swipe right at any time to return to the intro screen.
              </p>
            </div>

            <div className="form-grid apply-worker-form-grid">
              <label className="field">
                <span>Full Legal Name <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="As it appears on your National ID"
                  style={fieldErrors.fullName ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>Date of Birth <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={form.dateOfBirth}
                  onChange={handleChange}
                  style={fieldErrors.dateOfBirth ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>Phone Number <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="07..."
                  style={fieldErrors.phone ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>Alternative Phone Number</span>
                <input
                  name="alternatePhone"
                  value={form.alternatePhone}
                  onChange={handleChange}
                  placeholder="Optional secondary contact"
                />
              </label>

              <label className="field field-span-2">
                <span>Email Address <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  style={fieldErrors.email ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field field-span-2">
                <span>National ID Number <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="nationalIdNumber"
                  value={form.nationalIdNumber}
                  onChange={handleChange}
                  placeholder="National ID number"
                  style={fieldErrors.nationalIdNumber ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>County <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="county"
                  value={form.county}
                  onChange={handleChange}
                  placeholder="e.g. Nairobi"
                  style={fieldErrors.county ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>Current Region / Town <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="town"
                  value={form.town}
                  onChange={handleChange}
                  placeholder="e.g. Nairobi, Kenya"
                  style={fieldErrors.town ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>Estate / Area <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="estate"
                  value={form.estate}
                  onChange={handleChange}
                  placeholder="e.g. Ruaka"
                  style={fieldErrors.estate ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>Home Address Notes <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="addressLine"
                  value={form.addressLine}
                  onChange={handleChange}
                  placeholder="House number / nearest landmark"
                  style={fieldErrors.addressLine ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field field-span-2">
                <span>Pinned Home Location on Google Maps</span>
                <input
                  name="googleMapPinUrl"
                  value={form.googleMapPinUrl}
                  onChange={handleChange}
                  placeholder="Paste Google Maps pin share link"
                />
              </label>
            </div>

            <div
              style={{
                marginTop: "12px",
                marginBottom: "18px",
                padding: "10px 12px",
                borderRadius: "14px",
                border: "1px solid rgba(96,165,250,0.18)",
                background: "rgba(59,130,246,0.08)",
                color: "#dbeafe",
                fontSize: "0.92rem"
              }}
            >
              Tip: Open Google Maps, pin your exact home location, tap Share, then paste the copied pin link here.
            </div>

            <div className="form-grid apply-worker-form-grid">
              <label className="field">
                <span>Next of Kin Full Name <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="nextOfKinName"
                  value={form.nextOfKinName}
                  onChange={handleChange}
                  placeholder="Full name"
                  style={fieldErrors.nextOfKinName ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>Next of Kin Phone Number <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  name="nextOfKinPhone"
                  value={form.nextOfKinPhone}
                  onChange={handleChange}
                  placeholder="07..."
                  style={fieldErrors.nextOfKinPhone ? { borderColor: "#ef4444" } : undefined}
                />
              </label>

              <label className="field">
                <span>Relationship to Next of Kin</span>
                <input
                  name="nextOfKinRelationship"
                  value={form.nextOfKinRelationship}
                  onChange={handleChange}
                  placeholder="e.g. Brother / Sister / Parent"
                />
              </label>

              <label className="field">
                <span>Neighbor / Friend Emergency Contact</span>
                <input
                  name="neighborFriendContact"
                  value={form.neighborFriendContact}
                  onChange={handleChange}
                  placeholder="Optional backup contact"
                />
              </label>
            </div>

            <div style={{ marginTop: "20px" }}>
              <label className="field">
                <span>Services You Can Do</span>

                <button
                  type="button"
                  className="ghost-button"
                  style={{
                    width: "100%",
                    justifyContent: "space-between",
                    marginTop: "8px"
                  }}
                  onClick={() => setIsServiceDropdownOpen((current) => !current)}
                >
                  <span>{selectedServices.length === 0 ? "Select worker services" : `${selectedServices.length} services selected`}</span>
                  <span>{isServiceDropdownOpen ? "Close" : "Open"}</span>
                </button>

                {isServiceDropdownOpen ? (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "14px",
                      borderRadius: "20px",
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(15,23,42,0.58)"
                    }}
                  >
                    <input
                      value={serviceSearch}
                      onChange={(event) => setServiceSearch(event.target.value)}
                      placeholder="Search service"
                      style={{ marginBottom: "12px" }}
                    />

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      {filteredServices.map((service) => {
                        const active = selectedServices.includes(service);
                        return (
                          <button
                            key={service}
                            type="button"
                            onClick={() => toggleService(service)}
                            style={{
                              padding: "10px 14px",
                              borderRadius: "999px",
                              border: active ? "1px solid rgba(245,158,11,0.42)" : "1px solid rgba(255,255,255,0.12)",
                              background: active ? "rgba(245,158,11,0.16)" : "rgba(255,255,255,0.04)",
                              color: active ? "#fcd34d" : "#f8fafc",
                              cursor: "pointer"
                            }}
                          >
                            {service}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {selectedServices.length > 0 ? (
                  <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    {selectedServices.map((service) => (
                      <span
                        key={service}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border: "1px solid rgba(245,158,11,0.34)",
                          background: "rgba(245,158,11,0.14)",
                          color: "#fcd34d",
                          fontSize: "0.9rem",
                          fontWeight: 700
                        }}
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                ) : null}
              </label>
            </div>

            <div className="form-grid apply-worker-form-grid" style={{ marginTop: "20px" }}>
              <label className="field field-span-2">
                <span>Experience Summary</span>
                <textarea
                  rows="4"
                  name="experienceSummary"
                  value={form.experienceSummary}
                  onChange={handleChange}
                  placeholder="Briefly explain your work experience and strengths"
                />
              </label>

              <label className="field">
                <span>Can Bring Own Supplies / Tools?</span>
                <select
                  name="canBringOwnSupplies"
                  value={form.canBringOwnSupplies}
                  onChange={handleChange}
                >
                  <option value="">Select option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="depends">Depends on the job</option>
                </select>
              </label>

              <label className="field">
                <span>Preferred Work Radius (KM)</span>
                <input
                  name="preferredWorkRadiusKm"
                  value={form.preferredWorkRadiusKm}
                  onChange={handleChange}
                  placeholder="e.g. 5"
                />
              </label>
            </div>

            <div style={{ marginTop: "20px" }}>
              <label className="field">
                <span>Available Days</span>
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  {dayOptions.map((day) => {
                    const active = selectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "999px",
                          border: active ? "1px solid rgba(96,165,250,0.40)" : "1px solid rgba(255,255,255,0.12)",
                          background: active ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                          color: active ? "#bfdbfe" : "#f8fafc",
                          cursor: "pointer"
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                {selectedDays.length > 0 ? (
                  <div style={{ marginTop: "10px", color: "#cbd5e1" }}>
                    {selectedDays.length} days selected
                  </div>
                ) : null}
              </label>
            </div>

            <div className="form-grid apply-worker-form-grid" style={{ marginTop: "20px" }}>
              <label className="field">
                <span>Available Start Time</span>
                <input
                  type="time"
                  name="availabilityStartTime"
                  value={form.availabilityStartTime}
                  onChange={handleChange}
                />
              </label>

              <label className="field">
                <span>Available End Time</span>
                <input
                  type="time"
                  name="availabilityEndTime"
                  value={form.availabilityEndTime}
                  onChange={handleChange}
                />
              </label>

              <label className="field">
                <span>M-Pesa Number</span>
                <input
                  name="mpesaNumber"
                  value={form.mpesaNumber}
                  onChange={handleChange}
                  placeholder="07..."
                />
              </label>

              <label className="field">
                <span>Name Registered on M-Pesa</span>
                <input
                  name="mpesaRegisteredName"
                  value={form.mpesaRegisteredName}
                  onChange={handleChange}
                  placeholder="As registered on M-Pesa"
                />
              </label>

              <label className="field field-span-2">
                <span>Bank Account Details</span>
                <input
                  name="bankAccountDetails"
                  value={form.bankAccountDetails}
                  onChange={handleChange}
                  placeholder="Optional bank details if applicable"
                />
              </label>
            </div>

            <div className="form-grid apply-worker-form-grid" style={{ marginTop: "20px" }}>
              <label className="field">
                <span>Profile Photo <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  type="file"
                  name="profilePhoto"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={fieldErrors.profilePhoto ? { borderColor: "#ef4444" } : undefined}
                />
                <PreviewImage src={previews.profilePhoto} alt="Profile preview" />
              </label>

              <label className="field">
                <span>National ID Front <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  type="file"
                  name="nationalIdFront"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={fieldErrors.nationalIdFront ? { borderColor: "#ef4444" } : undefined}
                />
                <PreviewImage src={previews.nationalIdFront} alt="ID front preview" />
              </label>

              <label className="field">
                <span>National ID Back <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  type="file"
                  name="nationalIdBack"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={fieldErrors.nationalIdBack ? { borderColor: "#ef4444" } : undefined}
                />
                <PreviewImage src={previews.nationalIdBack} alt="ID back preview" />
              </label>

              <label className="field">
                <span>Selfie Holding ID <span style={{ color: "#fca5a5" }}>*</span></span>
                <input
                  type="file"
                  name="selfieWithId"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={fieldErrors.selfieWithId ? { borderColor: "#ef4444" } : undefined}
                />
                <PreviewImage src={previews.selfieWithId} alt="Selfie with ID preview" />
              </label>
            </div>

            <div className="form-stack" style={{ marginTop: "20px" }}>
              <label className="check-field">
                <input
                  type="checkbox"
                  name="consentAccepted"
                  checked={form.consentAccepted}
                  onChange={handleChange}
                />
                <span>I consent to platform rules, vetting, and service deductions where applicable.</span>
              </label>

              <label className="check-field">
                <input
                  type="checkbox"
                  name="trackingConsentAccepted"
                  checked={form.trackingConsentAccepted}
                  onChange={handleChange}
                />
                <span>I consent to location-based attendance and live tracking during active jobs.</span>
              </label>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}
            {success ? <div className="success-banner">{success}</div> : null}

            <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
              <button
                type="submit"
                className="primary-button role-primary-button role-primary-button-worker"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Application"}
              </button>

              <button
                type="button"
                className="ghost-button role-secondary-button role-secondary-button-worker"
                onClick={() => navigate("/login?role=worker")}
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      )}

      <div
        style={{
          marginTop: "18px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.18)"
            }}
          />
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "999px",
              background: "#f59e0b",
              boxShadow: "0 0 12px rgba(245,158,11,0.6)"
            }}
          />
        </div>      </div>
    </div>
  );
}

function getTimeline(job = {}) {
  const directTimeline = Array.isArray(job?.timeline)
    ? job.timeline
    : Array.isArray(job?.history)
      ? job.history
      : Array.isArray(job?.activityLog)
        ? job.activityLog
        : [];

  if (directTimeline.length) {
    return directTimeline;
  }

  const synthetic = [];

  const pushItem = (label, at, note = "") => {
    if (!at) return;
    synthetic.push({
      label,
      at,
      createdAt: at,
      note,
      status: label
    });
  };

  pushItem("Job created", job?.createdAt, cleanText(job?.service || job?.category || ""));
  pushItem("Quote sent", job?.quoteSentAt, cleanText(job?.pricing?.adminNote || ""));
  pushItem("Worker assigned", job?.assignedAt, cleanText(job?.worker?.fullName || job?.assignedWorkerName || ""));
  pushItem("Worker accepted", job?.workerAcceptedAt, cleanText(job?.workerResponseNote || ""));
  pushItem("Arrived at site", job?.arrivedAt, cleanText(job?.arrivalNote || ""));
  pushItem("Work started", job?.startedAt, cleanText(job?.startNote || ""));
  pushItem("Work completed", job?.completedAt, cleanText(job?.completionNote || ""));
  pushItem("Released", job?.releasedAt, cleanText(job?.releaseNote || ""));

  return synthetic.sort((a, b) => {
    const aTime = new Date(a?.at || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.at || b?.createdAt || 0).getTime();
    return aTime - bTime;
  });
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/layout/AppShell";
import StatusBadge from "../../components/ui/StatusBadge";
import WorkerSelectModal from "../../components/admin/WorkerSelectModal";
import {
  getAdminJobsRequest,
  sendAdminQuoteRequest,
  assignWorkerToJobRequest,
  markDepositPaidRequest,
  verifyBalancePaymentRequest,
  adminRaiseJobIssueRequest,
  adminResolveJobIssueRequest,
  adminReleaseWorkerRequest,
  finalizeWorkerReleaseRequest
} from "../../api/jobsApi";
import {
  deleteClientAccountRequest,
  deleteWorkerAccountRequest,
  getClientDirectoryRequest,
  getPendingWorkerApplicationsRequest,
  getWorkerDirectoryRequest,
  reactivateWorkerAccountRequest,
  reviewWorkerApplicationRequest,
  suspendWorkerAccountRequest
} from "../../api/adminApi";
import { http } from "../../api/http";

const CLIENT_BLUE = "#3b82f6";
const WORKER_ORANGE = "#f59e0b";
const SUCCESS_GREEN = "#22c55e";
const DANGER_RED = "#ef4444";
const WARNING_AMBER = "#f59e0b";

function getLiveIndicatorStyle(isLive = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.02em",
    color: isLive ? "#86efac" : "#fca5a5",
    background: isLive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
    border: isLive ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(239,68,68,0.28)"
  };
}

function StatCard({ label, value, accent = "#93c5fd", badge = "", badgeTone = "#93c5fd" }) {
  return (
    <div
      style={{
        minHeight: "96px",
        borderRadius: "22px",
        padding: "18px 20px",
        background: "linear-gradient(180deg, rgba(15,23,42,0.82), rgba(15,23,42,0.58))",
        border: "1px solid rgba(148,163,184,0.18)",
        boxShadow: "0 18px 40px rgba(2,6,23,0.28)"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ color: "#e2e8f0", fontWeight: 800, fontSize: "15px", lineHeight: 1.2 }}>{label}</div>
        {badge ? (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 800,
            color: badgeTone,
            background: "rgba(15,23,42,0.45)",
            border: "1px solid rgba(148,163,184,0.18)"
          }}>
            {badge}
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: "14px", fontSize: "44px", lineHeight: 1, fontWeight: 900, color: accent }}>
        {value}
      </div>
    </div>
  );
}


function cleanText(value = "") {
  let text = String(value ?? "").trim();
  if (!text) return "-";

  const decodeOnce = (input) => {
    try {
      const bytes = Uint8Array.from(Array.from(input).map((char) => char.charCodeAt(0) & 0xff));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return input;
    }
  };

  for (let i = 0; i < 6; i += 1) {
    const decoded = decodeOnce(text);
    if (!decoded || decoded === text) break;
    text = decoded;
  }

  const bullet = ` ${String.fromCharCode(8226)} `;
  return text
    .replace(/�/g, "")
    .replace(/ â€¢ |ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢/g, bullet)
    .replace(/Ã¢â‚¬â„¢|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢/g, "'")
    .replace(/Ã¢â‚¬Å“|Ã¢â‚¬|ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÂ¢Ã¢â€šÂ¬|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€š/g, '"')
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "-";
}

function formatMoney(value) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function formatServiceLabel(value = "") {
  const raw = cleanText(value);
  if (raw === "-") return "-";
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderWorkerUploads(worker) {
  const app = worker?.applicationRecord;
  if (!app) return "No submitted files";

  const files = [app.profilePhoto, app.nationalIdFront, app.nationalIdBack, app.selfieWithId].filter(Boolean);
  if (!files.length) return "No submitted files";

  return files
    .map((file) => cleanText(file?.fileName || file?.originalName || file?.url || "Uploaded file"))
    .join(" | ");
}

function renderWorkerUploadCards(worker) {
  const app = worker?.applicationRecord;
  if (!app) return null;

  const assets = [
    ["Profile Photo", app.profilePhoto],
    ["ID Front", app.nationalIdFront],
    ["ID Back", app.nationalIdBack],
    ["Selfie with ID", app.selfieWithId]
  ].filter(([, asset]) => asset?.url || asset?.fileName || asset?.originalName);

  if (!assets.length) return null;

  return (
    <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
      {assets.map(([label, asset]) => (
        <div
          key={`${worker?._id || "worker"}-${label}`}
          className="glass-subcard"
          style={{
            padding: "12px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)",
            border: "1px solid rgba(255,255,255,0.10)"
          }}
        >
          <div style={{ color: "#f9a8d4", fontWeight: 800, marginBottom: "8px" }}>{label}</div>
          {asset?.url ? (
            <img
              src={asset.url}
              alt={label}
              style={{ width: "100%", height: "150px", objectFit: "cover", borderRadius: "12px", display: "block" }}
            />
          ) : (
            <div style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
              No preview url stored yet.<br />
              File: {cleanText(asset?.fileName || asset?.originalName || "-")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function renderWorkerApplicationSnapshot(worker) {
  const app = worker?.applicationRecord;
  if (!app) return null;

  const rows = [
    ["Next of Kin & Emergency", `Kin: ${cleanText(app.nextOfKinName || "-")} (${cleanText(app.nextOfKinRelationship || "-")}) | Kin Phone: ${cleanText(app.nextOfKinPhone || "-")} | Emergency: ${cleanText(app.neighborFriendContact || "-")}`, "#fca5a5"],
    ["Payment Details", `M-Pesa: ${cleanText(app.mpesaNumber || "-")} | Registered Name: ${cleanText(app.mpesaRegisteredName || "-")} | Bank / Account: ${cleanText(app.bankAccountDetails || app.bankAccountNumber || "n/a")}`, "#22d3ee"],
    ["Experience Summary", cleanText(app.experienceSummary || app.workExperience || "No experience summary submitted."), "#c4b5fd"],
    ["Application Notes", `DOB: ${cleanText(app.dateOfBirth || "-")} | National ID: ${cleanText(app.nationalIdNumber || "-")} | Alt Phone: ${cleanText(app.alternatePhone || "-")} | Preferred Days: ${Array.isArray(app.availableDays) ? app.availableDays.map(cleanText).join(", ") : cleanText(app.availableDays || "-")}`, "#93c5fd"]
  ];

  return (
    <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
      {rows.map(([label, value, tone]) => (
        <div key={`${worker?._id || "worker"}-${label}`} style={{ padding: "14px 16px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.10)", background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(15,23,42,0.08) 100%)" }}>
          <div style={{ color: tone, fontWeight: 800, marginBottom: "6px" }}>{label}</div>
          <div style={{ color: "#f8fafc", lineHeight: 1.7 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function buildApplicationIncompleteMessage(application, adminNote = "") {
  const missing = Array.isArray(application?.missingFields) && application.missingFields.length
    ? `Missing details: ${application.missingFields.join(", ")}.`
    : "Some application details still need clarification.";

  return `Hello ${application?.fullName || "Applicant"},

Your HomeCare worker application is still under review but cannot be approved yet. ${missing}

Admin guidance: ${adminNote || "Please review your application details and update the missing information."}

Keep your submitted phone number and email active so you do not miss the follow-up guidance from admin.`;
}

function buildApprovalOnboardingMessage(payload, adminNote = "") {
  const workerName = payload?.workerUser?.fullName || payload?.application?.fullName || "Worker";
  const phone = payload?.workerUser?.phone || payload?.application?.phone || "-";
  const email = payload?.application?.email || payload?.workerUser?.email || "-";
  const password = payload?.tempPassword || "-";

  return `Hello ${workerName},

Congratulations. Your HomeCare worker account has been approved.${adminNote ? `

Admin note: ${adminNote}` : ""}

Login details:
Phone: ${phone}
Email: ${email}
Password: ${password}

Please sign in and change this password after your first login. Admin does not store autogenerated passwords. If you forget your password later, use the Forgot Password flow so the system generates a fresh one.`;
}


function renderUploadLine(label, file) {
  const fileName = cleanText(file?.fileName || file?.originalName || file?.name || "-");
  const url = file?.url || file?.secureUrl || "";
  if (!url) return `${label}: ${fileName}`;
  return `${label}: ${fileName} | ${url}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}


function getMapQuery(job) {
  const query = [
    job?.location?.addressLine,
    job?.location?.estate,
    job?.location?.town,
    job?.location?.county
  ].filter(Boolean).join(", ");
  return encodeURIComponent(query || "");
}


function getWhatsAppUrl(phone, message = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  let normal = digits;
  if (digits.startsWith("0")) normal = `254${digits.slice(1)}`;
  if (digits.startsWith("7") || digits.startsWith("1")) normal = `254${digits}`;
  const suffix = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${normal}${suffix}`;
}


function getGmailComposeUrl(email = "", subject = "", body = "") {
  const params = new URLSearchParams();
  if (email) params.set("to", email);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?view=cm&fs=1&${params.toString()}`;
}


function Loader({ label = "Loading..." }) {
  return (
    <div className="glass-card section-card" style={{ padding: "28px", textAlign: "center" }}>
      <div style={{ color: "#e2e8f0", fontWeight: 800, fontSize: "1rem" }}>{label}</div>
    </div>
  );
}


function EmptyState({ title = "Nothing here yet", text = "Once records are available they will appear here without needing a page refresh." }) {
  return (
    <div
      className="glass-subcard"
      style={{
        padding: "22px",
        borderRadius: "20px",
        border: "1px dashed rgba(255,255,255,0.18)",
        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(148,163,184,0.03) 100%)"
      }}
    >
      <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: "1.05rem", marginBottom: "8px" }}>{title}</div>
      <div style={{ color: "#cbd5e1", lineHeight: 1.7 }}>{text}</div>
    </div>
  );
}


function FieldRow({ label, value, valueColor = "#f8fafc" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "12px", alignItems: "start", marginBottom: "8px" }}>
      <div style={{ color: "#94a3b8", fontWeight: 700 }}>{label}</div>
      <div style={{ color: valueColor, lineHeight: 1.65, wordBreak: "break-word" }}>{value || "-"}</div>
    </div>
  );
}


function ModalShell({ title, onClose, width = 640, children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "18px",
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        className="glass-card section-card"
        style={{ width: "100%", maxWidth: `${width}px`, padding: "24px", borderRadius: "22px" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, color: "#f8fafc" }}>{title}</h3>
          <button className="ghost-button" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}


function ServiceSummaryBlock({ services }) {
  const list = Array.isArray(services)
    ? services
    : String(services || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  if (!list.length) {
    return <div style={{ color: "#cbd5e1", lineHeight: 1.7 }}>No services submitted.</div>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {list.map((service, index) => (
        <span
          key={`${service}-${index}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 10px",
            borderRadius: "999px",
            background: "rgba(59,130,246,0.10)",
            border: "1px solid rgba(96,165,250,0.22)",
            color: "#dbeafe",
            fontWeight: 700,
            fontSize: "12px"
          }}
        >
          {cleanText(service)}
        </span>
      ))}
    </div>
  );
}


function getMissingApplicationDetails(application = {}) {
  const checks = [
    ["Full name", application.fullName],
    ["Phone", application.phone],
    ["National ID number", application.nationalIdNumber],
    ["County", application.county],
    ["Town", application.town],
    ["Estate", application.estate],
    ["Address line", application.addressLine],
    ["Service categories", Array.isArray(application.serviceCategories) ? application.serviceCategories.length : application.serviceCategories],
    ["Availability start time", application.availabilityStartTime],
    ["Availability end time", application.availabilityEndTime],
    ["Next of kin name", application.nextOfKinName],
    ["Next of kin phone", application.nextOfKinPhone],
    ["M-Pesa number", application.mpesaNumber],
    ["M-Pesa registered name", application.mpesaRegisteredName],
    ["Profile photo", application.profilePhoto],
    ["ID front", application.nationalIdFront],
    ["ID back", application.nationalIdBack],
    ["Selfie with ID", application.selfieWithId]
  ];

  return checks
    .filter(([, value]) => {
      if (Array.isArray(value)) return value.length === 0;
      return !String(value ?? "").trim();
    })
    .map(([label]) => label);
}


function formatAvailabilityWindow(profile = {}) {
  const availability = profile?.availability || {};
  const status = String(availability?.status || "").toLowerCase();
  const availableAt =
    availability?.availableAt ||
    availability?.scheduledFor ||
    availability?.availableFrom ||
    availability?.unavailableUntil ||
    "";

  if (!availableAt) {
    return status ? cleanText(status) : "-";
  }

  const date = new Date(availableAt);
  if (Number.isNaN(date.getTime())) {
    return cleanText(status || "-");
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const sameDay = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const dayLabel = sameDay ? "today" : (isTomorrow ? "tomorrow" : date.toLocaleDateString());
  const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (status === "available") return `Available from ${dayLabel} at ${timeLabel}`;
  if (status === "unavailable") return `Unavailable until ${dayLabel} at ${timeLabel}`;
  return `${cleanText(status || "Scheduled")} - ${dayLabel} at ${timeLabel}`;
}


function workerTimingStatus(job = {}) {
  const workerAvailability = job?.assignedWorker?.profile?.availability || job?.assignedWorker?.availability || {};
  const status = String(workerAvailability?.status || "").toLowerCase();
  const scheduledLine = formatAvailabilityWindow({ availability: workerAvailability });

  if (job?.releasedAt || job?.assignmentStatus === "released" || job?.status === "completed") {
    return { label: "Released", tone: "#86efac" };
  }
  if (job?.status === "issue_reported") {
    return { label: "Issue raised after job", tone: "#fca5a5" };
  }
  if (job?.status === "issue_resolved") {
    return { label: "Issue resolved - awaiting release", tone: "#fcd34d" };
  }
  if (job?.status === "awaiting_admin_clearance") {
    return { label: "Awaiting admin release", tone: "#fcd34d" };
  }
  if (job?.startedAt || job?.status === "work_in_progress") {
    return { label: "Work in progress", tone: "#86efac" };
  }
  if (job?.arrivedAt || job?.status === "worker_arrived") {
    return { label: "Arrived at site", tone: "#93c5fd" };
  }
  if (job?.enRouteAt || job?.status === "worker_en_route") {
    return { label: "En route to client", tone: "#93c5fd" };
  }
  if (job?.workerAcceptedAt || job?.status === "worker_accepted") {
    return { label: "Accepted by worker", tone: "#93c5fd" };
  }
  if (status === "unavailable") {
    return { label: scheduledLine != "-" ? scheduledLine : "Unavailable", tone: "#fca5a5" };
  }
  if (status === "available") {
    return { label: scheduledLine != "-" ? scheduledLine : "Available", tone: "#86efac" };
  }
  return { label: "Awaiting worker movement", tone: "#cbd5e1" };
}


export default function AdminDashboardPage() {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [assignDraft, setAssignDraft] = useState({ workerUserId: "", workerOfferedAmount: "", adminQuoteNotes: "", platformRetentionRate: "20" });
  const [expandedMapJobId, setExpandedMapJobId] = useState("");
  const [quoteDrafts, setQuoteDrafts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [actingJobId, setActingJobId] = useState("");
  const [workerDirectory, setWorkerDirectory] = useState([]);
  const [clientDirectory, setClientDirectory] = useState([]);
  const [workerApplications, setWorkerApplications] = useState([]);
  const [adminView, setAdminView] = useState("dashboard");
  const [jobFocusFilter, setJobFocusFilter] = useState("all");

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("admin-live-ui-style")) return;
    const style = document.createElement("style");
    style.id = "admin-live-ui-style";
    style.innerHTML = `
      @keyframes status-pulse {
        0% { transform: scale(1); opacity: 0.82; }
        70% { transform: scale(2.5); opacity: 0; }
        100% { transform: scale(1); opacity: 0; }
      }
      .live-status-dot {
        height: 10px;
        width: 10px;
        border-radius: 50%;
        display: inline-block;
        position: relative;
        flex: 0 0 auto;
      }
      .live-status-dot::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 50%;
        z-index: -1;
        animation: status-pulse 1.9s infinite;
        background: currentColor;
      }
    `;
    document.head.appendChild(style);
  }, []);

  const [directoryFilter, setDirectoryFilter] = useState("all");

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("admin-blink-style")) return;
    const style = document.createElement("style");
    style.id = "admin-blink-style";
    style.innerHTML = "@keyframes adminBlink{0%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.45)}100%{opacity:1;transform:scale(1)}}";
    document.head.appendChild(style);
  }, []);


  const [modalState, setModalState] = useState({
    type: "",
    open: false,
    payload: null
  });

  const [modalForm, setModalForm] = useState({
    password: "",
    reason: "",
    resolutionNote: "",
    adminReviewNotes: "",
    rejectionReason: ""
  });

  const [activitiesUnlocked, setActivitiesUnlocked] = useState(false);
  const [approvalResult, setApprovalResult] = useState(null);
  const [approvalMessage, setApprovalMessage] = useState("");

  const resetModal = () => {
    setModalState({ type: "", open: false, payload: null });
    setModalForm({
      password: "",
      reason: "",
      resolutionNote: "",
      adminReviewNotes: "",
      rejectionReason: ""
    });
    setError("");
  };

  const closeApprovalResult = async () => {
    setApprovalResult(null);
    setApprovalMessage("");
    await load();
  };

  const load = async () => {
    try {
      setError("");
      const [jobsRes, usersRes, workersRes, clientsRes, applicationsRes] = await Promise.all([
        getAdminJobsRequest(),
        http.get("/api/auth/admin/users?status=deleted"),
        getWorkerDirectoryRequest(),
        getClientDirectoryRequest(),
        getPendingWorkerApplicationsRequest()
      ]);

      setJobs(jobsRes.data || []);
      setDeletedUsers(Array.isArray(usersRes.data?.data) ? usersRes.data.data : []);
      setWorkerDirectory(Array.isArray(workersRes.data) ? workersRes.data : []);
      setClientDirectory(Array.isArray(clientsRes.data) ? clientsRes.data : []);
      setWorkerApplications(Array.isArray(applicationsRes.data) ? applicationsRes.data : []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load admin dashboard.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setError("");
    setSuccess("");
  }, [adminView]);

  const handleQuoteDraftChange = (jobId, field, value) => {
    setQuoteDrafts((current) => ({
      ...current,
      [jobId]: {
        finalClientChargeAmount: current[jobId]?.finalClientChargeAmount || "",
        depositPercentage: current[jobId]?.depositPercentage || 30,
        adminQuoteNotes: current[jobId]?.adminQuoteNotes || "",
        [field]: value
      }
    }));
  };

  const handleSendQuote = async (jobId) => {
    setError("");
    setSuccess("");
    const draft = quoteDrafts[jobId] || {};

    try {
      await sendAdminQuoteRequest(jobId, {
        finalClientChargeAmount: Number(draft.finalClientChargeAmount),
        depositPercentage: Number(draft.depositPercentage || 30),
        adminQuoteNotes: draft.adminQuoteNotes || ""
      });
      setSuccess("Final quote sent successfully.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send quote.");
    }
  };

  const handleAssign = async (workerId, payload) => {
    setError("");
    setSuccess("");

    try {
      await assignWorkerToJobRequest(selectedJob?._id || selectedJob, {
        workerUserId: workerId,
        ...payload
      });
      setSelectedJob(null);
      setSuccess("Worker assigned successfully.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to assign worker.");
    }
  };

  const handleMarkDepositPaid = async (jobId) => {
    setError("");
    setSuccess("");
    try {
      await markDepositPaidRequest(jobId);
      setSuccess("Deposit recorded successfully.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to mark deposit paid.");
    }
  };

  const handleVerifyPayment = async (jobId) => {
    setError("");
    setSuccess("");
    setActingJobId(jobId);

    try {
      await verifyBalancePaymentRequest(jobId);
      setSuccess("Payment received and verified.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to verify balance payment.");
    } finally {
      setActingJobId("");
    }
  };

  const handleReleaseWorker = async (job) => {
    setError("");
    setSuccess("");
    setActingJobId(job._id);

    try {
      await adminReleaseWorkerRequest(job._id, {
        adminActionNotes: "Admin verified payment and released worker from site."
      });
      setSuccess("Worker released successfully.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to release worker.");
    } finally {
      setActingJobId("");
    }
  };

  const handleFinalizeRelease = async (job) => {
    setError("");
    setSuccess("");
    setActingJobId(job._id);

    try {
      await finalizeWorkerReleaseRequest(job._id, {
        adminActionNotes: "Admin verified client proof and released worker."
      });
      setSuccess("Payment verified and worker released successfully.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to finalize worker release.");
    } finally {
      setActingJobId("");
    }
  };

  const submitRaiseIssue = async () => {
    const job = modalState.payload;
    if (!job) return;
    if (!modalForm.reason.trim() || !modalForm.adminReviewNotes.trim()) {
      setError("Client issue notes and admin action notes are required.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      await adminRaiseJobIssueRequest(job._id, {
        clientIssueNotes: modalForm.reason,
        workerExplanation: modalForm.resolutionNote,
        adminActionNotes: modalForm.adminReviewNotes
      });
      setSuccess("Issue recorded successfully.");
      resetModal();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to raise issue.");
    }
  };

  const submitResolveIssue = async () => {
    const job = modalState.payload;
    if (!job) return;
    if (!modalForm.adminReviewNotes.trim()) {
      setError("Resolution notes are required.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      await adminResolveJobIssueRequest(job._id, { adminActionNotes: modalForm.adminReviewNotes });
      setSuccess("Issue resolved successfully.");
      resetModal();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to resolve issue.");
    }
  };

  const submitSuspendWorker = async () => {
    const worker = modalState.payload;
    if (!worker) return;
    if (!modalForm.reason.trim()) {
      setError("Suspension reason is required.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      await suspendWorkerAccountRequest(worker._id, { reason: modalForm.reason });
      setSuccess("Worker suspended successfully.");
      resetModal();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to suspend worker.");
    }
  };

  const submitReactivateWorker = async () => {
    const worker = modalState.payload;
    if (!worker) return;

    setError("");
    setSuccess("");

    try {
      await reactivateWorkerAccountRequest(worker._id, { resolutionNote: modalForm.resolutionNote });
      setSuccess("Worker reactivated successfully.");
      resetModal();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to reactivate worker.");
    }
  };

  const openAdminModal = (type, payload = null, preset = {}) => {
    setError("");
    setSuccess("");
    setModalForm({
      reason: "",
      resolutionNote: "",
      adminReviewNotes: "",
      rejectionReason: "",
      password: "",
      ...preset
    });
    setModalState({
      type,
      open: true,
      payload
    });
  };

  const submitDeleteClient = async () => {
    const client = modalState.payload;
    if (!client) return;

    const reason = String(modalForm.reason || "").trim();
    if (!reason) {
      setError("Deletion reason is required.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      const response = await deleteClientAccountRequest(client._id, { reason });
      setSuccess(response?.message || "Client account deleted successfully.");
      resetModal();
      setAdminView("deactivated_clients");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to delete client account.");
    }
  };

  const submitDeleteWorker = async () => {
    const worker = modalState.payload;
    if (!worker) return;
    if (!modalForm.reason.trim()) {
      setError("Deletion reason is required.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      await deleteWorkerAccountRequest(worker._id, { reason: modalForm.reason });
      setSuccess("Worker account deleted successfully.");
      resetModal();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete worker account.");
    }
  };

  const submitActivitiesUnlock = () => {
    if (!modalForm.password.trim()) {
      setError("Admin password is required to open Activities Today.");
      return;
    }
    setActivitiesUnlocked(true);
    resetModal();
  };


const submitApplicationReview = async (decision) => {
  const application = modalState.payload;
  if (!application) return;

  if (decision === "needs_more_info" && !modalForm.adminReviewNotes.trim()) {
    setError("Explain what is missing in the application.");
    return;
  }

  if (decision === "rejected" && !modalForm.rejectionReason.trim()) {
    setError("Rejection reason is required.");
    return;
  }

  setError("");
  setSuccess("");

  try {
    const res = await reviewWorkerApplicationRequest(application._id, {
      decision,
      adminReviewNotes: modalForm.adminReviewNotes,
      rejectionReason: modalForm.rejectionReason
    });

    const payload = res?.data || null;
    const adminNote = String(modalForm.adminReviewNotes || "").trim();

    if (decision === "approved" && payload?.tempPassword) {
      const nextApprovalResult = {
        application,
        workerUser: payload.workerUser,
        tempPassword: payload.tempPassword,
        adminNote
      };
      setApprovalResult(nextApprovalResult);
      setApprovalMessage(buildApprovalOnboardingMessage(nextApprovalResult, adminNote));
    }

    setSuccess(
      decision === "approved"
        ? "Worker application approved successfully."
        : decision === "needs_more_info"
          ? "Application marked as incomplete / needs more info."
          : "Application rejected successfully."
    );
    resetModal();
    await load();
  } catch (err) {
    setError(err?.response?.data?.message || "Failed to review worker application.");
  }
};


  const summary = useMemo(() => {
    const awaitingRelease = jobs.filter((job) =>
      ["awaiting_admin_clearance", "issue_resolved"].includes(job.status)
    ).length;

    const liveJobs = jobs.filter((job) =>
      ["worker_accepted", "worker_en_route", "worker_arrived", "work_in_progress", "awaiting_admin_clearance", "issue_reported", "issue_resolved"].includes(job.status)
    ).length;

    const workersLive = workerDirectory.filter((worker) =>
      ["available", "on", "online", "ready"].includes(String(worker?.profile?.availability?.status || "").toLowerCase())
    ).length;

    const clientsLive = clientDirectory.filter((client) =>
      String(client?.currentAccountState || client?.accountStatus || "").toLowerCase() === "active"
    ).length;

    const suspendedWorkers = workerDirectory.filter((worker) =>
      String(worker?.currentAccountState || worker?.accountStatus || "").toLowerCase() === "suspended"
    ).length;

    const suspendedClients = clientDirectory.filter((client) =>
      String(client?.currentAccountState || client?.accountStatus || "").toLowerCase() === "suspended"
    ).length;

    const deactivatedClients = deletedUsers.filter((user) =>
      String(user?.role || "").toLowerCase() === "client"
    ).length;

    const notificationCount =
      workerApplications.filter((app) => app.status === "pending").length +
      jobs.filter((job) => job.status === "quote_pending_client" || job.status === "quote_accepted_ready_for_dispatch" || job.status === "issue_reported").length;

    return {
      awaitingRelease,
      liveJobs,
      workers: workerDirectory.length,
      clients: clientDirectory.length,
      workersLive,
      clientsLive,
      suspendedWorkers,
      suspendedClients,
      deactivatedClients,
      notificationCount
    };
  }, [jobs, workerDirectory, clientDirectory, deletedUsers, workerApplications]);

  const activitiesToday = useMemo(() => {
    const totalBusinessToday = jobs
      .filter((job) => isToday(job?.payment?.adminPaymentVerifiedAt || job?.payment?.clientReportedBalancePaidAt || job?.releasedAt || job?.completedAt))
      .reduce((sum, job) => sum + Number(job?.pricing?.finalClientChargeAmount || 0), 0);

    const totalProfitToday = jobs
      .filter((job) => isToday(job?.payment?.adminPaymentVerifiedAt || job?.releasedAt || job?.completedAt))
      .reduce((sum, job) => sum + Number(job?.pricing?.adminGrossMarginAmount || 0), 0);

    return [
      ["Total Business Today", formatMoney(totalBusinessToday)],
      ["Total Profit Today", formatMoney(totalProfitToday)],
      ["Rejected Worker Applications Today", workerApplications.filter((a) => a.status === "rejected" && isToday(a.reviewedAt)).length],
      ["Approved Fresh Workers Today", workerApplications.filter((a) => a.status === "approved" && isToday(a.reviewedAt)).length],
      ["New Clients Today", clientDirectory.filter((c) => isToday(c.createdAt || c.registrationDate)).length],
      ["Jobs Accepted by Workers Today", jobs.filter((j) => isToday(j.workerAcceptedAt)).length],
      ["Pending Offer Response from Client Today", jobs.filter((j) => j.status === "quote_pending_client").length],
      ["Pending Offer Response from Workers", jobs.filter((j) => j.assignmentStatus === "pending" || j.status === "worker_pending_acceptance").length],
      ["Jobs Offer Rejected by Workers", jobs.filter((j) => j.assignmentStatus === "declined" || j.status === "worker_declined").length],
      ["Job Cancellations by Clients", jobs.filter((j) => j.status === "cancelled_by_client").length],
      ["Pending Unresolved Matters", jobs.filter((j) => j.status === "issue_reported").length],
      ["Resolved Matters", jobs.filter((j) => j.status === "issue_resolved").length],
      ["Follow Up Matters", jobs.filter((j) => ["quote_pending_client", "deposit_pending", "issue_reported"].includes(j.status)).length]
    ];
  }, [jobs, workerApplications, clientDirectory]);

  const suspendedWorkersList = workerDirectory.filter((worker) =>
    String(worker?.currentAccountState || worker?.accountStatus || "").toLowerCase() === "suspended"
  );

  const suspendedClientsList = clientDirectory.filter((client) =>
    String(client?.currentAccountState || client?.accountStatus || "").toLowerCase() === "suspended"
  );

  const deactivatedClientsList = deletedUsers.filter((user) =>
    String(user?.role || "").toLowerCase() === "client"
  );

  const pendingWorkerApplications = workerApplications.filter((app) =>
    ["pending", "needs_more_info"].includes(String(app.status || "").toLowerCase())
  );


  const visibleWorkerDirectory = useMemo(() => {
    if (directoryFilter !== "live_workers") return workerDirectory;
    return workerDirectory.filter((worker) =>
      ["available", "on", "online", "ready"].includes(String(worker?.profile?.availability?.status || "").toLowerCase())
    );
  }, [directoryFilter, workerDirectory]);

  const visibleClientDirectory = useMemo(() => {
    if (directoryFilter !== "live_clients") return clientDirectory;
    return clientDirectory.filter((client) =>
      String(client?.currentAccountState || client?.accountStatus || "").toLowerCase() === "active"
    );
  }, [directoryFilter, clientDirectory]);

  const rankWorkersForJob = (job, workers) => {
    const estate = String(job?.location?.estate || "").trim().toLowerCase();
    const town = String(job?.location?.town || "").trim().toLowerCase();
    const county = String(job?.location?.county || "").trim().toLowerCase();

    const scoreWorker = (worker) => {
      let score = 0;
      const wEstate = String(worker?.profile?.address?.estate || worker?.profile?.estate || "").trim().toLowerCase();
      const wTown = String(worker?.profile?.address?.town || worker?.profile?.town || "").trim().toLowerCase();
      const wCounty = String(worker?.profile?.address?.county || worker?.profile?.county || "").trim().toLowerCase();
      const state = String(worker?.currentAccountState || worker?.accountStatus || "active").toLowerCase();
      const availability = String(worker?.profile?.availability?.status || "").toLowerCase();

      if (state === "active") score += 6;
      if (["available", "on", "online", "ready"].includes(availability)) score += 8;
      if (estate && wEstate && estate === wEstate) score += 10;
      if (town && wTown && town === wTown) score += 6;
      if (county && wCounty && county === wCounty) score += 3;
      return score;
    };

    return [...workers].sort((a, b) => scoreWorker(b) - scoreWorker(a));
  };

  const assignableWorkers = useMemo(() => {
    if (!selectedJob) return [];
    return rankWorkersForJob(selectedJob, workerDirectory).filter((worker) => {
      const state = String(worker?.currentAccountState || worker?.accountStatus || "active").toLowerCase();
      const availability = String(worker?.profile?.availability?.status || "").toLowerCase();
      return state === "active" && ["available", "on", "online", "ready"].includes(availability);
    });
  }, [selectedJob, workerDirectory]);

  const visibleJobs = useMemo(() => {
    if (jobFocusFilter === "live") {
      return jobs.filter((job) =>
        ["worker_accepted", "worker_en_route", "worker_arrived", "work_in_progress", "awaiting_admin_clearance", "issue_reported", "issue_resolved"].includes(job.status)
      );
    }

    if (jobFocusFilter === "awaiting_release") {
      return jobs.filter((job) => ["awaiting_admin_clearance", "issue_resolved"].includes(job.status));
    }

    return jobs;
  }, [jobFocusFilter, jobs]);

  const notificationItems = useMemo(() => {
    const items = [];

    workerApplications
      .filter((app) => ["pending", "needs_more_info"].includes(String(app.status || "").toLowerCase()))
      .forEach((app) => {
        items.push({
          id: `worker-app-${app._id}`,
          title: `${cleanText(app.fullName || "Worker applicant")} requires review`,
          detail:
            String(app.status || "pending").toLowerCase() === "needs_more_info"
              ? "Application marked incomplete and needs admin follow-up."
              : "Pending worker application awaiting admin decision.",
          actionLabel: "Open Applications",
          onClick: () => setAdminView("pending_worker_applications"),
          tone: "#ef4444"
        });
      });

    jobs.filter((job) => job.status === "quote_pending_client").forEach((job) => {
      items.push({
        id: `client-quote-${job._id}`,
        title: `${cleanText(job.clientUserId?.fullName || "Client")} is reviewing final quote`,
        detail: `${cleanText(job.title || "Job")} is waiting for client response.`,
        actionLabel: "Open Jobs",
        onClick: () => {
          setJobFocusFilter("all");
          setAdminView("dashboard");
        },
        tone: "#f59e0b"
      });
    });

    jobs.filter((job) => job.status === "quote_accepted_ready_for_dispatch").forEach((job) => {
      items.push({
        id: `dispatch-${job._id}`,
        title: `${cleanText(job.title || "Job")} is ready for worker assignment`,
        detail: `${cleanText(job.clientUserId?.fullName || "Client")} accepted the quote. Dispatch a worker now.`,
        actionLabel: "Open Jobs",
        onClick: () => {
          setJobFocusFilter("all");
          setAdminView("dashboard");
        },
        tone: "#38bdf8"
      });
    });

    jobs.filter((job) => job.status === "issue_reported").forEach((job) => {
      items.push({
        id: `issue-${job._id}`,
        title: `${cleanText(job.title || "Job")} has an issue raised`,
        detail: "Post-service issue needs admin intervention before release.",
        actionLabel: "Review Jobs",
        onClick: () => {
          setJobFocusFilter("awaiting_release");
          setAdminView("dashboard");
        },
        tone: "#ef4444"
      });
    });

    jobs.filter((job) => job.payment?.paymentStatus === "client_reported_balance_payment").forEach((job) => {
      items.push({
        id: `payment-${job._id}`,
        title: `${cleanText(job.title || "Job")} awaits payment verification`,
        detail: "Client reported balance payment. Verify before release.",
        actionLabel: "Open Awaiting Release",
        onClick: () => {
          setJobFocusFilter("awaiting_release");
          setAdminView("dashboard");
        },
        tone: "#22c55e"
      });
    });

    return items;
  }, [jobs, workerApplications]);

  const adminSidebarNav = (
    <>
      {[
        ["dashboard", "Dashboard"],
        ["worker_directory", "Worker Directory"],
        ["client_directory", "Client Directory"],
        ["suspended_workers", "Suspended Workers"],
        ["suspended_clients", "Suspended Clients"],
        ["deactivated_clients", "Deactivated Clients"],
        ["notification_center", "Notification Center"],
        ["pending_worker_applications", "Pending Worker Applications"]
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setAdminView(value)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: "16px",
            background:
              adminView === value
                ? "linear-gradient(135deg, rgba(192,132,252,0.18) 0%, rgba(255,255,255,0.08) 100%)"
                : "rgba(255,255,255,0.04)",
            border:
              adminView === value
                ? "1px solid rgba(192,132,252,0.34)"
                : "1px solid rgba(255,255,255,0.08)",
            color: adminView === value ? "#f8fafc" : "#dbe7f5",
            fontWeight: adminView === value ? 800 : 650,
            cursor: "pointer"
          }}
        >
          {label}
        </button>
      ))}
    </>
  );

  return (
    <AppShell
      title=""
      subtitle=""
      hideMainHeader
      hideDefaultNav
      sidebarHeaderTitle="Admin Dashboard"
      sidebarHeaderSubtitle="Review jobs, send final quotes, collect commitment, dispatch intelligently, verify payment, and release workers."
      sidebarExtra={adminSidebarNav}
    >
      <style>{`
        @keyframes adminBlink {
          0% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
          70% { opacity: 0.55; transform: scale(1.08); box-shadow: 0 0 0 10px rgba(239,68,68,0); }
          100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
      `}</style>

      {error ? <div className="error-banner">{error}</div> : null}
      {success ? <div className="success-banner">{success}</div> : null}

      {adminView === "dashboard" ? (
        <>
          <div
            className="stats-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px"
            }}
          >
            <StatCard label="Live Jobs" value={summary.liveJobs} accent="#93c5fd" hint="Open active jobs in progress" onClick={() => { setJobFocusFilter("live"); setAdminView("dashboard"); setSuccess(summary.liveJobs > 0 ? "Live jobs highlighted." : "No live jobs right now."); }} />
            <StatCard label="Awaiting Release" value={summary.awaitingRelease} accent="#fcd34d" hint="Open jobs waiting verification or release" onClick={() => { setJobFocusFilter("awaiting_release"); setAdminView("dashboard"); setSuccess(summary.awaitingRelease > 0 ? "Jobs awaiting release highlighted." : "No jobs are awaiting release right now."); }} />
            <StatCard label="Worker Directory" value={summary.workers} accent="#86efac" onClick={() => { setDirectoryFilter("all"); setAdminView("worker_directory"); }} />
            <StatCard label="Client Directory" value={summary.clients} accent="#60a5fa" onClick={() => { setDirectoryFilter("all"); setAdminView("client_directory"); }} />
            <StatCard label="Suspended Workers" value={summary.suspendedWorkers} accent="#fca5a5" onClick={() => setAdminView("suspended_workers")} />
            <StatCard label="Suspended Clients" value={summary.suspendedClients} accent="#fdba74" onClick={() => setAdminView("suspended_clients")} />
            <StatCard label="Deactivated Clients" value={summary.deactivatedClients} accent="#c4b5fd" onClick={() => setAdminView("deactivated_clients")} />
            <StatCard label="Workers Live" value={summary.workersLive} accent="#22c55e" badge={summary.workersLive > 0 ? "Live" : "Offline"} badgeTone={summary.workersLive > 0 ? "#22c55e" : "#ef4444"} blink onClick={() => { setDirectoryFilter("live_workers"); setAdminView("worker_directory"); setSuccess(summary.workersLive > 0 ? "Live workers highlighted." : "No workers are live right now."); }} />
            <StatCard label="Clients Live" value={summary.clientsLive} accent="#38bdf8" badge={summary.clientsLive > 0 ? "Live" : "Offline"} badgeTone={summary.clientsLive > 0 ? "#22c55e" : "#ef4444"} blink onClick={() => { setDirectoryFilter("live_clients"); setAdminView("client_directory"); setSuccess(summary.clientsLive > 0 ? "Live clients highlighted." : "No clients are live right now."); }} />
            <StatCard label="New Notification" value={summary.notificationCount} accent="#ef4444" badge={summary.notificationCount > 0 ? "New" : "None"} badgeTone={summary.notificationCount > 0 ? "#ef4444" : "#94a3b8"} blink={summary.notificationCount > 0} onClick={() => { setAdminView("notification_center"); setSuccess(summary.notificationCount > 0 ? "Notification center opened." : "No new notifications right now."); }} />
          </div>

          <div
            className="stats-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
              marginTop: "14px"
            }}
          >
            <button
              type="button"
              className="glass-card section-card"
              onClick={() => openAdminModal("unlock_activities", null, { password: "" })}
              style={{
                textAlign: "left",
                padding: "18px",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
                minHeight: "unset"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <h3 style={{ margin: 0, color: "#f8fafc" }}>Activities Today</h3>
                <span
                  style={{
                    padding: "5px 10px",
                    borderRadius: "999px",
                    background: "rgba(250,204,21,0.16)",
                    border: "1px solid rgba(250,204,21,0.28)",
                    color: "#fcd34d",
                    fontWeight: 800,
                    fontSize: "0.8rem"
                  }}
                >
                  Locked
                </span>
              </div>
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Open today's protected business and performance analytics.
              </p>
            </button>
          </div>

          {activitiesUnlocked ? (
            <div
              className="glass-card section-card"
              style={{
                marginTop: "16px",
                padding: "18px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#f8fafc" }}>Activities Today</h3>
                  <p style={{ color: "#cbd5e1", marginTop: "6px" }}>Protected operational daily metrics.</p>
                </div>
                <button className="ghost-button" onClick={() => setActivitiesUnlocked(false)}>
                  Lock Again
                </button>
              </div>

              <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {activitiesToday.map(([label, value]) => (
                  <div
                    key={label}
                    className="glass-subcard"
                    style={{
                      padding: "16px",
                      borderRadius: "18px",
                      background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)",
                      border: "1px solid rgba(255,255,255,0.10)"
                    }}
                  >
                    <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: "6px" }}>{label}</div>
                    <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: "1.18rem" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="card-stack" style={{ marginTop: "18px" }}>
            {isLoading ? (
              <p>Loading jobs...</p>
            ) : visibleJobs.length === 0 ? (
              <EmptyState title={jobFocusFilter === "live" ? "No live jobs right now" : jobFocusFilter === "awaiting_release" ? "No jobs awaiting release" : "No jobs yet"} text={jobFocusFilter === "all" ? "Jobs will appear here in latest-to-oldest order." : "Clear the active job filter to view all jobs again."} />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
                  <div style={{ color: "#dbe7f5", fontWeight: 700 }}>
                    {jobFocusFilter === "live" ? "Showing live jobs only" : jobFocusFilter === "awaiting_release" ? "Showing jobs awaiting release only" : "Showing all jobs"}
                  </div>
                  {jobFocusFilter !== "all" ? (
                    <button className="ghost-button" onClick={() => setJobFocusFilter("all")}>Clear Job Filter</button>
                  ) : null}
                </div>
              {visibleJobs
                .slice()
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .map((job) => {
                  const finalCharge = Number(job.pricing?.finalClientChargeAmount || 0);
                  const workerOffer = Number(job.pricing?.workerOfferedAmount || 0);
                  const retention = Number(job.pricing?.platformRetentionAmount || 0);
                  const grossMargin = Number(job.pricing?.adminGrossMarginAmount || 0);
                  const paymentStatus = job.payment?.paymentStatus || "unpaid";
                  const depositAmount = Number(job.payment?.depositAmount || 0);
                  const balanceAmount = paymentStatus === "paid_in_full" ? 0 : Number(job.payment?.balanceAmount || 0);
                  const timeline = getTimeline(job);
                  const timing = workerTimingStatus(job);

                  const canQuote = ["pending_review", "quote_pending_client"].includes(job.status);
                  const canAssign = job.status === "quote_accepted_ready_for_dispatch" && !["accepted", "awaiting_release", "released"].includes(job.assignmentStatus);
                  const canMarkDeposit = ["deposit_pending"].includes(paymentStatus);
                  const canVerifyPayment = paymentStatus === "client_reported_balance_payment";
                  const canRaiseIssue = ["awaiting_admin_clearance", "issue_resolved"].includes(job.status);
                  const canResolveIssue = job.status === "issue_reported";
                  const released = job.status === "completed" || job.assignmentStatus === "released" || !!job.releasedAt;
                  const canFinalizeRelease = ["awaiting_admin_clearance", "issue_resolved"].includes(job.status) && paymentStatus === "client_reported_balance_payment" && !released;
                  const canRelease = ["awaiting_admin_clearance", "issue_resolved"].includes(job.status) && paymentStatus === "paid_in_full" && !released;
                  const mapQuery = getMapQuery(job);
                  const clientWhatsappUrl = getWhatsAppUrl(job.clientUserId?.phone || "");
                  const workerWhatsappUrl = getWhatsAppUrl(job.assignedWorker?.phone || "");
                  const trackingOpen = ["worker_accepted", "worker_en_route", "worker_arrived", "work_in_progress", "awaiting_admin_clearance", "issue_reported", "issue_resolved"].includes(job.status) && !released;

                  const subtitleBits = [
                    cleanText(job.clientUserId?.fullName || "Client"),
                    cleanText(job.location?.estate || ""),
                    cleanText(job.location?.town || "")
                  ].filter((bit) => bit && bit !== "-");

                  return (
                    <div
                      key={job._id}
                      className="glass-subcard"
                      style={{
                        background: "linear-gradient(155deg, rgba(15,23,42,0.99) 0%, rgba(30,41,59,0.95) 46%, rgba(14,116,144,0.16) 100%)",
                        border: "1px solid rgba(125,211,252,0.18)",
                        boxShadow: "0 20px 48px rgba(2,6,23,0.30)",
                        borderRadius: "24px",
                        padding: "24px"
                      }}
                    >
                      <div className="job-head" style={{ alignItems: "flex-start", gap: "12px" }}>
                        <div>
                          <h3 style={{ fontSize: "1.5rem", color: "#f8fafc", marginBottom: "10px", letterSpacing: "0.01em" }}>
                            {cleanText(job.title)}
                          </h3>
                          <p style={{ color: "#dbe7f5", fontSize: "1rem", marginBottom: "18px", lineHeight: 1.7 }}>
                            {subtitleBits.map(cleanText).filter((bit) => bit && bit !== "-").join(` ${String.fromCharCode(8226)} `)}
                          </p>
                        </div>

                        <div className="badge-row">
                          <StatusBadge value={job.status} />
                          <StatusBadge value={job.assignmentStatus} />
                          <StatusBadge value={paymentStatus} />
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                          gap: "18px",
                          marginTop: "10px",
                          marginBottom: "18px"
                        }}
                      >
                        <div className="glass-card section-card" style={{ padding: "16px", background: "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(30,41,59,0.80))" }}>
                          <h4 style={{ marginBottom: "12px", color: "#93c5fd" }}>Client Profile</h4>
                          <FieldRow label="Name" value={cleanText(job.clientUserId?.fullName || "-")} valueColor="#f8fafc" />
                          <FieldRow label="Phone" value={cleanText(job.clientUserId?.phone || "-")} valueColor="#bfdbfe" />
                          <FieldRow label="Address" value={cleanText([job.location?.addressLine, job.location?.estate, job.location?.town, job.location?.county].filter(Boolean).join(", ") || "-")} valueColor="#dbe7f5" />
                          <FieldRow label="Description" value={cleanText(job.description || "-")} valueColor="#e2e8f0" />
                          <FieldRow label="Instructions" value={cleanText(job.instructions || "-")} valueColor="#c7d2fe" />
                          <FieldRow label="Avoid Notes" value={cleanText(job.avoidNotes || "-")} valueColor="#fca5a5" />
                          <FieldRow label="Quote Notes" value={cleanText(job.pricing?.clientQuoteNotes || "-")} valueColor="#fcd34d" />
                        </div>

                        <div className="glass-card section-card" style={{ padding: "16px", background: "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(30,41,59,0.80))" }}>
                          <h4 style={{ marginBottom: "12px", color: "#fdba74" }}>Worker Profile</h4>
                          <FieldRow label="Name" value={cleanText(job.assignedWorker?.fullName || "Not assigned")} valueColor="#f8fafc" />
                          <FieldRow label="Phone" value={cleanText(job.assignedWorker?.phone || "-")} valueColor="#fde68a" />
                          <FieldRow label="Assigned At" value={formatDateTime(job.assignedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Accepted At" value={formatDateTime(job.workerAcceptedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Arrived" value={formatDateTime(job.arrivedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Completed" value={formatDateTime(job.completedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Timing Status" value={timing.label} valueColor={timing.tone} />
                        </div>

                        <div className="glass-card section-card" style={{ padding: "16px", background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(30,41,59,0.80))" }}>
                          <h4 style={{ marginBottom: "12px", color: "#86efac" }}>Finance & Conditions</h4>
                          <FieldRow label="Final Charge" value={formatMoney(finalCharge)} valueColor="#38bdf8" />
                          <FieldRow label="Deposit" value={formatMoney(depositAmount)} valueColor="#fcd34d" />
                          <FieldRow label="Balance" value={formatMoney(balanceAmount)} valueColor={balanceAmount > 0 ? "#fca5a5" : "#4ade80"} />
                          <FieldRow label="Worker Offer" value={formatMoney(workerOffer)} valueColor="#fb923c" />
                          <FieldRow label="Retention" value={formatMoney(retention)} valueColor="#c4b5fd" />
                          <FieldRow label="Gross Margin" value={formatMoney(grossMargin)} valueColor="#4ade80" />
                          <FieldRow label="Preferred Time" value={formatDateTime(job.preferredStartAt)} valueColor="#dbeafe" />
                          <FieldRow label="Must Finish By" value={formatDateTime(job.mustFinishBy)} valueColor="#fda4af" />
                        </div>
                      </div>

                      <div
                        className="glass-card section-card"
                        style={{
                          marginTop: 18,
                          padding: 18,
                          background: "linear-gradient(155deg, rgba(51,65,85,0.72) 0%, rgba(71,85,105,0.54) 100%)",
                          border: "1px solid rgba(148,163,184,0.16)",
                          borderRadius: "20px"
                        }}
                      >
                        <div className="section-head">
                          <div>
                            <h4 style={{ marginBottom: 8, color: "#f8fafc", fontSize: "1.08rem" }}>Job History</h4>
                            <p style={{ color: "#dbe7f5", lineHeight: 1.7 }}>All major progress for this job stays inside this card.</p>
                          </div>
                          <button
                            className="ghost-button"
                            onClick={() => {
                              if (!trackingOpen) {
                                setError("Forbidden for use outside assignment period.");
                                return;
                              }
                              setExpandedMapJobId((current) => (current === job._id ? "" : job._id));
                            }}
                          >
                            {expandedMapJobId === job._id ? "Hide Map" : trackingOpen ? "Open Map" : "Map Locked"}
                          </button>
                        </div>

                        {!trackingOpen ? (
                          <div style={{ marginBottom: "12px", color: "#fca5a5", fontWeight: 700 }}>
                            Map is forbidden outside the valid assignment period.
                          </div>
                        ) : null}

                        {expandedMapJobId === job._id && trackingOpen ? (
                          <div style={{ marginTop: 12, marginBottom: 16 }}>
                            <div style={{ marginBottom: 8, color: "#cbd5e1" }}>
                              Tracking window is intended only during accepted job flow up to worker release.
                            </div>
                            <iframe
                              title={`job-map-${job._id}`}
                              src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                              style={{ width: "100%", height: "280px", border: 0, borderRadius: "16px" }}
                              loading="lazy"
                            />
                          </div>
                        ) : null}

                        <div className="card-stack" style={{ gap: 10 }}>
                          {timeline.length === 0 ? (
                            <p>No timeline yet.</p>
                          ) : (
                            timeline.map((item, index) => (
                              <div
                                key={`${job._id}-timeline-${index}`}
                                style={{
                                  padding: "14px 16px",
                                  borderRadius: "16px",
                                  background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  boxShadow: "0 10px 22px rgba(2,6,23,0.10)"
                                }}
                              >
                                <div style={{ fontWeight: 700 }}>{item.label}</div>
                                <div style={{ color: "#93c5fd", marginTop: 4 }}>{formatDateTime(item.time || item.at || item.createdAt)}</div>
                                <div style={{ color: "#dbe7f5", marginTop: 6 }}>{item.note}</div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {canQuote ? (
                        <div className="form-grid top-gap" style={{ marginTop: 18 }}>
                          <label className="field">
                            <span>Final Client Charge</span>
                            <input
                              type="number"
                              value={quoteDrafts[job._id]?.finalClientChargeAmount || ""}
                              onChange={(e) => handleQuoteDraftChange(job._id, "finalClientChargeAmount", e.target.value)}
                              placeholder="e.g. 2500"
                            />
                          </label>

                          <label className="field">
                            <span>Deposit Percentage</span>
                            <input
                              type="number"
                              value={quoteDrafts[job._id]?.depositPercentage || 30}
                              onChange={(e) => handleQuoteDraftChange(job._id, "depositPercentage", e.target.value)}
                            />
                          </label>

                          <label className="field field-span-2">
                            <span>Quote Notes</span>
                            <textarea
                              rows="3"
                              value={quoteDrafts[job._id]?.adminQuoteNotes || ""}
                              onChange={(e) => handleQuoteDraftChange(job._id, "adminQuoteNotes", e.target.value)}
                              placeholder="Explain pricing basis or special payment instruction"
                            />
                          </label>

                          <button className="primary-button field-span-2" onClick={() => handleSendQuote(job._id)}>
                            Send Final Quote
                          </button>
                        </div>
                      ) : null}

                      <div className="action-row" style={{ marginTop: 16, flexWrap: "wrap" }}>
                        {clientWhatsappUrl ? (
                          <button
                            className="primary-button"
                            style={{ background: CLIENT_BLUE, borderColor: CLIENT_BLUE, color: "#eff6ff" }}
                            onClick={() => window.open(clientWhatsappUrl, "_blank", "noopener,noreferrer")}
                          >
                            WhatsApp Client
                          </button>
                        ) : null}

                        {workerWhatsappUrl ? (
                          <button
                            className="primary-button"
                            style={{ background: WORKER_ORANGE, borderColor: WORKER_ORANGE, color: "#111827" }}
                            onClick={() => window.open(workerWhatsappUrl, "_blank", "noopener,noreferrer")}
                          >
                            WhatsApp Worker
                          </button>
                        ) : null}

                        {canAssign ? (
                          <button className="primary-button" onClick={() => { setSelectedJob(job); setAssignDraft({ workerUserId: "", workerOfferedAmount: String(job?.pricing?.workerOfferedAmount || Math.max(0, Math.round(Number(job?.pricing?.finalClientChargeAmount || 0) * 0.8))), adminQuoteNotes: "", platformRetentionRate: String(job?.pricing?.platformRetentionRate || 20) }); }}>
                            Assign Worker
                          </button>
                        ) : null}

                        {canMarkDeposit ? (
                          <button className="ghost-button" onClick={() => handleMarkDepositPaid(job._id)}>
                            Mark Deposit Paid
                          </button>
                        ) : null}

                        {canVerifyPayment ? (
                          <button className="ghost-button" disabled={actingJobId === job._id} onClick={() => handleVerifyPayment(job._id)}>
                            {actingJobId === job._id ? "Working..." : "Payment Received"}
                          </button>
                        ) : null}

                        {canFinalizeRelease ? (
                          <button className="primary-button" disabled={actingJobId === job._id} onClick={() => handleFinalizeRelease(job)}>
                            {actingJobId === job._id ? "Finalizing..." : "Verify Payment and Release Worker"}
                          </button>
                        ) : null}

                        {canRaiseIssue ? (
                          <button className="ghost-button" onClick={() => setModalState({ type: "raise_issue", open: true, payload: job })}>
                            Issue Raised
                          </button>
                        ) : null}

                        {canResolveIssue ? (
                          <button className="ghost-button" onClick={() => setModalState({ type: "resolve_issue", open: true, payload: job })}>
                            Resolve Issue
                          </button>
                        ) : null}

                        {canRelease ? (
                          <button className="primary-button" disabled={actingJobId === job._id} onClick={() => handleReleaseWorker(job)}>
                            {actingJobId === job._id ? "Releasing..." : "Release Worker"}
                          </button>
                        ) : null}

                        {released ? (
                          <button
                            className="primary-button"
                            disabled
                            style={{
                              background: "linear-gradient(135deg, rgba(74,222,128,0.95) 0%, rgba(16,185,129,0.95) 100%)",
                              border: "1px solid rgba(74,222,128,0.55)",
                              color: "#052e16",
                              cursor: "default"
                            }}
                          >
                            Worker Released
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </>
      ) : null}

      {selectedJob ? (
  <WorkerSelectModal
    jobId={selectedJob?._id || selectedJob}
    onClose={() => setSelectedJob(null)}
    onSelect={(workerId, payload) =>
      handleAssign(workerId, {
        workerOfferedAmount: Number(payload?.workerOfferedAmount || assignDraft.workerOfferedAmount || 0),
        platformRetentionRate: Number(payload?.platformRetentionRate || assignDraft.platformRetentionRate || 20),
        adminQuoteNotes: payload?.adminQuoteNotes || assignDraft.adminQuoteNotes || ""
      })
    }
  />
) : null}

{adminView === "worker_directory" ? (
  <div className="glass-card section-card">
    <h3 style={{ marginBottom: "12px" }}>Worker Directory</h3>
    {visibleWorkerDirectory.length === 0 ? (
      <EmptyState title="No workers found" text="Approved workers will appear here with their audit trail and account actions." />
    ) : (
      <div className="card-stack">
        {visibleWorkerDirectory.map((worker) => {
          const workerStatus = String(worker.currentAccountState || worker.accountStatus || "-").toLowerCase();
          const statusTone = workerStatus === "suspended" ? "#fca5a5" : workerStatus === "deleted" ? "#fda4af" : "#86efac";
          const workerSections = [
            ["Services Offered", Array.isArray(worker.profile?.serviceCategories) ? worker.profile.serviceCategories.map(formatServiceLabel).join(", ") : cleanText(worker.profile?.serviceCategories || "-"), "#93c5fd"],
            ["Home Location", `${cleanText(worker.profile?.homeLocation?.county || "-")} / ${cleanText(worker.profile?.homeLocation?.town || "-")} / ${cleanText(worker.profile?.homeLocation?.estate || "-")}`, "#fdba74", false],
            ["Address", cleanText(worker.profile?.homeLocation?.addressLine || "-"), "#c4b5fd", false],
            ["Personal Details", `Phone: ${cleanText(worker.phone || "-")} | Email: ${cleanText(worker.email || "-")} | Last Login: ${formatDateTime(worker.lastLoginAt)}`, "#60a5fa", false],
            ["Availability & Work Preferences", `Availability: ${formatAvailabilityWindow(worker.profile)} | Work Radius: ${cleanText(worker.profile?.preferredWorkRadiusKm || "-")} KM | Can Bring Supplies: ${String(worker.profile?.canBringOwnSupplies) === "true" || worker.profile?.canBringOwnSupplies === true ? "Yes" : "No / Depends"}`, "#86efac", false],
            ["Submitted Uploads", renderWorkerUploads(worker), "#f9a8d4"],
            ["Audit Trail", `Suspended At: ${formatDateTime(worker.suspendedAt)} | Suspend Reason: ${cleanText(worker.suspendedReason || worker.profile?.suspensionReason || "-")} | Reactivated At: ${formatDateTime(worker.reactivatedAt)} | Reactivation Note: ${cleanText(worker.reactivationNote || "-")} | Deleted At: ${formatDateTime(worker.deletedAt)} | Deletion Reason: ${cleanText(worker.deletionReason || "-")}`, "#22d3ee", false]
          ];

          return (
            <div key={worker._id} className="glass-subcard" style={{ padding: "22px", borderRadius: "22px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "18px",
                  flexWrap: "wrap",
                  alignItems: "flex-start"
                }}
              >
                <div style={{ flex: "1 1 380px", minWidth: "280px" }}>
                  <div style={{ fontSize: "1.28rem", fontWeight: 900, color: "#f8fafc" }}>
                    {cleanText(worker.fullName || "-")}
                  </div>
                  <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(worker.phone || "-")}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(worker.email || "-")}</div>
                </div>

                <div style={{ minWidth: "220px" }}>
                  <div style={{ color: statusTone, fontWeight: 800 }}>Status: {cleanText(worker.currentAccountState || worker.accountStatus || "-")}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "6px" }}>Registered: {formatDateTime(worker.createdAt)}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "6px" }}>Approved: {formatDateTime(worker.applicationSummary?.approvedAt)}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "6px" }}>Last Login: {formatDateTime(worker.lastLoginAt)}</div>
                </div>
              </div>

              <div style={{ marginTop: "18px", display: "grid", gap: "10px" }}>
                {workerSections.map(([label, value, color, isServices]) => (
                  <div
                    key={label}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "16px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.03) 100%)"
                    }}
                  >
                    <div style={{ color, fontWeight: 800, marginBottom: "6px" }}>{label}</div>
                    {isServices ? (
                      <ServiceSummaryBlock services={value} />
                    ) : (
                      <div style={{ color: "#f8fafc", fontWeight: 700, lineHeight: 1.7 }}>{value}</div>
                    )}
                  </div>
                ))}
              </div>

              {renderWorkerApplicationSnapshot(worker)}
              {renderWorkerUploadCards(worker)}

              <div className="action-row" style={{ marginTop: "16px", flexWrap: "wrap" }}>
                <button className="ghost-button" type="button" onClick={() => openAdminModal("suspend_worker", worker)}>
                  Suspend Worker
                </button>
                <button className="ghost-button" type="button" onClick={() => openAdminModal("reactivate_worker", worker)}>
                  Reactivate Worker
                </button>
                {getWhatsAppUrl(worker.phone) ? (
                  <button
                    type="button"
                    className="primary-button"
                    style={{ background: WORKER_ORANGE, borderColor: WORKER_ORANGE, color: "#111827" }}
                    onClick={() => window.open(getWhatsAppUrl(worker.phone), "_blank", "noopener,noreferrer")}
                  >
                    WhatsApp Worker
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
                  onClick={() => openAdminModal("delete_worker", worker)}
                >
                  Delete Account
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
) : null}

      {adminView === "client_directory" ? (
        <div className="glass-card section-card">
          <h3 style={{ marginBottom: "12px" }}>Client Directory</h3>
          {visibleClientDirectory.length === 0 ? (
            <EmptyState title="No clients found" text="Registered clients will appear here." />
          ) : (
            <div className="card-stack">
              {visibleClientDirectory.map((client) => {
                const locationBits = [
                  client.profile?.defaultLocation?.addressLine,
                  client.profile?.defaultLocation?.estate,
                  client.profile?.defaultLocation?.town,
                  client.profile?.defaultLocation?.county
                ].filter(Boolean);

                const locationUrl = locationBits.length
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationBits.join(", "))}`
                  : "";

                return (
                  <div key={client._id} className="glass-subcard" style={{ padding: "20px", borderRadius: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "1.2rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(client.fullName || "-")}</div>
                        <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(client.phone || "-")}</div>
                        <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(client.email || "-")}</div>
                      </div>
                      <div>
                        <div style={{ color: "#86efac", fontWeight: 800 }}>Status: {cleanText(client.currentAccountState || client.accountStatus || "-")}</div>
                        <div style={{ color: "#cbd5e1", marginTop: "6px" }}>Registered: {formatDateTime(client.registrationDate || client.createdAt)}</div>
                        <div style={{ color: "#cbd5e1", marginTop: "6px" }}>Last Login: {formatDateTime(client.lastLoginAt)}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                      <div>
                        <div style={{ color: "#60a5fa", fontWeight: 800, marginBottom: "6px" }}>Location</div>
                        <div style={{ color: "#f8fafc", fontWeight: 700 }}>
                          {cleanText(client.profile?.defaultLocation?.county || "-")} / {cleanText(client.profile?.defaultLocation?.town || "-")} / {cleanText(client.profile?.defaultLocation?.estate || "-")}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#fcd34d", fontWeight: 800, marginBottom: "6px" }}>Address</div>
                        <div style={{ color: "#f8fafc", fontWeight: 700 }}>
                          {cleanText(client.profile?.defaultLocation?.addressLine || "-")}
                        </div>
                      </div>
                    </div>

                  <div className="action-row" style={{ marginTop: "16px", flexWrap: "wrap" }}>
                      {getWhatsAppUrl(client.phone) ? (
                        <button
                          className="primary-button"
                          style={{ background: CLIENT_BLUE, borderColor: CLIENT_BLUE, color: "#eff6ff" }}
                          onClick={() => window.open(getWhatsAppUrl(client.phone), "_blank", "noopener,noreferrer")}
                        >
                          WhatsApp Client
                        </button>
                      ) : null}
                      {locationUrl ? (
                        <button className="ghost-button" onClick={() => window.open(locationUrl, "_blank", "noopener,noreferrer")}>
                          Open Location
                        </button>
                      ) : null}
                      <button
                        className="primary-button"
                        style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openAdminModal("delete_client", client, { reason: "" });
                        }}
                      >
                        Delete Client Account
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {adminView === "suspended_workers" ? (
        <div className="glass-card section-card">
          <h3 style={{ marginBottom: "12px" }}>Suspended Workers</h3>
          {suspendedWorkersList.length === 0 ? (
            <EmptyState title="No suspended workers right now" text="Any worker suspended by admin will appear here together with the suspension reason and reactivation action." />
          ) : (
            <>
            <div className="card-stack">
              {suspendedWorkersList.map((worker) => (
                <div key={worker._id} className="glass-subcard" style={{ padding: "18px 20px", borderRadius: "18px" }}>
                  <div style={{ fontSize: "1.12rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(worker.fullName || "-")}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(worker.phone || "-")}</div>
                  <div style={{ color: "#fecaca", marginTop: "8px", fontWeight: 800 }}>
                    Suspension Reason: {cleanText(worker.suspendedReason || worker.profile?.suspensionReason || "Not recorded")}
                  </div>
                  <div className="action-row" style={{ marginTop: "16px", flexWrap: "wrap" }}>
                    <button className="ghost-button" onClick={() => openAdminModal("reactivate_worker", worker)}>
                      Reactivate Worker
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
          )}
        </div>
      ) : null}

      {adminView === "suspended_clients" ? (
        <div className="glass-card section-card">
          <h3 style={{ marginBottom: "12px" }}>Suspended Clients</h3>
          {suspendedClientsList.length === 0 ? (
            <EmptyState title="No suspended clients right now" text="Suspended client accounts will appear here once admin places any client under suspension." />
          ) : (
            <>
            <div className="card-stack">
              {suspendedClientsList.map((client) => (
                <div key={client._id} className="glass-subcard" style={{ padding: "18px 20px", borderRadius: "18px" }}>
                  <div style={{ fontSize: "1.12rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(client.fullName || "-")}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(client.phone || "-")}</div>
                  <div style={{ color: "#fcd34d", marginTop: "8px", fontWeight: 800 }}>
                    Status: {cleanText(client.currentAccountState || client.accountStatus || "-")}
                  </div>
                </div>
              ))}
            </div>
          </>
          )}
        </div>
      ) : null}

      
{adminView === "deactivated_clients" ? (
  <div className="glass-card section-card" style={{ marginTop: "0" }}>
    <h3 style={{ marginBottom: "12px" }}>Deactivated Clients</h3>
    {deactivatedClientsList.length === 0 ? (
      <EmptyState title="No deactivated clients yet" text="Deleted or deactivated client accounts will appear here with the deletion reason and timestamp." />
    ) : (
      <div className="card-stack">
        {deactivatedClientsList.map((client) => (
          <div key={client._id} className="glass-subcard" style={{ padding: "18px 20px", borderRadius: "18px" }}>
            <div style={{ fontSize: "1.12rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(client.fullName || "-")}</div>
            <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(client.phone || "-")}</div>
            <div style={{ color: "#cbd5e1", marginTop: "8px" }}><strong>Deleted At:</strong> {formatDateTime(client.deletedAt)}</div>
            <div style={{ color: "#fcd34d", marginTop: "8px", fontWeight: 800 }}>
              Reason: {cleanText(client.deletionReason || "-")}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
) : null}

            {adminView === "notification_center" ? (
        <div className="glass-card section-card" style={{ padding: "22px" }}>
          <div className="section-head" style={{ marginBottom: "14px" }}>
            <div>
              <h3 style={{ marginBottom: "8px" }}>Notification Center</h3>
              <p style={{ color: "#cbd5e1", margin: 0 }}>Operational alerts needing admin action.</p>
            </div>
            <button className="ghost-button" onClick={() => setAdminView("dashboard")}>Back to Dashboard</button>
          </div>

          {notificationItems.length === 0 ? (
            <EmptyState title="No notifications right now" text="New admin actions will appear here when attention is required." />
          ) : (
            <div className="card-stack">
              {notificationItems.map((item) => (
                <div
                  key={item.id}
                  className="glass-subcard"
                  style={{
                    padding: "18px",
                    borderRadius: "18px",
                    border: `1px solid ${item.tone}33`,
                    background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: item.tone, fontWeight: 800, marginBottom: "6px" }}>{item.title}</div>
                      <div style={{ color: "#dbe7f5", lineHeight: 1.7 }}>{item.detail}</div>
                    </div>
                    <button className="primary-button" onClick={item.onClick}>{item.actionLabel}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

{adminView === "pending_worker_applications" ? (
        <div className="card-stack">
          <div className="glass-card" style={{ padding: "14px 18px", borderRadius: "18px", minHeight: "unset", height: "auto", flex: "0 0 auto", alignSelf: "start", display: "block" }}>
            <h2 style={{ marginTop: 0, marginBottom: "8px", color: "#f8fafc" }}>Pending Worker Applications</h2>
            <p style={{ margin: 0, color: "#cbd5e1" }}>
              Vet, approve, defer, or mark incomplete using platform-styled modals.
            </p>
          </div>

          {pendingWorkerApplications.length === 0 ? (
            <EmptyState
              title="No pending worker applications"
              text="Fresh worker onboarding requests will appear here. This screen is working even when there are no current applications to review."
            />
          ) : (
            <div className="card-stack">
              {pendingWorkerApplications.map((app) => (
                <div key={app._id} className="glass-subcard" style={{ padding: "22px", borderRadius: "22px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "18px",
                      flexWrap: "wrap",
                      alignItems: "flex-start"
                    }}
                  >
                    <div style={{ flex: "1 1 380px", minWidth: "280px" }}>
                      <div style={{ fontSize: "1.28rem", fontWeight: 900, color: "#f8fafc" }}>
                        {cleanText(app.fullName || "-")}
                      </div>
                      <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(app.phone || "-")}</div>
                      <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(app.email || "-")}</div>
                    </div>

                    <div style={{ minWidth: "220px" }}>
                      <div style={{ color: "#fcd34d", fontWeight: 800 }}>
                        Status: {cleanText(app.status || "-")}
                      </div>
                      <div style={{ color: "#cbd5e1", marginTop: "6px" }}>
                        Applied: {formatDateTime(app.createdAt)}
                      </div>
                      <div style={{ color: "#cbd5e1", marginTop: "6px" }}>
                        Experience: {cleanText(app.yearsOfExperience || 0)} years
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "16px" }}>
                    <ServiceSummaryBlock services={app.serviceCategories} />
                  </div>

                  <div
                    style={{
                      marginTop: "18px",
                      display: "grid",
                      gap: "10px"
                    }}
                  >
                    {[
                      ["Home Location", `${cleanText(app.homeLocation?.county || "-")} / ${cleanText(app.homeLocation?.town || "-")} / ${cleanText(app.homeLocation?.estate || "-")}`, "#fdba74"],
                      ["Address", cleanText(app.homeLocation?.addressLine || "-"), "#c4b5fd"],
                      ["Availability", `Days: ${Array.isArray(app.availableDays) && app.availableDays.length ? app.availableDays.join(", ") : "-"} | Time: ${cleanText(app.availableTimeNotes || "-")}`, "#86efac"],
                      ["Personal Details", `DOB: ${formatDateTime(app.dateOfBirth)} | ID Number: ${cleanText(app.nationalIdNumber || "-")} | Alt Phone: ${cleanText(app.alternatePhone || "-")}`, "#60a5fa"],
                      ["Next of Kin & Emergency", `Kin: ${cleanText(app.nextOfKinName || "-")} (${cleanText(app.nextOfKinRelationship || "-")}) | Kin Phone: ${cleanText(app.nextOfKinPhone || "-")} | Emergency: ${cleanText(app.emergencyContactName || "Neighbor / Friend")} / ${cleanText(app.emergencyContactPhone || "-")}`, "#fca5a5"],
                      ["Work Preferences", `Experience: ${cleanText(app.yearsOfExperience || 0)} years | Work Radius: ${cleanText(app.preferredWorkRadiusKm || "-")} KM | Can Bring Supplies: ${String(app.canBringOwnSupplies) === "true" || app.canBringOwnSupplies === true ? "Yes" : "No / Depends"}`, "#fcd34d"],
                      ["Payment Details", `M-Pesa: ${cleanText(app.mpesaNumber || "-")} | Registered Name: ${cleanText(app.bankAccountName || "-")} | Bank / Account: ${cleanText(app.bankName || app.bankAccountNumber || "-")}`, "#22d3ee"],
                      ["Experience Summary", cleanText(app.experienceSummary || "-"), "#c4b5fd"]
                    ].map(([label, value, color]) => (
                      <div
                        key={label}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "16px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.03) 100%)"
                        }}
                      >
                        <div style={{ color, fontWeight: 800, marginBottom: "6px" }}>{label}</div>
                        <div style={{ color: "#f8fafc", fontWeight: 700, lineHeight: 1.7 }}>{value}</div>
                      </div>
                    ))}
                  </div>


                  {getMissingApplicationDetails(app).length > 0 ? (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px 16px",
                        borderRadius: "16px",
                        border: "1px solid rgba(248,113,113,0.22)",
                        background: "linear-gradient(135deg, rgba(127,29,29,0.18) 0%, rgba(255,255,255,0.03) 100%)"
                      }}
                    >
                      <div style={{ color: "#fca5a5", fontWeight: 900, marginBottom: "10px" }}>
                        Missing / Not Submitted Details
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {getMissingApplicationDetails(app).map((item) => (
                          <span
                            key={item}
                            style={{
                              padding: "8px 12px",
                              borderRadius: "999px",
                              background: "rgba(248,113,113,0.10)",
                              border: "1px solid rgba(248,113,113,0.18)",
                              color: "#fee2e2",
                              fontWeight: 700,
                              fontSize: "0.85rem"
                            }}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px 16px",
                        borderRadius: "16px",
                        border: "1px solid rgba(34,197,94,0.22)",
                        background: "linear-gradient(135deg, rgba(20,83,45,0.18) 0%, rgba(255,255,255,0.03) 100%)",
                        color: "#bbf7d0",
                        fontWeight: 800
                      }}
                    >
                      Application completeness check: all tracked core fields were submitted.
                    </div>
                  )}

                  <div className="action-row" style={{ marginTop: "14px", flexWrap: "wrap" }}>
                    {app.homeLocation?.googlePinUrl ? (
                      <button
                        className="ghost-button"
                        onClick={() => window.open(app.homeLocation.googlePinUrl, "_blank", "noopener,noreferrer")}
                      >
                        Open Home Location URL
                      </button>
                    ) : null}
                  </div>

                  <div
                    style={{
                      marginTop: "16px",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "12px"
                    }}
                  >
                    {[
                      ["Profile Photo", app.profilePhoto],
                      ["ID Front", app.nationalIdFront],
                      ["ID Back", app.nationalIdBack],
                      ["Selfie with ID", app.selfieWithId]
                    ].map(([label, asset]) => (
                      <div
                        key={label}
                        className="glass-subcard"
                        style={{
                          padding: "12px",
                          borderRadius: "16px",
                          background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)",
                          border: "1px solid rgba(255,255,255,0.10)"
                        }}
                      >
                        <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: "8px" }}>{label}</div>
                        {asset?.url ? (
                          <img
                            src={asset.url}
                            alt={label}
                            style={{ width: "100%", height: "180px", objectFit: "cover", borderRadius: "12px", display: "block" }}
                          />
                        ) : (
                          <div style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
                            No preview url stored yet.<br />
                            File: {cleanText(asset?.fileName || "-")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="action-row" style={{ marginTop: "16px", flexWrap: "wrap" }}>
                    <button
                      className="primary-button"
                      style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16" }}
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAdminModal("approve_application", app, { adminReviewNotes: `Welcome to HomeCare. Your application has been approved and your worker access details are ready below.` }); }}
                    >
                      Approve
                    </button>

                    <button
                      className="ghost-button"
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAdminModal("incomplete_application", app, { adminReviewNotes: app?.adminReviewNotes || "Please complete the missing details highlighted below so admin can continue reviewing your application." }); }}
                    >
                      Incomplete Application
                    </button>

                    <button
                      className="ghost-button"
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAdminModal("reject_application", app, { rejectionReason: "" }); }}
                    >
                      Defer / Reject
                    </button>
                  </div>

                  {cleanText(app.adminReviewNotes || "") !== "-" ? (
                    <div style={{ marginTop: "14px", color: "#fcd34d", fontWeight: 700 }}>
                      Latest Review Note: {cleanText(app.adminReviewNotes)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {modalState.open && modalState.type === "delete_client" ? (
        <ModalShell
          title={`Delete ${cleanText(modalState.payload?.fullName || "client")} Account`}
          onClose={resetModal}
        >
          <p style={{ color: "#fecaca", marginBottom: "12px", fontWeight: 700 }}>
            This removes the client from the active directory and marks the account as deleted.
          </p>

          <label className="field">
            <span>Deletion Reason</span>
            <textarea
              rows="4"
              value={modalForm.reason}
              onChange={(e) => setModalForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="State clearly why this client account is being removed"
            />
          </label>

          <div className="action-row" style={{ marginTop: "14px" }}>
            <button
              className="primary-button"
              style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
              onClick={submitDeleteClient}
            >
              Delete Client Account
            </button>
          </div>
        </ModalShell>
      ) : null}

      {modalState.open && modalState.type === "incomplete_application" ? (
        <ModalShell title="Mark Application Incomplete" onClose={resetModal} width={760}>
          <div
            style={{
              marginBottom: "14px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(248,113,113,0.10), rgba(255,255,255,0.03))",
              border: "1px solid rgba(248,113,113,0.18)",
              color: "#fecaca",
              lineHeight: 1.7
            }}
          >
            <strong>Auto-detected missing fields:</strong>{" "}
            {Array.isArray(modalState.payload?.missingFields) && modalState.payload.missingFields.length
              ? modalState.payload.missingFields.join(", ")
              : "No missing fields were auto-detected, but admin can still request corrections."}
          </div>

          <label className="field">
            <span>What exactly is missing?</span>
            <textarea
              rows="4"
              value={modalForm.adminReviewNotes}
              onChange={(e) => setModalForm((prev) => ({ ...prev, adminReviewNotes: e.target.value }))}
              placeholder="Explain clearly what the worker still needs to provide or correct"
            />
          </label>

          <div
            style={{
              marginTop: "14px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(255,255,255,0.03))",
              border: "1px solid rgba(96,165,250,0.16)",
              color: "#dbe7f5",
              lineHeight: 1.7
            }}
          >
            Message preview:<br />
            {buildApplicationIncompleteMessage(modalState.payload, modalForm.adminReviewNotes || "please review your application details")}
          </div>

          <div className="action-row" style={{ marginTop: "16px", flexWrap: "wrap" }}>
            <button className="primary-button" onClick={() => submitApplicationReview("needs_more_info")}>
              Save Incomplete Response
            </button>

            <button
              className="ghost-button"
              onClick={() => {
                const app = modalState.payload;
                const msg = buildApplicationIncompleteMessage(app, modalForm.adminReviewNotes || "please review your application details");
                const url = getWhatsAppUrl(app?.phone || "", msg);
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              Send via WhatsApp
            </button>

            <button
              className="ghost-button"
              onClick={() => {
                const app = modalState.payload;
                const subject = encodeURIComponent("HomeCare Worker Application - Incomplete Details");
                const body = encodeURIComponent(buildApplicationIncompleteMessage(app, modalForm.adminReviewNotes || "please review your application details"));
                window.open(getGmailComposeUrl(app?.email || "", subject, body), "_blank", "noopener,noreferrer");
              }}
            >
              Send via Email
            </button>
          </div>
        </ModalShell>
      ) : null}

      {modalState.open && modalState.type === "reject_application" ? (
        <ModalShell title="Defer / Reject Application" onClose={resetModal}>
          <label className="field">
            <span>Rejection / defer reason</span>
            <textarea
              rows="4"
              value={modalForm.rejectionReason}
              onChange={(e) => setModalForm((prev) => ({ ...prev, rejectionReason: e.target.value }))}
              placeholder="Explain why this application is being rejected or deferred"
            />
          </label>
          <div className="action-row" style={{ marginTop: "14px" }}>
            <button className="primary-button" style={{ background: DANGER_RED, borderColor: DANGER_RED }} onClick={() => submitApplicationReview("rejected")}>
              Reject Application
            </button>
          </div>
        </ModalShell>
      ) : null}

      
      {modalState.open && modalState.type === "unlock_activities" ? (
        <ModalShell title="Unlock Activities Today" onClose={resetModal}>
          <p style={{ color: "#cbd5e1", marginBottom: "14px", lineHeight: 1.7 }}>
            Enter admin password to open protected same-day business analytics.
          </p>

          <label className="field">
            <span>Admin Password</span>
            <input
              type="password"
              value={modalForm.password}
              onChange={(e) => setModalForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Enter admin password"
            />
          </label>

          <div className="action-row" style={{ marginTop: "14px" }}>
            <button className="primary-button" onClick={submitActivitiesUnlock}>
              Unlock Activities
            </button>
          </div>
        </ModalShell>
      ) : null}


      {modalState.open && modalState.type === "suspend_worker" ? (
        <ModalShell title={`Suspend ${cleanText(modalState.payload?.fullName || "worker")}`} onClose={resetModal}>
          <p style={{ color: "#fecaca", marginBottom: "12px", fontWeight: 700 }}>
            State clearly why this worker is being suspended.
          </p>

          <label className="field">
            <span>Suspension Reason</span>
            <textarea
              rows="4"
              value={modalForm.reason}
              onChange={(e) => setModalForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Enter suspension reason"
            />
          </label>

          <div className="action-row" style={{ marginTop: "14px" }}>
            <button
              className="primary-button"
              style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
              onClick={submitSuspendWorker}
            >
              Suspend Worker
            </button>
          </div>
        </ModalShell>
      ) : null}


      {modalState.open && modalState.type === "reactivate_worker" ? (
        <ModalShell title={`Reactivate ${cleanText(modalState.payload?.fullName || "worker")}`} onClose={resetModal}>
          <label className="field">
            <span>Resolution Note</span>
            <textarea
              rows="4"
              value={modalForm.resolutionNote}
              onChange={(e) => setModalForm((prev) => ({ ...prev, resolutionNote: e.target.value }))}
              placeholder="Optional note on why the account is being reactivated"
            />
          </label>

          <div className="action-row" style={{ marginTop: "14px" }}>
            <button
              className="primary-button"
              style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16" }}
              onClick={submitReactivateWorker}
            >
              Reactivate Worker
            </button>
          </div>
        </ModalShell>
      ) : null}


      {modalState.open && modalState.type === "delete_worker" ? (
        <ModalShell title={`Delete ${cleanText(modalState.payload?.fullName || "worker")} Account`} onClose={resetModal}>
          <p style={{ color: "#fecaca", marginBottom: "12px", fontWeight: 700 }}>
            This removes the worker from the active directory and blocks access completely.
          </p>

          <label className="field">
            <span>Deletion Reason</span>
            <textarea
              rows="4"
              value={modalForm.reason}
              onChange={(e) => setModalForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="State why this worker account is being permanently removed"
            />
          </label>

          <div className="action-row" style={{ marginTop: "14px" }}>
            <button
              className="primary-button"
              style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
              onClick={submitDeleteWorker}
            >
              Delete Worker Account
            </button>
          </div>
        </ModalShell>
      ) : null}


      {modalState.open && modalState.type === "approve_application" ? (
        <ModalShell title={`Approve ${cleanText(modalState.payload?.fullName || "worker application")}`} onClose={resetModal} width={760}>
          <label className="field">
            <span>Admin Welcome / Onboarding Notes</span>
            <textarea
              rows="4"
              value={modalForm.adminReviewNotes}
              onChange={(e) => setModalForm((prev) => ({ ...prev, adminReviewNotes: e.target.value }))}
              placeholder="Friendly onboarding note from admin"
            />
          </label>

          <div
            style={{
              marginTop: "14px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(255,255,255,0.03))",
              border: "1px solid rgba(34,197,94,0.18)",
              color: "#dcfce7",
              lineHeight: 1.7
            }}
          >
            On approval the system will generate a fresh password, create the worker account, and open the approval result card with WhatsApp and Email onboarding options.
          </div>

          <div className="action-row" style={{ marginTop: "16px" }}>
            <button
              className="primary-button"
              style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16" }}
              onClick={() => submitApplicationReview("approved")}
            >
              Approve Application
            </button>
          </div>
        </ModalShell>
      ) : null}


      
{approvalResult ? (
  <ModalShell title="Worker Approved Successfully" onClose={closeApprovalResult} width={820}>
    <div style={{ color: "#dbe7f5", lineHeight: 1.8 }}>
      <div style={{ marginBottom: "10px" }}>
        Review the generated credentials below, then send them to the worker before closing this card.
      </div>
      <FieldRow label="Worker" value={cleanText(approvalResult.workerUser?.fullName || approvalResult.application?.fullName || "-")} />
      <FieldRow label="Phone" value={cleanText(approvalResult.workerUser?.phone || approvalResult.application?.phone || "-")} />
      <FieldRow label="Email" value={cleanText(approvalResult.application?.email || approvalResult.workerUser?.email || "-")} />
      <FieldRow label="Password" value={cleanText(approvalResult.tempPassword || "-")} valueColor="#fcd34d" />
    </div>

    <label className="field" style={{ marginTop: "16px", display: "block" }}>
      <span>Prefilled onboarding message</span>
      <textarea
        rows="8"
        value={approvalMessage}
        onChange={(e) => setApprovalMessage(e.target.value)}
        placeholder="Approval message for the worker"
      />
    </label>

    <div style={{ marginTop: "14px", color: "#cbd5e1", lineHeight: 1.7 }}>
      Admin does not store or retain access to autogenerated passwords. The worker should change this password after first login. If forgotten later, the Forgot Password flow should generate a fresh one.
    </div>

    <div className="action-row" style={{ marginTop: "16px", flexWrap: "wrap" }}>
      <button
        type="button"
        className="primary-button"
        style={{ background: WORKER_ORANGE, borderColor: WORKER_ORANGE, color: "#111827" }}
        onClick={() => {
          const url = getWhatsAppUrl(approvalResult.workerUser?.phone || approvalResult.application?.phone || "", approvalMessage);
          window.open(url, "_blank", "noopener,noreferrer");
        }}
      >
        Send WhatsApp
      </button>

      <button
        type="button"
        className="ghost-button"
        onClick={() => {
          const subject = encodeURIComponent("Welcome to HomeCare - Worker Account Approved");
          const body = encodeURIComponent(approvalMessage);
          window.open(`mailto:${approvalResult.application?.email || approvalResult.workerUser?.email || ""}?subject=${subject}&body=${body}`, "_blank");
        }}
      >
        Send Email
      </button>

      <button type="button" className="ghost-button" onClick={closeApprovalResult}>
        Done - Close Card
      </button>
    </div>
  </ModalShell>
) : null}
    </AppShell>
  );
}




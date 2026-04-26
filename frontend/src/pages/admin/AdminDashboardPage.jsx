function neutralizeAdminAudienceText(value = "") {
  const text = cleanText(value);
  if (text === "-") return text;

  return text
    .replace(/Journey to your location started/gi, "Journey to client location started")
    .replace(/Worker reached your site/gi, "Worker reached client site")
    .replace(/Worker is now committed to your job/gi, "Worker is now committed to the client job")
    .replace(/You accepted the quote/gi, "Client accepted the quote");
}

function getTimelineLabel(item = {}) {
  const type = String(item?.type || "").trim().toLowerCase();
  const rawLabel = item?.label || item?.title || item?.status || "";

  switch (type) {
    case "job_created":
      return "Job created";
    case "admin_sent_final_quote":
      return "Final quote sent";
    case "client_accepted_quote":
      return "Client accepted the quote";
    case "client_deferred_quote":
      return "Client deferred the quote";
    case "deposit_paid":
      return "Deposit recorded";
    case "admin_assigned_worker":
      return "Worker engaged by admin";
    case "worker_accepted_job":
      return "Worker accepted the assignment";
    case "worker_declined_job":
      return "Worker deferred offer";
    case "worker_offer_expired":
      return "Worker offer expired";
    case "worker_left_for_site":
      return "Worker left for site";
    case "worker_arrived":
      return "Worker arrived";
    case "worker_clocked_in":
      return "Worker clocked in";
    case "worker_clocked_out":
      return "Worker completed work on site";
    case "client_submitted_payment_proof":
      return "Client submitted payment proof";
    case "admin_verified_payment":
      return "Admin verified payment";
    case "client_raised_issue":
      return "Client raised issue";
    case "admin_raised_issue":
      return "Admin recorded issue";
    case "admin_resolved_issue":
      return "Admin resolved issue";
    case "worker_released":
      return "Worker released";
    case "worker_paid":
      return "Worker payout recorded";
    default:
      return cleanText(rawLabel || "Timeline update");
  }
}

function getTimelineNote(item = {}) {
  const type = String(item?.type || "").trim().toLowerCase();

  switch (type) {
    case "worker_left_for_site":
      return "Journey to client location started";
    case "worker_arrived":
      return "Worker reached client site";
    case "worker_accepted_job":
      return "Worker is now committed to the client job";
    case "client_accepted_quote":
      return "Admin can now assign a worker";
    default:
      return neutralizeAdminAudienceText(item?.note || "");
  }
}

function getTimeline(job = {}) {
  const directTimeline = Array.isArray(job?.timeline)
    ? job.timeline
    : Array.isArray(job?.history)
      ? job.history
      : Array.isArray(job?.activityLog)
        ? job.activityLog
        : [];

  if (directTimeline.length) {
    return [...directTimeline]
      .map((item) => ({
        ...item,
        label: getTimelineLabel(item),
        note: getTimelineNote(item),
        at: item?.at || item?.time || item?.createdAt || null,
        createdAt: item?.createdAt || item?.at || item?.time || null
      }))
      .sort((a, b) => {
        const aTime = new Date(a?.at || a?.createdAt || 0).getTime();
        const bTime = new Date(b?.at || b?.createdAt || 0).getTime();
        return aTime - bTime;
      });
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
  pushItem("Worker accepted", job?.workerAcceptedAt, "Worker is now committed to the client job");
  pushItem("Arrived at site", job?.arrivedAt, "Worker reached client site");
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
import { useAuth } from "../../contexts/AuthContext";
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
  finalizeWorkerReleaseRequest,
  payWorkerRequest
} from "../../api/jobsApi";
import {
  deleteClientAccountRequest,
  deleteWorkerAccountRequest,
  getClientDirectoryRequest,
  getPendingWorkerApplicationsRequest,
  getWorkerDirectoryRequest,
  reactivateWorkerAccountRequest,
  reactivateClientAccountRequest,
  reviewWorkerApplicationRequest,
  suspendWorkerAccountRequest,
  listAdminAccountsRequest,
  createAdminOperatorRequest,
  resetAdminOperatorPasswordRequest,
  adminResetWorkerPasswordRequest,
  adminResetClientPasswordRequest,
  adminSuspendClientAccountRequest,deactivateAdminOperatorRequest,
  reactivateAdminOperatorRequest
} from "../../api/adminApi";
import { http } from "../../api/http";
import { adminOverrideClientProfileRequest, adminOverrideWorkerProfileRequest } from "../../api/profileApi";

const CLIENT_BLUE = "#3b82f6";
const WORKER_ORANGE = "#f59e0b";
const SUCCESS_GREEN = "#22c55e";
const DANGER_RED = "#ef4444";
const WARNING_AMBER = "#f59e0b";
const ADMIN_PURPLE = "#8b5cf6";

function getLiveIndicatorStyle(isLive = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    alignSelf: "flex-start",
    flex: "0 0 auto",
    whiteSpace: "nowrap",
    gap: "6px",
    padding: "3px 9px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.015em",
    color: isLive ? "#86efac" : "#fca5a5",
    background: isLive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
    border: isLive ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(239,68,68,0.28)"
  };
}

function StatCard({
  label,
  value,
  accent = "#93c5fd",
  badge = "",
  badgeTone = "#93c5fd",
  blink = false,
  hint = "",
  onClick
}) {
  const normalizedBadge = String(badge || "").trim().toLowerCase();
  const isLive = normalizedBadge === "live";
  const isNew = normalizedBadge === "new";
  const isOffline = normalizedBadge === "offline" || normalizedBadge === "none";
  const shouldPulse = blink && (isLive || isNew);
  const clickable = typeof onClick === "function";

  const dotColor = isLive
    ? "#22c55e"
    : isNew
      ? "#ef4444"
      : isOffline
        ? "#ef4444"
        : badgeTone || "#93c5fd";

  const badgeBackground = isLive
    ? "rgba(34,197,94,0.12)"
    : isNew
      ? "rgba(239,68,68,0.12)"
      : isOffline
        ? "rgba(239,68,68,0.10)"
        : "rgba(15,23,42,0.45)";

  const badgeBorder = isLive
    ? "1px solid rgba(34,197,94,0.28)"
    : isNew
      ? "1px solid rgba(239,68,68,0.28)"
      : isOffline
        ? "1px solid rgba(239,68,68,0.20)"
        : "1px solid rgba(148,163,184,0.18)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      style={{
        minHeight: "96px",
        borderRadius: "22px",
        padding: "14px 16px",
        background: "linear-gradient(180deg, rgba(15,23,42,0.82), rgba(15,23,42,0.58))",
        border: "1px solid rgba(148,163,184,0.18)",
        boxShadow: "0 18px 40px rgba(2,6,23,0.28)",
        width: "100%",
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ color: "#e2e8f0", fontWeight: 800, fontSize: "15px", lineHeight: 1.2, maxWidth: "58%" }}>{label}</div>{badge ? (
          <span
            style={{
              display: "inline-flex",
    alignItems: "center",
    alignSelf: "flex-start",
    flex: "0 0 auto",
    whiteSpace: "nowrap",
              gap: "6px",
              padding: "3px 9px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 800,
              color: isOffline ? "#fca5a5" : (badgeTone || "#93c5fd"),
              background: badgeBackground,
              border: badgeBorder,
              letterSpacing: "0.015em",
              animation: shouldPulse ? "adminBlink 1.8s ease-in-out infinite" : "none"
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "999px",
                background: dotColor,
                boxShadow: shouldPulse
                  ? `0 0 0 0 ${dotColor}66`
                  : `0 0 0 4px ${dotColor}22`
              }}
            />
            {badge}
          </span>
        ) : null}</div><div style={{ marginTop: "14px", fontSize: "44px", lineHeight: 1, fontWeight: 900, color: accent }}>
        {value}</div>{hint ? (
        <div style={{ marginTop: "10px", color: "#cbd5e1", fontSize: "11px", lineHeight: 1.45 }}>
          {hint}</div>) : null}
    </button>
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
    .replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ")
    .replace(/ Ã¢â‚¬Â¢ |ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢/g, bullet)
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢/g, "'")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÂ¢Ã¢â€šÂ¬Â|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Â|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Â/g, '"')
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Â/g, "-")
    .replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ")
    .trim() || "-";
}

function cleanDisplayText(value = "") {
  return cleanText(value)
    .replace(/([A-Za-z]{2,})'(?=[A-Za-z]{2,})/g, "$1 ")
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
    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
      {assets.map(([label, asset]) => (
        <div
          key={`${worker?._id || "worker"}-${label}`}
          className="glass-subcard"
          style={{
            padding: "12px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)",
            border: "1px solid rgba(255,255,255,0.10)"
          }}
        >
          <div style={{ color: "#f9a8d4", fontWeight: 800, marginBottom: "8px" }}>{label}</div>{asset?.url ? (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("admin-open-worker-image-preview", {
                      detail: {
                        src: asset.url,
                        label
                      }
                    })
                  );
                }
              }}
              style={{
                padding: 0,
                margin: 0,
                border: "none",
                background: "transparent",
                cursor: "zoom-in",
                width: "100%",
                display: "block"
              }}
            >
              <img
                src={asset.url}
                alt={label}
                style={{ width: "100%", height: "150px", objectFit: "cover", borderRadius: "12px", display: "block" }}
              />
            </button>
          ) : (
            <div style={{ color: "#cbd5e1", lineHeight: 1.55 }}>
              No preview url stored yet.<br />
              File: {cleanText(asset?.fileName || asset?.originalName || "-")}</div>)}</div>))}</div>);
}

function renderWorkerApplicationSnapshot(worker) {
  const app = worker?.applicationRecord;
  if (!app) return null;

  const rows = [
    ["Next of Kin & Emergency", `Kin: ${cleanText(app.nextOfKinName || "-")} (${cleanText(app.nextOfKinRelationship || "-")}) | Kin Phone: ${cleanText(app.nextOfKinPhone || "-")} | Emergency: ${cleanText(app.neighborFriendContact || "-")}`, "#fca5a5"],
["Experience Summary", cleanText(app.experienceSummary || app.workExperience || "No experience summary submitted."), "#c4b5fd"],
    ["Application Notes", `DOB: ${cleanText(app.dateOfBirth || "-")} | National ID: ${cleanText(app.nationalIdNumber || "-")} | Alt Phone: ${cleanText(app.alternatePhone || "-")} | Preferred Days: ${Array.isArray(app.availableDays) ? app.availableDays.map(cleanText).join(", ") : cleanText(app.availableDays || "-")}`, "#93c5fd"]
  ];

  return (
    <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
      {rows.map(([label, value, tone]) => (
        <div key={`${worker?._id || "worker"}-${label}`} style={{ padding: "14px 16px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.10)", background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(15,23,42,0.08) 100%)" }}>
          <div style={{ color: tone, fontWeight: 800, marginBottom: "6px" }}>{label}</div><div style={{ color: "#f8fafc", lineHeight: 1.7 }}>{value}</div></div>))}</div>);
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
  const recoveryKey = payload?.recoveryKey || "-";

  return `Hello ${workerName},

Congratulations. Your HomeCare worker account has been approved.${adminNote ? `

Admin note: ${adminNote}` : ""}

Login details:
Phone: ${phone}
Email: ${email}
Password: ${password}
Recovery Key: ${recoveryKey}

Please sign in and change this password after your first login. Admin does not store autogenerated passwords. If you forget your password later, use the Forgot Password flow so the system generates a fresh one.`;
}


function renderUploadLine(label, file) {
  const fileName = cleanText(file?.fileName || file?.originalName || file?.name || "-");
  const url = file?.url || file?.secureUrl || "";
  if (!url) return `${label}: ${fileName}`;
  return `${label}: ${fileName} | ${url}`;
}

function isAdminOperatorActive(admin = {}) {
  const explicit = admin?.isActive;
  const accountState = String(admin?.currentAccountState || admin?.accountStatus || "").trim().toLowerCase();

  if (["deactivated", "deleted", "inactive", "suspended"].includes(accountState)) {
    return false;
  }

  if (typeof explicit === "boolean") {
    return explicit;
  }

  const explicitText = String(explicit ?? "").trim().toLowerCase();
  return !["false", "0", "no", "inactive", "deactivated", "deleted"].includes(explicitText);
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
    <div className="glass-card section-card" style={{ padding: "14px 16px", textAlign: "center" }}>
      <div style={{ color: "#e2e8f0", fontWeight: 800, fontSize: "1rem" }}>{label}</div></div>);
}


function EmptyState({ title = "Nothing here yet", text = "Once records are available they will appear here without needing a page refresh." }) {
  return (
    <div
      className="glass-subcard admin-compact-empty"
      style={{
        padding: "14px 16px",
        borderRadius: "14px",
        border: "1px dashed rgba(255,255,255,0.16)",
        background: "linear-gradient(135deg, rgba(255,255,255,0.035) 0%, rgba(148,163,184,0.028) 100%)"
      }}
    >
      <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: "1rem", marginBottom: "6px" }}>{title}</div><div style={{ color: "#cbd5e1", lineHeight: 1.55 }}>{text}</div></div>);
}


function FieldRow({ label, value, valueColor = "#f8fafc" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "10px", alignItems: "start", marginBottom: "8px" }}>
      <div style={{ color: "#94a3b8", fontWeight: 700 }}>{label}</div><div style={{ color: valueColor, lineHeight: 1.65, wordBreak: "break-word" }}>{value || "-"}</div></div>);
}

function normalizeSearchValue(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function itemMatchesSearch(item, fields, query) {
  const needle = normalizeSearchValue(query);
  if (!needle) return true;
  return fields.some((field) => normalizeSearchValue(typeof field === "function" ? field(item) : field).includes(needle));
}

function getAdminSearchPlaceholder(adminView) {
  switch (adminView) {
    case "dashboard":
      return "Search job title, job ID, client, worker, phone, status, estate, town, or county";
    case "worker_directory":
      return "Search worker name, phone, email, service, estate, town, or county";
    case "client_directory":
      return "Search client name, phone, email, address, estate, town, or county";
    case "suspended_workers":
      return "Search suspended worker, reason, phone, email, estate, town, or county";
    case "suspended_clients":
      return "Search suspended client, reason, phone, email, address, estate, town, or county";
    case "deactivated_workers":
      return "Search deactivated worker, phone, email, reason, or account state";
    case "deactivated_clients":
      return "Search deactivated client, phone, email, reason, or account state";
    case "notification_center":
      return "Search notification title, detail, or action";
    case "pending_worker_applications":
      return "Search applicant name, phone, email, service, estate, town, or county";
    default:
      return "Search records";
  }
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
        style={{ width: "100%", maxWidth: `${width}px`, padding: "14px 16px", borderRadius: "22px", maxHeight: "88vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, color: "#f8fafc" }}>{title}</h3>
          <button className="ghost-button admin-action-button" onClick={onClose}>Close</button></div>{children}</div></div>);
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {list.map((service, index) => (
        <span
          key={`${service}-${index}`}
          style={{
            display: "inline-flex",
    alignItems: "center",
    alignSelf: "flex-start",
    flex: "0 0 auto",
    whiteSpace: "nowrap",
            padding: "6px 10px",
            borderRadius: "999px",
            background: "rgba(59,130,246,0.10)",
            border: "1px solid rgba(96,165,250,0.22)",
            color: "#dbeafe",
            fontWeight: 700,
            fontSize: "11px"
          }}
        >
          {cleanText(service)}
        </span>
      ))}</div>);
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

  const formatDateLabel = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const datePart = date.toLocaleDateString("en-KE", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    const timePart = date.toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `${datePart} at ${timePart}`;
  };

  const formatClockLabel = (value) => {
    const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
    if (!match) return "";
    const date = new Date();
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const nextSwitchAt = availability?.nextSwitchAt || availability?.availableAt || availability?.unavailableAt || "";
  const nextSwitchLabel = formatDateLabel(nextSwitchAt);
  const availableAtLabel = formatDateLabel(availability?.availableAt || "");
  const unavailableAtLabel = formatDateLabel(availability?.unavailableAt || "");

  if (availability?.repeatDaily) {
    const unavailableTime = formatClockLabel(availability?.unavailableFromTime) || availability?.unavailableFromTime || "-";
    const availableTime = formatClockLabel(availability?.availableFromTime) || availability?.availableFromTime || "-";

    if (status === "unavailable") {
      return nextSwitchLabel
        ? `Daily schedule: Unavailable now, available ${nextSwitchLabel}`
        : `Daily schedule: Unavailable now, available from ${availableTime}`;
    }

    if (status === "available") {
      return nextSwitchLabel
        ? `Daily schedule: Available now, unavailable ${nextSwitchLabel}`
        : `Daily schedule: Available now, unavailable from ${unavailableTime}`;
    }

    return `Daily schedule: available from ${availableTime}, unavailable from ${unavailableTime}`;
  }

  if (status === "unavailable") {
    return availableAtLabel || nextSwitchLabel ? `Unavailable until ${availableAtLabel || nextSwitchLabel}` : "Unavailable now";
  }

  if (status === "available") {
    return unavailableAtLabel || availability?.unavailableAt
      ? `Available until ${unavailableAtLabel || nextSwitchLabel}`
      : "Available now";
  }

  return "Availability not set";
}


function getExpectedCompletionAt(job = {}) {
  if (job?.mustBeCompletedBy) {
    const direct = new Date(job.mustBeCompletedBy);
    if (!Number.isNaN(direct.getTime())) return direct;
  }

  if (job?.startedAt && job?.expectedDurationHours) {
    const startedMs = new Date(job.startedAt).getTime();
    if (!Number.isNaN(startedMs)) {
      return new Date(startedMs + Number(job.expectedDurationHours || 0) * 60 * 60 * 1000);
    }
  }

  if (job?.preferredStartAt && job?.expectedDurationHours) {
    const preferredMs = new Date(job.preferredStartAt).getTime();
    if (!Number.isNaN(preferredMs)) {
      return new Date(preferredMs + Number(job.expectedDurationHours || 0) * 60 * 60 * 1000);
    }
  }

  return null;
}


function isWorkerOnlineNow(worker = {}) {
  const presenceSource = worker?.profile?.lastSeenAt || worker?.lastSeenAt || worker?.lastLoginAt || "";
  if (!presenceSource) return false;

  const seenAt = new Date(presenceSource).getTime();
  if (Number.isNaN(seenAt)) return false;

  return Date.now() - seenAt <= 2 * 60 * 1000;
}

function getWorkerAvailabilityState(worker = {}) {
  const status = String(worker?.profile?.availability?.status || "").toLowerCase();
  return ["available", "on", "online", "ready"].includes(status);
}

function getTimingIntelligence(job = {}) {
  const preferredStart = job?.preferredStartAt ? new Date(job.preferredStartAt) : null;
  const assignedAt = job?.assignedAt ? new Date(job.assignedAt) : null;
  const acceptedAt = job?.workerAcceptedAt ? new Date(job.workerAcceptedAt) : null;
  const arrivedAt = job?.arrivedAt ? new Date(job.arrivedAt) : null;
  const startedAt = job?.startedAt ? new Date(job.startedAt) : null;
  const completedAt = job?.completedAt ? new Date(job.completedAt) : null;
  const expectedCompletionAt = getExpectedCompletionAt(job);

  const isValid = (value) => value instanceof Date && !Number.isNaN(value.getTime());

  const evaluateAgainst = (actualDate, targetDate, onTimeLabel, lateLabel, missingLabel = "Pending") => {
    if (!isValid(actualDate) || !isValid(targetDate)) {
      return { label: missingLabel, tone: "#cbd5e1" };
    }

    const diff = actualDate.getTime() - targetDate.getTime();

    if (diff <= 0) {
      return {
        label: diff === 0 ? `${onTimeLabel} (exact time)` : `${onTimeLabel} (${formatTimingDelta(diff)} early)`,
        tone: "#86efac"
      };
    }

    return {
      label: `${lateLabel} by ${formatTimingDelta(diff)}`,
      tone: "#fca5a5"
    };
  };

  const assignedStatus = (() => {
    if (!isValid(assignedAt) || !isValid(preferredStart)) {
      return { label: "Not measurable", tone: "#cbd5e1" };
    }

    const diff = assignedAt.getTime() - preferredStart.getTime();
    if (diff <= 0) {
      return { label: "Assigned before preferred start", tone: "#86efac" };
    }
    return { label: `Assigned late by ${formatTimingDelta(diff)}`, tone: "#fca5a5" };
  })();

  const acceptedStatus = evaluateAgainst(
    acceptedAt,
    preferredStart,
    "Accepted on time",
    "Accepted late",
    "Awaiting worker acceptance"
  );

  const arrivalStatus = evaluateAgainst(
    arrivedAt,
    preferredStart,
    "Reported on time",
    "Reported late",
    "Awaiting worker arrival"
  );

  const startStatus = evaluateAgainst(
    startedAt,
    preferredStart,
    "Started on time",
    "Started late",
    "Awaiting clock-in"
  );

  const finishStatus = (() => {
    if (!isValid(completedAt) || !isValid(expectedCompletionAt)) {
      return { label: "Not yet measurable", tone: "#cbd5e1" };
    }

    const diff = completedAt.getTime() - expectedCompletionAt.getTime();

    if (diff < 0) return { label: `Finished early by ${formatTimingDelta(diff)}`, tone: "#86efac" };
    if (diff === 0) return { label: "Finished exactly on time", tone: "#86efac" };
    return { label: `Finished late by ${formatTimingDelta(diff)}`, tone: "#fca5a5" };
  })();

  const durationStatus = (() => {
    if (!isValid(startedAt) || !isValid(completedAt) || !Number(job?.expectedDurationHours || 0)) {
      return { label: "Not yet measurable", tone: "#cbd5e1" };
    }

    const actualMs = completedAt.getTime() - startedAt.getTime();
    const expectedMs = Number(job.expectedDurationHours || 0) * 60 * 60 * 1000;
    const diff = actualMs - expectedMs;
    const actualLabel = formatTimingDelta(actualMs);
    const expectedLabel = `${Number(job.expectedDurationHours || 0)}h`;

    if (diff < 0) {
      return {
        label: `${actualLabel} actual vs ${expectedLabel} expected (finished earlier)`,
        tone: "#86efac"
      };
    }

    if (diff === 0) {
      return {
        label: `${actualLabel} actual vs ${expectedLabel} expected`,
        tone: "#86efac"
      };
    }

    return {
      label: `${actualLabel} actual vs ${expectedLabel} expected (exceeded by ${formatTimingDelta(diff)})`,
      tone: "#fca5a5"
    };
  })();

  let headline = "No worker movement yet";
  let headlineTone = "#cbd5e1";

  if (job?.releasedAt || job?.assignmentStatus === "released" || job?.status === "completed") {
    headline = "Released";
    headlineTone = "#86efac";
  } else if (job?.status === "issue_reported") {
    headline = "Issue raised after job";
    headlineTone = "#fca5a5";
  } else if (job?.status === "issue_resolved") {
    headline = "Issue resolved - awaiting release";
    headlineTone = "#fcd34d";
  } else if (job?.status === "awaiting_admin_clearance") {
    headline = "Awaiting admin release";
    headlineTone = "#fcd34d";
  } else if (job?.startedAt || job?.status === "work_in_progress") {
    headline = startStatus.label;
    headlineTone = startStatus.tone;
  } else if (job?.arrivedAt || job?.status === "worker_arrived") {
    headline = arrivalStatus.label;
    headlineTone = arrivalStatus.tone;
  } else if (job?.enRouteAt || job?.status === "worker_en_route") {
    headline = "En route to client";
    headlineTone = "#93c5fd";
  } else if (job?.workerAcceptedAt || job?.status === "worker_accepted") {
    headline = acceptedStatus.label;
    headlineTone = acceptedStatus.tone;
  } else if (job?.status === "quote_pending_client") {
    headline = "Waiting for client response";
    headlineTone = "#60a5fa";
  } else if (job?.status === "pending_review") {
    headline = "Waiting for admin quote";
    headlineTone = "#f59e0b";
  } else if (job?.status === "quote_accepted_ready_for_dispatch" && !job?.assignedWorker?.workerUserId) {
    headline = "Waiting for worker assignment";
    headlineTone = "#38bdf8";
  }

  return {
    label: headline,
    tone: headlineTone,
    assignedStatus,
    acceptedStatus,
    arrivalStatus,
    startStatus,
    finishStatus,
    durationStatus,
    preferredStartLabel: isValid(preferredStart) ? formatDateTime(preferredStart) : "-",
    expectedCompletionLabel: isValid(expectedCompletionAt) ? formatDateTime(expectedCompletionAt) : "-"
  };
}

function workerTimingStatus(job = {}) {
  const insight = getTimingIntelligence(job);
  return { label: insight.label, tone: insight.tone };
}

function getExtraTimeAdminSummary(job = {}) {
  const ext = job?.timeExtension || {};
  const requestedMinutes = Number(ext?.requestedMinutes || 0);
  const status = String(ext?.status || "").trim().toLowerCase();

  if (!requestedMinutes || !status || status === "none") {
    return {
      label: "No extra-time request",
      tone: "#cbd5e1",
      requestedBy: "-",
      requestedAt: "-",
      reason: "-",
      clientResponseAt: "-",
      adminVisibility: "No active extension workflow"
    };
  }

  const requestedBy = ext?.requestedByRole || "worker";
  const requestedAt = ext?.requestedAt || null;
  const reason = cleanText(ext?.reason || "-");
  const clientResponseAt = ext?.clientRespondedAt || ext?.respondedAt || null;

  if (status === "pending_client") {
    return {
      label: `Pending client approval (${requestedMinutes} min)`,
      tone: "#fcd34d",
      requestedBy,
      requestedAt: formatDateTime(requestedAt),
      reason,
      clientResponseAt: "-",
      adminVisibility: "Client must approve or decline. Admin should monitor."
    };
  }

  if (status === "approved") {
    return {
      label: `Approved extra time (${requestedMinutes} min)`,
      tone: "#86efac",
      requestedBy,
      requestedAt: formatDateTime(requestedAt),
      reason,
      clientResponseAt: formatDateTime(clientResponseAt),
      adminVisibility: "Approved by client and visible to admin."
    };
  }

  if (status === "declined") {
    return {
      label: `Declined extra time (${requestedMinutes} min)`,
      tone: "#fca5a5",
      requestedBy,
      requestedAt: formatDateTime(requestedAt),
      reason,
      clientResponseAt: formatDateTime(clientResponseAt),
      adminVisibility: "Declined by client. Admin should follow up if work is affected."
    };
  }

  return {
    label: cleanText(status),
    tone: "#cbd5e1",
    requestedBy,
    requestedAt: formatDateTime(requestedAt),
    reason,
    clientResponseAt: formatDateTime(clientResponseAt),
    adminVisibility: "Extension state recorded."
  };
}

function getJobStageSnapshot(job = {}) {
  const status = String(job?.status || "").toLowerCase();
  const assignmentStatus = String(job?.assignmentStatus || "").toLowerCase();
  const paymentStatus = String(job?.payment?.paymentStatus || "").toLowerCase();
  const title = cleanText(job?.title || "Job");
  const clientName = cleanText(job?.clientUserId?.fullName || "Client");
  const workerName = cleanText(job?.assignedWorker?.fullName || "Worker");

  if (["completed", "cancelled", "cancelled_by_client"].includes(status) || assignmentStatus === "released") {
    return null;
  }

  const base = {
    jobId: job?._id || "",
    title,
    clientName,
    workerName,
    updatedAt: job?.updatedAt || job?.createdAt || null
  };

  if (status === "pending_review") {
    return {
      ...base,
      stage: "Waiting for admin quote",
      nextActor: "Admin",
      detail: `Admin should prepare and send the final quote for ${title}.`,
      tone: "#f59e0b"
    };
  }

  if (status === "quote_pending_client") {
    return {
      ...base,
      stage: "Waiting for client response",
      nextActor: "Client",
      detail: `${clientName} should accept or defer the final quote for ${title}.`,
      tone: "#60a5fa"
    };
  }

  if (paymentStatus === "deposit_pending" && status !== "pending_review") {
    return {
      ...base,
      stage: "Waiting for deposit confirmation",
      nextActor: "Admin",
      detail: `Confirm the client deposit so dispatch can proceed cleanly for ${title}.`,
      tone: "#fcd34d"
    };
  }

  if (status === "quote_accepted_ready_for_dispatch") {
    if (assignmentStatus === "reassign_required" || ["declined", "expired"].includes(String(job?.workerOfferStatus || "").toLowerCase())) {
      return {
        ...base,
        stage: "Worker declined - reassign needed",
        nextActor: "Admin",
        detail: `Assign another worker to ${title}.`,
        tone: "#fca5a5"
      };
    }

    if (String(job?.workerOfferStatus || "").toLowerCase() == "pending") {
      return {
        ...base,
        stage: "Waiting for worker response",
        nextActor: "Worker",
        detail: `${workerName} should accept or decline the current job offer for ${title}.`,
        tone: "#93c5fd"
      };
    }

    return {
      ...base,
      stage: "Waiting for worker assignment",
      nextActor: "Admin",
      detail: `Assign a worker to ${title}.`,
      tone: "#38bdf8"
    };
  }

  if (status === "worker_accepted") {
    return {
      ...base,
      stage: "Worker accepted",
      nextActor: "Worker",
      detail: `${workerName} should start the journey to the client location.`,
      tone: "#93c5fd"
    };
  }

  if (status === "worker_en_route") {
    return {
      ...base,
      stage: "Worker en route",
      nextActor: "Worker",
      detail: `${workerName} is travelling to the client location. Admin should monitor turnaround time.`,
      tone: "#93c5fd"
    };
  }

  if (status === "worker_arrived") {
    return {
      ...base,
      stage: "Worker on site",
      nextActor: "Worker",
      detail: `${workerName} should clock in when actual work begins.`,
      tone: "#60a5fa"
    };
  }

  if (status === "work_in_progress") {
    return {
      ...base,
      stage: "Work in progress",
      nextActor: "Worker",
      detail: `${workerName} should complete the job when work ends.`,
      tone: "#22c55e"
    };
  }

  if (status === "awaiting_admin_clearance") {
    if (paymentStatus === "client_reported_balance_payment") {
      return {
        ...base,
        stage: "Awaiting payment verification and release",
        nextActor: "Admin",
        detail: `Verify the client payment proof and release the worker for ${title}.`,
        tone: "#22c55e"
      };
    }

    if (paymentStatus === "paid_in_full") {
      return {
        ...base,
        stage: "Awaiting worker release",
        nextActor: "Admin",
        detail: `Release the worker and close ${title}.`,
        tone: "#fcd34d"
      };
    }

    return {
      ...base,
      stage: "Awaiting client balance proof",
      nextActor: "Client",
      detail: `Client should submit balance payment proof. Admin then verifies and releases the worker for ${title}.`,
      tone: "#fcd34d"
    };
  }

  if (status === "issue_reported") {
    return {
      ...base,
      stage: "Issue raised after job",
      nextActor: "Admin",
      detail: `Review and resolve the reported issue before worker release for ${title}.`,
      tone: "#ef4444"
    };
  }

  if (status === "issue_resolved") {
    if (paymentStatus === "client_reported_balance_payment") {
      return {
        ...base,
        stage: "Issue resolved - verify payment and release",
        nextActor: "Admin",
        detail: `Verify payment proof and release the worker for ${title}.`,
        tone: "#fcd34d"
      };
    }

    if (paymentStatus === "paid_in_full") {
      return {
        ...base,
        stage: "Issue resolved - release worker",
        nextActor: "Admin",
        detail: `Release the worker to close ${title}.`,
        tone: "#fcd34d"
      };
    }

    return {
      ...base,
      stage: "Issue resolved - waiting final release",
      nextActor: "Admin",
      detail: `Complete final release for ${title} once payment is confirmed.`,
      tone: "#fcd34d"
    };
  }

  return {
    ...base,
    stage: formatServiceLabel(status || "active_job"),
    nextActor: "Monitor",
    detail: `Track the current job stage for ${title}.`,
    tone: "#cbd5e1"
  };
}

function getAdminJobRowStage(job = {}) {
  const status = String(job?.status || "").toLowerCase();
  const paymentStatus = String(job?.payment?.paymentStatus || "").toLowerCase();
  const assignmentStatus = String(job?.assignmentStatus || "").toLowerCase();

  if (status === "pending_review") return { label: "Waiting quote", tone: "#f59e0b" };
  if (status === "quote_pending_client") return { label: "Waiting client response", tone: "#60a5fa" };
  if (paymentStatus === "deposit_pending") return { label: "Waiting deposit confirmation", tone: "#fcd34d" };
  if (status === "quote_accepted_ready_for_dispatch" && ["declined", "expired"].includes(String(job?.workerOfferStatus || "").toLowerCase())) {
    return { label: "Reassign worker", tone: "#fca5a5" };
  }
  if (status === "quote_accepted_ready_for_dispatch" && String(job?.workerOfferStatus || "").toLowerCase() === "pending") {
    return { label: "Waiting worker response", tone: "#93c5fd" };
  }
  if (status === "quote_accepted_ready_for_dispatch") return { label: "Ready for dispatch", tone: "#38bdf8" };
  if (status === "worker_accepted") return { label: "Worker accepted", tone: "#93c5fd" };
  if (status === "worker_en_route") return { label: "En route", tone: "#93c5fd" };
  if (status === "worker_arrived") return { label: "Worker arrived", tone: "#60a5fa" };
  if (status === "work_in_progress") return { label: "Work in progress", tone: "#22c55e" };
  if (status === "awaiting_admin_clearance" && paymentStatus === "client_reported_balance_payment") {
    return { label: "Verify payment and release", tone: "#22c55e" };
  }
  if (status === "awaiting_admin_clearance" && paymentStatus === "paid_in_full") {
    return { label: "Release worker", tone: "#fcd34d" };
  }
  if (status === "awaiting_admin_clearance") return { label: "Waiting client payment proof", tone: "#fcd34d" };
  if (status === "issue_reported") return { label: "Issue raised", tone: "#ef4444" };
  if (status === "issue_resolved" && paymentStatus === "paid_in_full") return { label: "Resolved - release worker", tone: "#fcd34d" };
  if (status === "issue_resolved") return { label: "Resolved - final admin action", tone: "#fcd34d" };
  if (status === "completed" || assignmentStatus === "released") return { label: "Completed", tone: "#86efac" };
  return { label: formatServiceLabel(status || "job"), tone: "#cbd5e1" };
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
  const [showPayWorkerModal, setShowPayWorkerModal] = useState(false);
  const [payWorkerJob, setPayWorkerJob] = useState(null);
  const [payWorkerForm, setPayWorkerForm] = useState({
    amount: "",
    mpesaMessage: "",
    note: ""
  });
  const [workerDirectory, setWorkerDirectory] = useState([]);
  const [clientDirectory, setClientDirectory] = useState([]);
  const [workerApplications, setWorkerApplications] = useState([]);
  const [adminView, setAdminView] = useState("dashboard");
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const [jobFocusFilter, setJobFocusFilter] = useState("all");
  const [expandedAdminJobId, setExpandedAdminJobId] = useState("");
  const [viewSearch, setViewSearch] = useState("");
  const [isRefreshingSection, setIsRefreshingSection] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [passwordChangeForm, setPasswordChangeForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [showPasswordChangeValues, setShowPasswordChangeValues] = useState(false);
  const [passwordChangeResult, setPasswordChangeResult] = useState(null);
  const [adminImagePreview, setAdminImagePreview] = useState({
    open: false,
    src: "",
    label: ""
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("admin-live-ui-style")) return;
    const style = document.createElement("style");
    style.id = "admin-live-ui-style";
    style.innerHTML = `
      .admin-action-button {
        box-shadow: 0 14px 28px rgba(2,6,23,0.18);
      }
      @media (max-width: 768px) {
        .admin-action-stack {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) !important;
        }
        .admin-action-stack > * {
          width: 100% !important;
          min-width: 0 !important;
        }
        .admin-directory-top-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      }
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

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail || {};
      setAdminImagePreview({
        open: Boolean(detail?.src),
        src: String(detail?.src || ""),
        label: String(detail?.label || "Image Preview")
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("admin-open-worker-image-preview", handler);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("admin-open-worker-image-preview", handler);
      }
    };
  }, []);


  const [modalState, setModalState] = useState({
    type: "",
    open: false,
    payload: null
  });

  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminOperatorForm, setAdminOperatorForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    adminPassword: ""
  });
  const [adminOperatorActionForm, setAdminOperatorActionForm] = useState({
    adminPassword: "",
    reason: "",
    note: ""
  });
  const [adminCredentialsResult, setAdminCredentialsResult] = useState(null);
  const [resetAdminPasswordResult, setResetAdminPasswordResult] = useState(null);
  const [workerResetPasswordResult, setWorkerResetPasswordResult] = useState(null);
  const [clientResetPasswordResult, setClientResetPasswordResult] = useState(null);
  const [modalForm, setModalForm] = useState({
    password: "",
    reason: "",
    resolutionNote: "",
    adminReviewNotes: "",
    rejectionReason: ""
  });

  const [overrideForm, setOverrideForm] = useState({
  fullName: "",
  phone: "",
  email: "",
  county: "",
  town: "",
  estate: "",
  addressLine: "",
  houseDetails: "",
  googleMapPinUrl: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  nextOfKinRelationship: "",
  neighborFriendContact: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
  experienceSummary: "",
  nationalIdNumber: "",
  serviceCategories: [],
  yearsOfExperience: "",
  canBringOwnSupplies: "",
  preferredWorkRadiusKm: "",
  mpesaNumber: "",
  mpesaRegisteredName: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankAccountDetails: "",
  adminNotes: ""
});
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const [activitiesUnlocked, setActivitiesUnlocked] = useState(false);
  const [superAdminPanelUnlocked, setSuperAdminPanelUnlocked] = useState(false);
  const [approvalResult, setApprovalResult] = useState(null);
  const [approvalMessage, setApprovalMessage] = useState("");

  
  const resetAdminOperatorForms = () => {
    setAdminOperatorForm({
      fullName: "",
      phone: "",
      email: "",
      adminPassword: ""
    });
    setAdminOperatorActionForm({
      adminPassword: "",
      reason: "",
      note: ""
    });
  };

const resetModal = () => {
    resetAdminOperatorForms();
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

  const loadAdminAccounts = async () => {
    try {
      const response = await listAdminAccountsRequest();
      const payload = response?.data;
      const admins =
        Array.isArray(payload) ? payload :
        Array.isArray(payload?.admins) ? payload.admins :
        Array.isArray(payload?.data) ? payload.data :
        Array.isArray(payload?.users) ? payload.users :
        [];
      setAdminAccounts(admins);
    } catch (_err) {
      setAdminAccounts([]);
    }
  };

  const load = async ({ silent = false } = {}) => {
    try {
      setError("");

      if (!silent) {
        setIsRefreshingSection(true);
      }
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
      await loadAdminAccounts();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load admin dashboard.");
    } finally {
      setIsLoading(false);
      setIsRefreshingSection(false);
    }
  };

  useEffect(() => {
    load();

    const intervalId = window.setInterval(() => {
      load({ silent: true });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const refreshWorkerDirectory = async () => {
      try {
        const workersRes = await getWorkerDirectoryRequest();
        setWorkerDirectory(Array.isArray(workersRes.data) ? workersRes.data : []);
      } catch (_err) {
        // Keep existing admin screen stable during silent polling failures.
      }
    };

    const intervalId = window.setInterval(refreshWorkerDirectory, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const refreshCurrentView = async () => {
    await load();
  };

  useEffect(() => {
    setError("");

    setSuccess("");
    setViewSearch("");
  }, [adminView]);

  useEffect(() => {
    if (!expandedAdminJobId) return;

    const filteredJobs = (() => {
      if (jobFocusFilter === "live") {
        return jobs.filter((job) =>
          ["worker_accepted", "worker_en_route", "worker_arrived", "work_in_progress", "awaiting_admin_clearance", "issue_reported", "issue_resolved"].includes(job.status)
        );
      }

      if (jobFocusFilter === "awaiting_release") {
        return jobs.filter((job) => ["awaiting_admin_clearance", "issue_resolved"].includes(job.status));
      }

      if (jobFocusFilter === "pending_review") {
        return jobs.filter((job) => job.status === "pending_review");
      }

      if (jobFocusFilter === "quote_pending_client") {
        return jobs.filter((job) => job.status === "quote_pending_client");
      }

      if (jobFocusFilter === "ready_for_dispatch") {
        return jobs.filter((job) => job.status === "quote_accepted_ready_for_dispatch");
      }

      if (jobFocusFilter === "worker_reply_needed") {
        return jobs.filter((job) =>
          job.assignmentStatus === "reassign_required" ||
          ["declined", "expired"].includes(String(job.workerOfferStatus || "").toLowerCase())
        );
      }

      if (jobFocusFilter === "issue_reported") {
        return jobs.filter((job) => job.status === "issue_reported");
      }

      if (jobFocusFilter === "awaiting_payment_verification") {
        return jobs.filter((job) => job.payment?.paymentStatus === "client_reported_balance_payment");
      }

      return jobs;
    })();

    const stillVisible = filteredJobs.some((job) => job._id === expandedAdminJobId);
    if (!stillVisible) {
      setExpandedAdminJobId("");
    }
  }, [jobs, jobFocusFilter, expandedAdminJobId]);

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

  const openPayWorkerModal = (job) => {
    setError("");

    setSuccess("");
    setPayWorkerJob(job);
    setPayWorkerForm({
      amount: String(
        Number(
          job?.pricing?.workerOfferedAmount ||
          job?.pricing?.workerPayoutAmount ||
          0
        )
      ),
      mpesaMessage: "",
      note: ""
    });
    setShowPayWorkerModal(true);
  };

  const closePayWorkerModal = () => {
    setShowPayWorkerModal(false);
    setPayWorkerJob(null);
    setPayWorkerForm({
      amount: "",
      mpesaMessage: "",
      note: ""
    });
  };

  const submitPayWorker = async () => {
    if (!payWorkerJob?._id) {
      setError("No job selected for payout.");
      return;
    }

    if (!String(payWorkerForm.amount || "").trim() || !String(payWorkerForm.mpesaMessage || "").trim()) {
      setError("Amount and M-Pesa message are required.");
      return;
    }

    setError("");

    setSuccess("");
    setActingJobId(payWorkerJob._id);

    try {
      await payWorkerRequest(payWorkerJob._id, {
        amount: Number(payWorkerForm.amount),
        mpesaMessage: String(payWorkerForm.mpesaMessage).trim(),
        note: String(payWorkerForm.note || "").trim()
      });
      closePayWorkerModal();
      setSuccess("Worker payout recorded successfully.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to record worker payout.");
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

  const resolveProfileTargetUserId = (record) => {
    const raw =
      record?.userId?._id ||
      record?.userId ||
      record?.user?._id ||
      record?.account?._id ||
      record?.linkedUserId ||
      record?.authUserId ||
      record?._id ||
      "";

    if (raw && typeof raw === "object") {
      return String(raw?._id || "").trim();
    }

    return String(raw || "").trim();
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

    if (type === "override_worker_profile") {
  const app = payload?.applicationRecord || {};
  const profile = payload?.profile || {};
  const home = profile?.homeLocation || app?.homeLocation || {};

  setOverrideForm({
    fullName: payload?.fullName || "",
    phone: payload?.phone || "",
    email: payload?.email || "",
    county: home?.county || app?.county || "",
    town: home?.town || app?.town || "",
    estate: home?.estate || app?.estate || "",
    addressLine: home?.addressLine || app?.addressLine || "",
    houseDetails: home?.houseDetails || profile?.houseDetails || app?.houseDetails || "",
    googleMapPinUrl: home?.googlePinUrl || app?.homeLocation?.googlePinUrl || app?.googleMapPinUrl || app?.locationPinUrl || "",
    nextOfKinName: profile?.nextOfKinName || app?.nextOfKinName || "",
    nextOfKinPhone: profile?.nextOfKinPhone || app?.nextOfKinPhone || "",
    nextOfKinRelationship: profile?.nextOfKinRelationship || app?.nextOfKinRelationship || "",
    neighborFriendContact: profile?.neighborFriendContact || app?.neighborFriendContact || "",
    emergencyContactName: profile?.emergencyContactName || app?.emergencyContactName || "",
    emergencyContactPhone: profile?.emergencyContactPhone || app?.emergencyContactPhone || "",
    emergencyContactRelationship: profile?.emergencyContactRelationship || app?.emergencyContactRelationship || "",
    experienceSummary: profile?.experienceSummary || app?.experienceSummary || "",
    nationalIdNumber: profile?.nationalIdNumber || app?.nationalIdNumber || "",
    serviceCategories: Array.isArray(profile?.serviceCategories)
      ? profile.serviceCategories
      : (Array.isArray(app?.serviceCategories) ? app.serviceCategories : []),
    yearsOfExperience: String(profile?.yearsOfExperience || app?.yearsOfExperience || ""),
    canBringOwnSupplies:
      profile?.canBringOwnSupplies === true ? "yes" :
      profile?.canBringOwnSupplies === false ? "no" :
      String(app?.canBringOwnSupplies || "").toLowerCase(),
    preferredWorkRadiusKm: String(profile?.preferredWorkRadiusKm || app?.preferredWorkRadiusKm || ""),
    mpesaNumber: profile?.mpesaNumber || app?.mpesaNumber || "",
    mpesaRegisteredName: profile?.mpesaRegisteredName || app?.mpesaRegisteredName || "",
    bankName: profile?.bankName || app?.bankName || "",
    bankAccountName: profile?.bankAccountName || app?.bankAccountName || "",
    bankAccountNumber: profile?.bankAccountNumber || app?.bankAccountNumber || "",
    bankAccountDetails: profile?.bankAccountDetails || app?.bankAccountDetails || "",
    adminNotes: ""
  });
} else if (type === "override_client_profile") {
      const location = payload?.profile?.defaultLocation || {};

      setOverrideForm({
        fullName: payload?.fullName || "",
        phone: payload?.phone || "",
        email: payload?.email || "",
        county: location?.county || "",
        town: location?.town || "",
        estate: location?.estate || "",
        addressLine: location?.addressLine || "",
        houseDetails: location?.houseDetails || payload?.profile?.houseDetails || "",
        googleMapPinUrl: location?.googlePinUrl || payload?.profile?.googlePinUrl || payload?.googlePinUrl || payload?.locationPinUrl || "",
        nextOfKinName: "",
        nextOfKinPhone: "",
        nextOfKinRelationship: "",
        neighborFriendContact: "",
        experienceSummary: "",
        canBringOwnSupplies: "",
        preferredWorkRadiusKm: "",
        mpesaNumber: "",
        mpesaRegisteredName: "",
        bankAccountDetails: "",
        adminNotes: ""
      });
    }

    setModalState({
      type,
      open: true,
      payload
    });
  };

  const handleOverrideFieldChange = (event) => {
    const { name, value } = event.target;
    setOverrideForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const tryAdminProfileOverrideByCandidates = async (apiFn, target, payload) => {
    const rawCandidates = [
      target?.userId?._id,
      target?.userId,
      target?.user?._id,
      target?.account?._id,
      target?.linkedUserId,
      target?.authUserId,
      target?._id
    ];
    const candidates = [...new Set(rawCandidates.map((value) => {
      if (!value) return "";
      if (typeof value === "object") return String(value?._id || "").trim();
      return String(value).trim();
    }).filter(Boolean))];

    let lastError = null;
    for (const candidate of candidates) {
      try {
        return await apiFn(candidate, payload);
      } catch (err) {
        lastError = err;
        if (err?.response?.status !== 404) {
          throw err;
        }
      }
    }
    throw lastError || new Error("No valid profile target id resolved.");
  };


  const submitCreateAdminOperator = async () => {
    setError("");

    setSuccess("");

    if (!String(adminOperatorForm.fullName || "").trim() || !String(adminOperatorForm.phone || "").trim() || !String(adminOperatorForm.email || "").trim()) {
      setError("Full name, phone, and email are required.");
      return;
    }

    if (!String(adminOperatorForm.adminPassword || "").trim()) {
      setError("Super admin password confirmation is required.");
      return;
    }

    try {
      setIsBusy(true);
      const response = await createAdminOperatorRequest({
        fullName: String(adminOperatorForm.fullName || "").trim(),
        phone: String(adminOperatorForm.phone || "").trim(),
        email: String(adminOperatorForm.email || "").trim(),
        adminPassword: String(adminOperatorForm.adminPassword || "").trim()
      });
      setAdminCredentialsResult(response?.data || null);
      setSuccess("Admin operator created successfully.");
      resetModal();
      await loadAdminAccounts({ silent: false });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create admin operator.");
    } finally {
      setIsBusy(false);
    }
  };

  const submitResetAdminOperatorPassword = async () => {
    const target = modalState.payload;
    if (!target?._id) return;

    setError("");

    setSuccess("");

    if (!String(adminOperatorActionForm.adminPassword || "").trim()) {
      setError("Super admin password confirmation is required.");
      return;
    }

    try {
      setIsBusy(true);
      const response = await resetAdminOperatorPasswordRequest(target._id, {
        adminPassword: String(adminOperatorActionForm.adminPassword || "").trim()
      });
      setResetAdminPasswordResult(response?.data || null);
      setSuccess("Admin password reset successfully.");
      resetModal();
      await loadAdminAccounts({ silent: false });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to reset admin password.");
    } finally {
      setIsBusy(false);
    }
  };

  const submitResetWorkerPassword = async () => {
    const target = modalState.payload;
    if (!target?._id) return;

    setError("");
    setSuccess("");

    if (!String(adminOperatorActionForm.adminPassword || "").trim()) {
      setError("Admin password confirmation is required.");
      return;
    }

    try {
      setIsBusy(true);

      const response = await adminResetWorkerPasswordRequest(target._id, {
        adminPassword: String(adminOperatorActionForm.adminPassword || "").trim()
      });

      const payload = response?.data?.data || response?.data || {};

      setWorkerResetPasswordResult({
        workerName: cleanText(payload?.fullName || target?.fullName || "Worker"),
        phone: cleanText(payload?.phone || target?.phone || "-"),
        email: cleanText(payload?.email || target?.email || "-"),
        temporaryPassword: String(payload?.temporaryPassword || payload?.tempPassword || "")
      });

      setSuccess("Worker password reset successfully.");
      resetModal();
      await load({ silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to reset worker password.");
    } finally {
      setIsBusy(false);
    }
  };
  const submitDeactivateAdminOperator = async () => {
    const target = modalState.payload;
    if (!target?._id) return;

    setError("");

    setSuccess("");

    if (!String(adminOperatorActionForm.reason || "").trim()) {
      setError("Deactivation reason is required.");
      return;
    }

    if (!String(adminOperatorActionForm.adminPassword || "").trim()) {
      setError("Super admin password confirmation is required.");
      return;
    }

    try {
      setIsBusy(true);
      await deactivateAdminOperatorRequest(target._id, {
        reason: String(adminOperatorActionForm.reason || "").trim(),
        adminPassword: String(adminOperatorActionForm.adminPassword || "").trim()
      });
      setSuccess("Admin account deactivated successfully.");
      resetModal();
      await load({ silent: true });
      await loadAdminAccounts({ silent: false });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to deactivate admin account.");
    } finally {
      setIsBusy(false);
    }
  };

  const submitReactivateAdminOperator = async () => {
    const target = modalState.payload;
    if (!target?._id) return;

    setError("");

    setSuccess("");

    if (!String(adminOperatorActionForm.adminPassword || "").trim()) {
      setError("Super admin password confirmation is required.");
      return;
    }

    try {
      setIsBusy(true);
      await reactivateAdminOperatorRequest(target._id, {
        note: String(adminOperatorActionForm.note || "").trim(),
        adminPassword: String(adminOperatorActionForm.adminPassword || "").trim()
      });
      setSuccess("Admin account reactivated successfully.");
      resetModal();
      await load({ silent: true });
      await loadAdminAccounts({ silent: false });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to reactivate admin account.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveProfileOverride = async () => {
    const target = modalState.payload;
    const targetUserId = resolveProfileTargetUserId(target);
    if (!targetUserId) {
      setError("Could not determine the correct account id for this profile.");
      return;
    }

    setError("");

    setSuccess("");
    setIsSavingOverride(true);
    try {
      if (modalState.type === "override_worker_profile") {
  await tryAdminProfileOverrideByCandidates(adminOverrideWorkerProfileRequest, target, {
    fullName: String(overrideForm.fullName || "").trim(),
    phone: String(overrideForm.phone || "").trim(),
    email: String(overrideForm.email || "").trim(),
    county: String(overrideForm.county || "").trim(),
    town: String(overrideForm.town || "").trim(),
    estate: String(overrideForm.estate || "").trim(),
    addressLine: String(overrideForm.addressLine || "").trim(),
    houseDetails: String(overrideForm.houseDetails || "").trim(),
    googleMapPinUrl: String(overrideForm.googleMapPinUrl || "").trim(),
    googlePinUrl: String(overrideForm.googleMapPinUrl || "").trim(),
    nextOfKinName: String(overrideForm.nextOfKinName || "").trim(),
    nextOfKinPhone: String(overrideForm.nextOfKinPhone || "").trim(),
    nextOfKinRelationship: String(overrideForm.nextOfKinRelationship || "").trim(),
    neighborFriendContact: String(overrideForm.neighborFriendContact || "").trim(),
    emergencyContactName: String(overrideForm.emergencyContactName || "").trim(),
    emergencyContactPhone: String(overrideForm.emergencyContactPhone || "").trim(),
    emergencyContactRelationship: String(overrideForm.emergencyContactRelationship || "").trim(),
    experienceSummary: String(overrideForm.experienceSummary || "").trim(),
    nationalIdNumber: String(overrideForm.nationalIdNumber || "").trim(),
    serviceCategories: Array.isArray(overrideForm.serviceCategories)
      ? overrideForm.serviceCategories
      : String(overrideForm.serviceCategories || "").split(",").map((s) => s.trim()).filter(Boolean),
    yearsOfExperience: Number(overrideForm.yearsOfExperience || 0),
    canBringOwnSupplies: String(overrideForm.canBringOwnSupplies || "").trim(),
    preferredWorkRadiusKm: String(overrideForm.preferredWorkRadiusKm || "").trim(),
    mpesaNumber: String(overrideForm.mpesaNumber || "").trim(),
    mpesaRegisteredName: String(overrideForm.mpesaRegisteredName || "").trim(),
    bankName: String(overrideForm.bankName || "").trim(),
    bankAccountName: String(overrideForm.bankAccountName || "").trim(),
    bankAccountNumber: String(overrideForm.bankAccountNumber || "").trim(),
    bankAccountDetails: String(overrideForm.bankAccountDetails || "").trim(),
    adminNotes: String(overrideForm.adminNotes || "").trim(),
    reason: String(overrideForm.adminNotes || "").trim()
  });
} else if (modalState.type === "override_client_profile") {
        await tryAdminProfileOverrideByCandidates(adminOverrideClientProfileRequest, target, {
          fullName: String(overrideForm.fullName || "").trim(),
          phone: String(overrideForm.phone || "").trim(),
          email: String(overrideForm.email || "").trim(),
          county: String(overrideForm.county || "").trim(),
          town: String(overrideForm.town || "").trim(),
          estate: String(overrideForm.estate || "").trim(),
          addressLine: String(overrideForm.addressLine || "").trim(),
          houseDetails: String(overrideForm.houseDetails || "").trim(),
          googleMapPinUrl: String(overrideForm.googleMapPinUrl || "").trim(),
          googlePinUrl: String(overrideForm.googleMapPinUrl || "").trim(),
          notesForAdmin: String(overrideForm.adminNotes || "").trim(),
          adminNotes: String(overrideForm.adminNotes || "").trim(),
          reason: String(overrideForm.adminNotes || "").trim()
        });
      }

      await load({ silent: true });
      resetModal();
      setSuccess("Profile override saved successfully.");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save profile override.");
    } finally {
      setIsSavingOverride(false);
    }
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

  const submitSuspendClient = async () => {
    const client = modalState.payload;
    if (!client) return;

    const reason = String(modalForm.reason || "").trim();
    if (!reason) {
      setError("Suspension reason is required.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      const response = await adminSuspendClientAccountRequest(client._id, { reason });
      setSuccess(response?.data?.message || response?.message || "Client suspended successfully.");
      resetModal();
      setAdminView("suspended_clients");
      await load({ silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to suspend client.");
    }
  };

  const submitResetClientPassword = async () => {
    const client = modalState.payload;
    if (!client?._id) return;

    const adminPassword = String(adminOperatorActionForm.adminPassword || "").trim();
    if (!adminPassword) {
      setError("Admin password confirmation is required.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      setIsBusy(true);

      const response = await adminResetClientPasswordRequest(client._id, { adminPassword });
      const payload = response?.data?.data || response?.data || {};

      setClientResetPasswordResult({
        clientName: cleanText(payload?.fullName || client?.fullName || "Client"),
        phone: cleanText(payload?.phone || client?.phone || "-"),
        email: cleanText(payload?.email || client?.email || "-"),
        temporaryPassword: String(payload?.temporaryPassword || payload?.tempPassword || "")
      });

      setSuccess("Client password reset successfully.");
      resetModal();
      await load({ silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to reset client password.");
    } finally {
      setIsBusy(false);
    }
  };

  const submitReactivateClient = async () => {
    const client = modalState.payload;
    if (!client) return;

    const resolutionNote = String(modalForm.resolutionNote || "").trim();
    if (!resolutionNote) {
      setError("Reactivation reason is required.");
      return;
    }

    setError("");

    setSuccess("");

    try {
      const response = await reactivateClientAccountRequest(client._id, { resolutionNote });
      setSuccess(response?.message || "Client reactivated successfully.");
      resetModal();
      setAdminView("client_directory");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to reactivate client account.");
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

  const submitSuperAdminPanelUnlock = () => {
    if (!modalForm.password.trim()) {
      setError("Super admin password is required to open this panel.");
      return;
    }

    setError("");
    setSuccess("");
    setSuperAdminPanelUnlocked(true);
    setAdminView("super_admin_management");
    setModalState({ type: "", open: false, payload: null });
    setModalForm({
      password: "",
      reason: "",
      resolutionNote: "",
      adminReviewNotes: "",
      rejectionReason: ""
    });
  };

  const submitMyPasswordChange = async () => {
    const currentPassword = String(passwordChangeForm.currentPassword || "").trim();
    const newPassword = String(passwordChangeForm.newPassword || "").trim();
    const confirmPassword = String(passwordChangeForm.confirmPassword || "").trim();

    setError("");

    setSuccess("");
    setPasswordChangeResult(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Current password, new password, and confirmation are required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      setIsBusy(true);
      const response = await http.patch("/api/auth/change-password", {
        currentPassword,
        newPassword
      });

      const successMessage = response?.data?.message || "Password updated successfully.";
      setSuccess(successMessage);
      setPasswordChangeResult({
        type: "success",
        message: successMessage
      });
      setPasswordChangeForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
    } catch (err) {
      const failMessage = err?.response?.data?.message || "Failed to change password.";
      setError(failMessage);
      setPasswordChangeResult({
        type: "error",
        message: failMessage
      });
    } finally {
      setIsBusy(false);
    }
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
        recoveryKey: payload.recoveryKey,
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
      isWorkerOnlineNow(worker)
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

    const deactivatedWorkers = deletedUsers.filter((user) =>
      String(user?.role || "").toLowerCase() === "worker"
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
      deactivatedWorkers,
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

  const deactivatedWorkersList = deletedUsers.filter((user) =>
    String(user?.role || "").toLowerCase() === "worker"
  );

  const deactivatedClientsList = deletedUsers.filter((user) =>
    String(user?.role || "").toLowerCase() === "client"
  );

  const pendingWorkerApplications = workerApplications.filter((app) =>
    ["pending", "needs_more_info"].includes(String(app.status || "").toLowerCase())
  );

  const visibleWorkerDirectory = useMemo(() => {
    const base = directoryFilter !== "live_workers"
      ? workerDirectory
      : workerDirectory.filter((worker) =>
          isWorkerOnlineNow(worker)
        );

    return base.filter((worker) => itemMatchesSearch(worker, [
      (entry) => entry?.fullName,
      (entry) => entry?.phone,
      (entry) => entry?.email,
      (entry) => entry?.profile?.homeLocation?.county,
      (entry) => entry?.profile?.homeLocation?.town,
      (entry) => entry?.profile?.homeLocation?.estate,
      (entry) => Array.isArray(entry?.profile?.serviceCategories) ? entry.profile.serviceCategories.join(" ") : entry?.profile?.serviceCategories
    ], viewSearch));
  }, [directoryFilter, workerDirectory, viewSearch]);

  const visibleClientDirectory = useMemo(() => {
    const base = directoryFilter !== "live_clients"
      ? clientDirectory
      : clientDirectory.filter((client) =>
          String(client?.currentAccountState || client?.accountStatus || "").toLowerCase() === "active"
        );

    return base.filter((client) => itemMatchesSearch(client, [
      (entry) => entry?.fullName,
      (entry) => entry?.phone,
      (entry) => entry?.email,
      (entry) => entry?.profile?.defaultLocation?.county,
      (entry) => entry?.profile?.defaultLocation?.town,
      (entry) => entry?.profile?.defaultLocation?.estate,
      (entry) => entry?.profile?.defaultLocation?.addressLine
    ], viewSearch));
  }, [directoryFilter, clientDirectory, viewSearch]);

  const visibleSuspendedWorkersList = useMemo(() => suspendedWorkersList.filter((worker) => itemMatchesSearch(worker, [
    (entry) => entry?.fullName,
    (entry) => entry?.phone,
    (entry) => entry?.email,
    (entry) => entry?.suspendedReason,
    (entry) => entry?.profile?.suspensionReason,
    (entry) => entry?.profile?.homeLocation?.county,
    (entry) => entry?.profile?.homeLocation?.town,
    (entry) => entry?.profile?.homeLocation?.estate
  ], viewSearch)), [suspendedWorkersList, viewSearch]);

  const visibleSuspendedClientsList = useMemo(() => suspendedClientsList.filter((client) => itemMatchesSearch(client, [
    (entry) => entry?.fullName,
    (entry) => entry?.phone,
    (entry) => entry?.email,
    (entry) => entry?.suspendedReason,
    (entry) => entry?.profile?.defaultLocation?.county,
    (entry) => entry?.profile?.defaultLocation?.town,
    (entry) => entry?.profile?.defaultLocation?.estate,
    (entry) => entry?.profile?.defaultLocation?.addressLine
  ], viewSearch)), [suspendedClientsList, viewSearch]);

  const visibleDeactivatedWorkersList = useMemo(() => deactivatedWorkersList.filter((worker) => itemMatchesSearch(worker, [
    (entry) => entry?.fullName,
    (entry) => entry?.phone,
    (entry) => entry?.email,
    (entry) => entry?.deletionReason,
    (entry) => entry?.accountStatus
  ], viewSearch)), [deactivatedWorkersList, viewSearch]);

  const visibleDeactivatedClientsList = useMemo(() => deactivatedClientsList.filter((client) => itemMatchesSearch(client, [
    (entry) => entry?.fullName,
    (entry) => entry?.phone,
    (entry) => entry?.email,
    (entry) => entry?.deletionReason,
    (entry) => entry?.accountStatus
  ], viewSearch)), [deactivatedClientsList, viewSearch]);

  const visiblePendingWorkerApplications = useMemo(() => pendingWorkerApplications.filter((app) => itemMatchesSearch(app, [
    (entry) => entry?.fullName,
    (entry) => entry?.phone,
    (entry) => entry?.email,
    (entry) => entry?.status,
    (entry) => entry?.homeLocation?.county,
    (entry) => entry?.homeLocation?.town,
    (entry) => entry?.homeLocation?.estate,
    (entry) => Array.isArray(entry?.serviceCategories) ? entry.serviceCategories.join(" ") : entry?.serviceCategories
  ], viewSearch)), [pendingWorkerApplications, viewSearch]);

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

    if (jobFocusFilter === "pending_review") {
      return jobs.filter((job) => job.status === "pending_review");
    }

    if (jobFocusFilter === "quote_pending_client") {
      return jobs.filter((job) => job.status === "quote_pending_client");
    }

    if (jobFocusFilter === "ready_for_dispatch") {
      return jobs.filter((job) => job.status === "quote_accepted_ready_for_dispatch");
    }

    if (jobFocusFilter === "worker_reply_needed") {
      return jobs.filter((job) =>
        job.assignmentStatus === "reassign_required" ||
        ["declined", "expired"].includes(String(job.workerOfferStatus || "").toLowerCase())
      );
    }

    if (jobFocusFilter === "issue_reported") {
      return jobs.filter((job) => job.status === "issue_reported");
    }

    if (jobFocusFilter === "awaiting_payment_verification") {
      return jobs.filter((job) => job.payment?.paymentStatus === "client_reported_balance_payment");
    }

    return jobs;
  }, [jobFocusFilter, jobs]);

  const operationalStageItems = useMemo(() => {
    return jobs
      .map((job) => {
        const snapshot = getJobStageSnapshot(job);
        return snapshot ? { ...snapshot, job } : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }, [jobs]);

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

    jobs.filter((job) => job.status === "pending_review").forEach((job) => {
      items.push({
        id: `quote-${job._id}`,
        title: `${cleanDisplayText(job.title || "Job")} is waiting for final quote`,
        detail: `Admin should send the final quote to ${cleanText(job.clientUserId?.fullName || "the client")}.`,
        actionLabel: "Open Jobs",
        onClick: () => {
          setJobFocusFilter("pending_review");
          setAdminView("dashboard");
        },
        tone: "#f59e0b"
      });
    });

    jobs.filter((job) => job.payment?.paymentStatus === "deposit_pending" && job.status !== "pending_review").forEach((job) => {
      items.push({
        id: `deposit-${job._id}`,
        title: `${cleanDisplayText(job.title || "Job")} is waiting for deposit confirmation`,
        detail: "Admin should confirm the client deposit before dispatch continues.",
        actionLabel: "Open Jobs",
        onClick: () => {
          setJobFocusFilter("all");
          setAdminView("dashboard");
        },
        tone: "#fcd34d"
      });
    });

    jobs.filter((job) => job.status === "quote_accepted_ready_for_dispatch" && !["pending"].includes(String(job.workerOfferStatus || "").toLowerCase())).forEach((job) => {
      items.push({
        id: `dispatch-${job._id}`,
        title: `${cleanDisplayText(job.title || "Job")} is ready for worker assignment`,
        detail: `${cleanText(job.clientUserId?.fullName || "Client")} accepted the quote. Dispatch a worker now.`,
        actionLabel: "Open Jobs",
        onClick: () => {
          setJobFocusFilter("ready_for_dispatch");
          setAdminView("dashboard");
        },
        tone: "#38bdf8"
      });
    });

    jobs.filter((job) =>
      job.assignmentStatus === "reassign_required" ||
      ["declined", "expired"].includes(String(job.workerOfferStatus || "").toLowerCase())
    ).forEach((job) => {
      items.push({
        id: `reassign-${job._id}`,
        title: `${cleanDisplayText(job.title || "Job")} needs worker reassignment`,
        detail: "The previous worker offer was declined or expired. Admin should assign another worker.",
        actionLabel: "Open Jobs",
        onClick: () => {
          setJobFocusFilter("worker_reply_needed");
          setAdminView("dashboard");
        },
        tone: "#fca5a5"
      });
    });

    jobs.filter((job) => job.status === "issue_reported").forEach((job) => {
      items.push({
        id: `issue-${job._id}`,
        title: `${cleanDisplayText(job.title || "Job")} has an issue raised`,
        detail: "Post-service issue needs admin intervention before release.",
        actionLabel: "Review Jobs",
        onClick: () => {
          setJobFocusFilter("issue_reported");
          setAdminView("dashboard");
        },
        tone: "#ef4444"
      });
    });

    jobs.filter((job) => job.payment?.paymentStatus === "client_reported_balance_payment").forEach((job) => {
      items.push({
        id: `payment-${job._id}`,
        title: `${cleanDisplayText(job.title || "Job")} awaits payment verification`,
        detail: "Client reported balance payment. Verify before release.",
        actionLabel: "Open Awaiting Release",
        onClick: () => {
          setJobFocusFilter("awaiting_payment_verification");
          setAdminView("dashboard");
        },
        tone: "#22c55e"
      });
    });

    jobs.filter((job) =>
      ["awaiting_admin_clearance", "issue_resolved"].includes(job.status) &&
      job.payment?.paymentStatus === "paid_in_full"
    ).forEach((job) => {
      items.push({
        id: `release-${job._id}`,
        title: `${cleanDisplayText(job.title || "Job")} is ready for worker release`,
        detail: "Payment is fully verified. Admin should release the worker now.",
        actionLabel: "Open Awaiting Release",
        onClick: () => {
          setJobFocusFilter("awaiting_release");
          setAdminView("dashboard");
        },
        tone: "#fcd34d"
      });
    });

    jobs.filter((job) =>
      (job.status === "completed" || job.assignmentStatus === "released" || Boolean(job.releasedAt)) &&
      !job?.payout?.isPaid
    ).forEach((job) => {
      items.push({
        id: `payout-${job._id}`,
        title: `${cleanDisplayText(job.title || "Job")} is waiting for worker payout`,
        detail: "Admin should record worker payout with the M-Pesa transaction message.",
        actionLabel: "Open Jobs",
        onClick: () => {
          setJobFocusFilter("all");
          setAdminView("dashboard");
        },
        tone: "#a78bfa"
      });
    });

    return items;
  }, [jobs, workerApplications]);

  const filteredVisibleJobs = useMemo(() => visibleJobs.filter((job) => itemMatchesSearch(job, [
    (entry) => entry?._id,
    (entry) => entry?.title,
    (entry) => entry?.serviceCategory,
    (entry) => entry?.status,
    (entry) => entry?.clientUserId?.fullName,
    (entry) => entry?.clientUserId?.phone,
    (entry) => entry?.assignedWorker?.fullName,
    (entry) => entry?.assignedWorker?.phone,
    (entry) => entry?.location?.county,
    (entry) => entry?.location?.town,
    (entry) => entry?.location?.estate,
    (entry) => entry?.location?.addressLine
  ], viewSearch)), [visibleJobs, viewSearch]);

  const filteredNotificationItems = useMemo(() => notificationItems.filter((item) => itemMatchesSearch(item, [
    (entry) => entry?.title,
    (entry) => entry?.detail,
    (entry) => entry?.actionLabel
  ], viewSearch)), [notificationItems, viewSearch]);

  const adminNotificationCount = filteredNotificationItems.length;

  const adminSidebarNav = (
    <div style={{ display: "grid", gap: "10px" }}>
      {[
        {
          heading: "Operations",
          items: [
            ["dashboard", "Dashboard", "#60a5fa"],
            ["notification_center", "Notification Center", "#f97316"],
            ["pending_worker_applications", "Pending Worker Applications", "#facc15"]
          ]
        },
        {
          heading: "Directories",
          items: [
            ["worker_directory", "Worker Directory", "#34d399"],
            ["client_directory", "Client Directory", "#38bdf8"]
          ]
        },
        {
          heading: "Account Control",
          items: [
            ["suspended_workers", "Suspended Workers", "#fb7185"],
            ["suspended_clients", "Suspended Clients", "#fdba74"],
            ["deactivated_workers", "Deactivated Workers", "#fda4af"],
            ["deactivated_clients", "Deactivated Clients", "#c4b5fd"],
            ["my_password", "Change My Password", "#a78bfa"],
            ...(isSuperAdmin ? [["super_admin_management", "Super Admin Management", "#f59e0b"]] : [])
          ]
        }
      ].map((section) => (
        <div key={section.heading} style={{ display: "grid", gap: "8px" }}>
          <div
            style={{
              padding: "2px 4px 0",
              color: "#94a3b8",
              fontSize: "0.72rem",
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform: "uppercase"
            }}
          >
            {section.heading}</div>{section.items.map(([value, label, accent]) => {
            const active = adminView === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => { if (value === "super_admin_management") { if (!isSuperAdmin) return; setSuperAdminPanelUnlocked(false); setAdminView("super_admin_management"); setModalForm((prev) => ({ ...prev, password: "" })); setModalState({ type: "unlock_super_admin_panel", open: true, payload: null }); return; } setAdminView(value); }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: "15px",
                  background: active
                    ? `linear-gradient(135deg, ${accent}22 0%, rgba(255,255,255,0.08) 100%)`
                    : "linear-gradient(135deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.025) 100%)",
                  border: active
                    ? `1px solid ${accent}66`
                    : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: active
                    ? `inset 0 0 0 1px ${accent}33, 0 10px 24px rgba(2,6,23,0.20)`
                    : "0 8px 20px rgba(2,6,23,0.10)",
                  color: active ? "#f8fafc" : "#dbe7f5",
                  fontWeight: active ? 850 : 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px"
                }}
              >
                <span>{label}</span>
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "999px",
                    background: accent,
                    boxShadow: active ? `0 0 0 6px ${accent}22` : "none",
                    flex: "0 0 auto"
                  }}
                />
              </button>
            );
          })}</div>))}</div>);

  return (
    <AppShell
      title=""
      subtitle=""
      hideMainHeader
      hideDefaultNav
      sidebarHeaderTitle="Admin Dashboard"
      sidebarHeaderSubtitle="Review jobs, send final quotes, collect commitment, dispatch intelligently, verify payment, and release workers."
      sidebarExtra={adminSidebarNav}
      sidebarLogoutInline
    >
      {adminImagePreview.open ? (
        <div
          onClick={() => setAdminImagePreview({ open: false, src: "", label: "" })}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(2, 6, 23, 0.82)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px"
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="glass-card"
            style={{
              width: "min(92vw, 1100px)",
              maxHeight: "92vh",
              padding: "18px",
              borderRadius: "24px",
              background: "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.96) 100%)",
              border: "1px solid rgba(148,163,184,0.20)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
              display: "grid",
              gap: "14px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: "1.05rem" }}>
                {adminImagePreview.label}</div><button
                type="button"
                className="ghost-button admin-action-button"
                onClick={() => setAdminImagePreview({ open: false, src: "", label: "" })}
              >
                Close
              </button></div><div
              style={{
                borderRadius: "18px",
                overflow: "hidden",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "60vh"
              }}
            >
              <img
                src={adminImagePreview.src}
                alt={adminImagePreview.label}
                style={{
                  maxWidth: "100%",
                  maxHeight: "76vh",
                  width: "auto",
                  height: "auto",
                  display: "block",
                  objectFit: "contain"
                }}
              /></div></div></div>) : null}

      <style>{`
        .admin-search-toolbar {
          padding: 12px 14px !important;
          border-radius: 18px !important;
          margin-bottom: 14px !important;
          min-height: unset !important;
          height: auto !important;
        }

        .admin-search-toolbar__row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .admin-search-toolbar__meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .admin-search-toolbar__title {
          color: #f8fafc;
          font-weight: 900;
          font-size: 0.98rem;
          line-height: 1.2;
        }

        .admin-search-toolbar__subtitle {
          color: #cbd5e1;
          font-size: 0.92rem;
          line-height: 1.35;
        }

        .admin-search-toolbar__actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          flex: 1 1 340px;
        }

        .admin-search-toolbar__input {
          width: min(100%, 360px);
          min-width: 260px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(15,23,42,0.58);
          color: #f8fafc;
          outline: none;
        }

        .admin-search-toolbar__input::placeholder {
          color: rgba(203, 213, 225, 0.7);
        }

        .admin-compact-card {
          padding: 18px 20px !important;
          border-radius: 22px !important;
        }

        .admin-compact-card h2,
        .admin-compact-card h3 {
          margin-top: 0;
          margin-bottom: 10px !important;
        }

        .admin-compact-empty {
          align-self: start;
        }

        @media (max-width: 900px) {
          .admin-search-toolbar__actions {
            width: 100%;
            justify-content: stretch;
          }

          .admin-search-toolbar__input {
            width: 100%;
            min-width: 0;
          }
        }

        @keyframes adminBlink {
          0% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
          70% { opacity: 0.55; transform: scale(1.08); box-shadow: 0 0 0 10px rgba(239,68,68,0); }
          100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }

        /* ===== batch1i compact fix for the five affected admin screens ===== */
        .admin-compact-five {
          padding: 14px 16px !important;
          margin-top: 0 !important;
          min-height: unset !important;
          height: auto !important;
          border-radius: 18px !important;
        }

        .admin-compact-five > h2,
        .admin-compact-five > h3 {
          margin-top: 0 !important;
          margin-bottom: 8px !important;
        }

        .admin-compact-five .card-stack {
          gap: 10px !important;
        }

        .admin-compact-five .glass-subcard {
          padding: 14px 16px !important;
          border-radius: 16px !important;
          min-height: unset !important;
          height: auto !important;
        }

        .admin-compact-five .section-head {
          margin-bottom: 10px !important;
        }

        .admin-compact-five .action-row {
          margin-top: 10px !important;
          gap: 8px !important;
        }

        .admin-compact-five .admin-compact-empty {
          padding: 14px 16px !important;
          border-radius: 14px !important;
        }

        .admin-pending-intro-compact {
          padding: 12px 14px !important;
          border-radius: 16px !important;
          min-height: unset !important;
          height: auto !important;
          margin-top: 0 !important;
        }

        .admin-pending-intro-compact h2 {
          margin-bottom: 4px !important;
        }

        .admin-notification-compact-lead {
          padding: 12px 14px !important;
          border-radius: 16px !important;
          margin-bottom: 10px !important;
        }

        .admin-notification-compact-item {
          padding: 12px 14px !important;
          border-radius: 16px !important;
        }

      `}</style>

      {error ? <div className="error-banner">{error}</div>: null}
      {success ? <div className="success-banner">{success}</div>: null}


      {!["super_admin_management", "my_password"].includes(adminView) ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "nowrap",
            marginBottom: "12px"
          }}
        >
          <input
            type="search"
            value={viewSearch}
            onChange={(event) => setViewSearch(event.target.value)}
            placeholder={getAdminSearchPlaceholder(adminView)}
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              height: "40px",
              padding: "0 14px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(15,23,42,0.52)",
              color: "#f8fafc",
              outline: "none"
            }}
          />
          <button
            type="button"
            className="ghost-button admin-action-button"
            onClick={refreshCurrentView}
            disabled={isRefreshingSection}
            style={{
              height: "40px",
              minHeight: "40px",
              padding: "0 16px",
              borderRadius: "12px",
              whiteSpace: "nowrap",
              flex: "0 0 auto"
            }}
          >
            {isRefreshingSection ? "Refreshing..." : "Refresh"}
          </button></div>) : null}

      {adminView === "dashboard" ? (
        <>
          <div
            className="stats-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "10px"
            }}
          >
            <StatCard label="Live Jobs" value={summary.liveJobs} accent="#93c5fd" hint="Open active jobs in progress" onClick={() => { setJobFocusFilter("live"); setAdminView("dashboard"); setSuccess(summary.liveJobs > 0 ? "Live jobs highlighted." : "No live jobs right now."); }} />
            <StatCard label="Awaiting Release" value={summary.awaitingRelease} accent="#fcd34d" hint="Open jobs waiting verification or release" onClick={() => { setJobFocusFilter("awaiting_release"); setAdminView("dashboard"); setSuccess(summary.awaitingRelease > 0 ? "Jobs awaiting release highlighted." : "No jobs are awaiting release right now."); }} />
            <StatCard label="Worker Directory" value={summary.workers} accent="#86efac" onClick={() => { setDirectoryFilter("all"); setAdminView("worker_directory"); }} />
            <StatCard label="Client Directory" value={summary.clients} accent="#60a5fa" onClick={() => { setDirectoryFilter("all"); setAdminView("client_directory"); }} />
            <StatCard label="Suspended Workers" value={summary.suspendedWorkers} accent="#fca5a5" onClick={() => setAdminView("suspended_workers")} />
            <StatCard label="Suspended Clients" value={summary.suspendedClients} accent="#fdba74" onClick={() => setAdminView("suspended_clients")} />
            <StatCard label="Deactivated Workers" value={summary.deactivatedWorkers} accent="#fda4af" onClick={() => setAdminView("deactivated_workers")} />
            <StatCard label="Deactivated Clients" value={summary.deactivatedClients} accent="#c4b5fd" onClick={() => setAdminView("deactivated_clients")} />
            <StatCard label="Workers Live" value={summary.workersLive} accent="#22c55e" badge={summary.workersLive > 0 ? "Live" : "Offline"} badgeTone={summary.workersLive > 0 ? "#22c55e" : "#ef4444"} blink onClick={() => { setDirectoryFilter("live_workers"); setAdminView("worker_directory"); setSuccess(summary.workersLive > 0 ? "Live workers highlighted." : "No workers are live right now."); }} />
            <StatCard label="Clients Live" value={summary.clientsLive} accent="#38bdf8" badge={summary.clientsLive > 0 ? "Live" : "Offline"} badgeTone={summary.clientsLive > 0 ? "#22c55e" : "#ef4444"} blink onClick={() => { setDirectoryFilter("live_clients"); setAdminView("client_directory"); setSuccess(summary.clientsLive > 0 ? "Live clients highlighted." : "No clients are live right now."); }} />
            <StatCard label="New Notification" value={adminNotificationCount} accent="#ef4444" badge={adminNotificationCount > 0 ? "New" : "None"} badgeTone={adminNotificationCount > 0 ? "#ef4444" : "#94a3b8"} blink={adminNotificationCount > 0} onClick={() => { setAdminView("notification_center"); setSuccess(adminNotificationCount > 0 ? "Notification center opened." : "No admin actions right now."); }} /></div><div
            className="stats-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "10px",
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
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
                </span></div><p style={{ color: "#cbd5e1", margin: 0 }}>
                Open today's protected business and performance analytics.
              </p>
            </button></div>{activitiesUnlocked ? (
            <div
              className="glass-card section-card"
              style={{
                marginTop: "12px",
                padding: "18px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#f8fafc" }}>Activities Today</h3>
                  <p style={{ color: "#cbd5e1", marginTop: "6px" }}>Protected operational daily metrics.</p></div><button className="ghost-button admin-action-button" onClick={() => setActivitiesUnlocked(false)}>
                  Lock Again
                </button></div><div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                {activitiesToday.map(([label, value]) => (
                  <div
                    key={label}
                    className="glass-subcard"
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)",
                      border: "1px solid rgba(255,255,255,0.10)"
                    }}
                  >
                    <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: "6px" }}>{label}</div><div style={{ color: "#f8fafc", fontWeight: 900, fontSize: "1.18rem" }}>{value}</div></div>))}</div></div>) : null}
<div className="card-stack" style={{ marginTop: "12px" }}>
            {isLoading ? (
              <p>Loading jobs...</p>
            ) : filteredVisibleJobs.length === 0 ? (
              <EmptyState title={jobFocusFilter === "live" ? "No live jobs right now" : jobFocusFilter === "awaiting_release" ? "No jobs awaiting release" : "No jobs yet"} text={jobFocusFilter === "all" ? "Jobs will appear here in latest-to-oldest order." : "Clear the active job filter to view all jobs again."} />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <div style={{ color: "#dbe7f5", fontWeight: 700 }}>
                    {jobFocusFilter === "live" ? "Showing live jobs only" : jobFocusFilter === "awaiting_release" ? "Showing jobs awaiting release only" : "Showing all jobs"}</div>{jobFocusFilter !== "all" ? (
                    <button className="ghost-button admin-action-button" onClick={() => setJobFocusFilter("all")}>Clear Job Filter</button>
                  ) : null}</div>{visibleJobs
                .slice()
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .map((job) => {
                  const finalCharge = Number(job.pricing?.finalClientChargeAmount || 0);
                  const workerOffer = Number(job.pricing?.workerOfferedAmount || 0);
                  const retention = Number(job.pricing?.platformRetentionAmount || 0);
                  const grossMargin = Number(job.pricing?.adminGrossMarginAmount || 0);
                  const paymentStatus = String(job.payment?.paymentStatus || "unpaid").toLowerCase();
                  const depositAmount = Number(job.payment?.depositAmount || 0);
                  const balanceAmount = paymentStatus === "paid_in_full"
                    ? 0
                    : ["deposit_paid", "client_reported_balance_payment"].includes(paymentStatus)
                      ? Number(job.payment?.balanceAmount || 0)
                      : Number(job.pricing?.finalClientChargeAmount || 0);
                  const timeline = getTimeline(job);
                  const timing = getTimingIntelligence(job);
                  const extraTime = getExtraTimeAdminSummary(job);

                  const canQuote = ["pending_review", "quote_pending_client"].includes(job.status);
                  const canAssign = job.status === "quote_accepted_ready_for_dispatch" && !["accepted", "awaiting_release", "released"].includes(job.assignmentStatus);
                  const canMarkDeposit = ["deposit_pending"].includes(paymentStatus);
                  const canVerifyPayment = paymentStatus === "client_reported_balance_payment";
                  const canRaiseIssue = ["awaiting_admin_clearance", "issue_resolved"].includes(job.status);
                  const canResolveIssue = job.status === "issue_reported";
                  const released = job.status === "completed" || job.assignmentStatus === "released" || !!job.releasedAt;
                  const canFinalizeRelease = ["awaiting_admin_clearance", "issue_resolved"].includes(job.status) && paymentStatus === "client_reported_balance_payment" && !released;
                  const canRelease = ["awaiting_admin_clearance", "issue_resolved"].includes(job.status) && paymentStatus === "paid_in_full" && !released;
                  const canPayWorker = released && !job?.payout?.isPaid;
                  const mapQuery = getMapQuery(job);
                  const liveLatitude = Number(job?.currentLocation?.lat);
                  const liveLongitude = Number(job?.currentLocation?.lng);
                  const hasLiveLocation = Number.isFinite(liveLatitude) && Number.isFinite(liveLongitude);
                  const hasPinnedMap = Boolean(String(job?.location?.googlePinUrl || "").trim());
                  const mapUrl = hasLiveLocation
                    ? `https://www.google.com/maps?q=${liveLatitude},${liveLongitude}`
                    : (String(job?.location?.googlePinUrl || "").trim() || `https://www.google.com/maps?q=${mapQuery}`);
                  const clientWhatsappUrl = getWhatsAppUrl(job.clientUserId?.phone || "");
                  const workerWhatsappUrl = getWhatsAppUrl(job.assignedWorker?.phone || "");
                  const trackingOpen = ["worker_accepted", "worker_en_route", "worker_arrived", "work_in_progress", "awaiting_admin_clearance", "issue_reported", "issue_resolved"].includes(job.status) && !released;

                  const subtitleBits = [
                    cleanText(job.clientUserId?.fullName || "Client"),
                    cleanText(job.location?.estate || ""),
                    cleanText(job.location?.town || "")
                  ].filter((bit) => bit && bit !== "-");

                  const isExpanded = expandedAdminJobId === job._id;
                  const rowStage = getAdminJobRowStage(job);
                  const compactLocation = cleanText(
                    [job.location?.estate, job.location?.town, job.location?.county].filter(Boolean).join(", ") || "-"
                  );
                  const compactWorker = cleanText(job.assignedWorker?.fullName || "Not assigned");
                  const compactClient = cleanText(job.clientUserId?.fullName || "Client");

                  return (
                    <div
                      key={job._id}
                      className="glass-subcard"
                      style={{
                        background: "linear-gradient(155deg, rgba(15,23,42,0.99) 0%, rgba(30,41,59,0.95) 46%, rgba(14,116,144,0.16) 100%)",
                        border: isExpanded ? "1px solid rgba(125,211,252,0.24)" : "1px solid rgba(148,163,184,0.14)",
                        boxShadow: isExpanded ? "0 20px 48px rgba(2,6,23,0.30)" : "0 10px 26px rgba(2,6,23,0.18)",
                        borderRadius: "24px",
                        padding: isExpanded ? "24px" : "0",
                        overflow: "hidden"
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedAdminJobId((current) => current === job._id ? "" : job._id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          cursor: "pointer",
                          padding: "14px 16px",
                          display: "grid",
                          gridTemplateColumns: "minmax(240px, 1.3fr) minmax(150px, 0.8fr) minmax(150px, 0.8fr) minmax(150px, 0.9fr) auto",
                          gap: "10px",
                          alignItems: "center"
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: "#f8fafc", fontSize: "1.05rem", fontWeight: 900, marginBottom: "6px" }}>
                            {cleanDisplayText(job.title)}</div><div style={{ color: "#cbd5e1", fontSize: "0.92rem", lineHeight: 1.55 }}>
                            {compactClient} {compactLocation !== "-" ? `| ${compactLocation}` : ""}</div></div><div style={{ minWidth: 0 }}>
                          <div style={{ color: "#94a3b8", fontSize: "0.78rem", fontWeight: 800, marginBottom: "5px" }}>STAGE</div><div style={{ color: rowStage.tone, fontWeight: 900 }}>{rowStage.label}</div></div><div style={{ minWidth: 0 }}>
                          <div style={{ color: "#94a3b8", fontSize: "0.78rem", fontWeight: 800, marginBottom: "5px" }}>WORKER</div><div style={{ color: "#f8fafc", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {compactWorker}</div></div><div style={{ minWidth: 0 }}>
                          <div style={{ color: "#94a3b8", fontSize: "0.78rem", fontWeight: 800, marginBottom: "5px" }}>FINANCE</div><div style={{ color: "#93c5fd", fontWeight: 800 }}>{formatMoney(finalCharge)}</div><div style={{ color: "#cbd5e1", fontSize: "0.85rem", marginTop: "4px" }}>{cleanText(paymentStatus)}</div></div><div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: "110px",
                            padding: "10px 14px",
                            borderRadius: "999px",
                            background: isExpanded ? "rgba(59,130,246,0.14)" : "rgba(148,163,184,0.10)",
                            border: isExpanded ? "1px solid rgba(96,165,250,0.28)" : "1px solid rgba(148,163,184,0.16)",
                            color: isExpanded ? "#bfdbfe" : "#e2e8f0",
                            fontWeight: 900,
                            fontSize: "0.88rem",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {isExpanded ? "Collapse" : "Open"}</div></button>

                      {isExpanded ? (
                        <div style={{ padding: "0 24px 24px 24px", borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                      <div className="job-head" style={{ alignItems: "flex-start", gap: "10px" }}>
                        <div>
                          <h3 style={{ fontSize: "1.5rem", color: "#f8fafc", marginBottom: "10px", letterSpacing: "0.01em" }}>
                            {cleanDisplayText(job.title)}
                          </h3>
                          <p style={{ color: "#dbe7f5", fontSize: "1rem", marginBottom: "18px", lineHeight: 1.7 }}>
                            {subtitleBits.map(cleanText).filter((bit) => bit && bit !== "-").join(` ${String.fromCharCode(8226)} `)}
                          </p></div><div className="badge-row">
                          <StatusBadge value={job.status} />
                          <StatusBadge value={job.assignmentStatus} />
                          <StatusBadge value={paymentStatus} /></div></div><div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                          gap: "12px",
                          marginTop: "10px",
                          marginBottom: "18px"
                        }}
                      >
                        <div className="glass-card section-card" style={{ padding: "16px", background: "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(30,41,59,0.80))" }}>
                          <h4 style={{ marginBottom: "12px", color: "#93c5fd" }}>Client Profile</h4>
                          <FieldRow label="Name" value={cleanText(job.clientUserId?.fullName || "-")} valueColor="#f8fafc" />
                          <FieldRow label="Phone" value={cleanText(job.clientUserId?.phone || "-")} valueColor="#bfdbfe" />
                          <FieldRow label="Address" value={cleanText([job.location?.addressLine, job.location?.estate, job.location?.town, job.location?.county].filter(Boolean).join(", ") || "-")} valueColor="#dbe7f5" />
                          <FieldRow label="Description" value={cleanDisplayText(job.description || "-")} valueColor="#e2e8f0" />
                          <FieldRow label="Instructions" value={cleanDisplayText(job.instructions || "-")} valueColor="#c7d2fe" />
                          <FieldRow label="Avoid Notes" value={cleanDisplayText(job.avoidNotes || "-")} valueColor="#fca5a5" />
                          <FieldRow label="Quote Notes" value={cleanDisplayText(job.pricing?.clientQuoteNotes || "-")} valueColor="#fcd34d" /></div><div className="glass-card section-card" style={{ padding: "16px", background: "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(30,41,59,0.80))" }}>
                          <h4 style={{ marginBottom: "12px", color: "#fdba74" }}>Worker Profile</h4>
                          <FieldRow label="Name" value={cleanText(job.assignedWorker?.fullName || "Not assigned")} valueColor="#f8fafc" />
                          <FieldRow label="Phone" value={cleanText(job.assignedWorker?.phone || "-")} valueColor="#fde68a" />
                          <FieldRow label="Assigned At" value={formatDateTime(job.assignedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Accepted At" value={formatDateTime(job.workerAcceptedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Arrived" value={formatDateTime(job.arrivedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Started" value={formatDateTime(job.startedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Completed" value={formatDateTime(job.completedAt)} valueColor="#dbeafe" />
                          <FieldRow label="Timing Status" value={timing.label} valueColor={timing.tone} />
                          <FieldRow label="Assigned vs Preferred" value={timing.assignedStatus?.label} valueColor={timing.assignedStatus?.tone || "#f8fafc"} />
                          <FieldRow label="Accepted vs Preferred" value={timing.acceptedStatus?.label} valueColor={timing.acceptedStatus?.tone || "#f8fafc"} />
                          <FieldRow label="Arrival vs Preferred" value={timing.arrivalStatus?.label} valueColor={timing.arrivalStatus?.tone || "#f8fafc"} />
                          <FieldRow label="Start vs Preferred" value={timing.startStatus?.label} valueColor={timing.startStatus?.tone || "#f8fafc"} />
                          <FieldRow label="Expected Finish" value={timing.expectedCompletionLabel} valueColor="#fde68a" />
                          <FieldRow label="Finish Status" value={timing.finishStatus?.label} valueColor={timing.finishStatus?.tone || "#f8fafc"} />
                          <FieldRow label="Actual Duration" value={timing.durationStatus?.label} valueColor={timing.durationStatus?.tone || "#f8fafc"} />
                          <FieldRow label="Extra Time Status" value={extraTime.label} valueColor={extraTime.tone || "#f8fafc"} />
                          <FieldRow label="Requested By" value={cleanText(extraTime.requestedBy || "-")} valueColor="#dbeafe" />
                          <FieldRow label="Requested At" value={extraTime.requestedAt} valueColor="#dbeafe" />
                          <FieldRow label="Reason" value={extraTime.reason} valueColor="#e2e8f0" />
                          <FieldRow label="Client Response At" value={extraTime.clientResponseAt} valueColor="#dbeafe" />
                          <FieldRow label="Admin View" value={extraTime.adminVisibility} valueColor={extraTime.tone || "#f8fafc"} /></div><div className="glass-card section-card" style={{ padding: "16px", background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(30,41,59,0.80))" }}>
                          <h4 style={{ marginBottom: "12px", color: "#86efac" }}>Finance & Conditions</h4>
                          <FieldRow label="Final Charge" value={formatMoney(finalCharge)} valueColor="#38bdf8" />
                          <FieldRow label="Deposit" value={formatMoney(depositAmount)} valueColor="#fcd34d" />
                          <FieldRow label="Balance" value={formatMoney(balanceAmount)} valueColor={balanceAmount > 0 ? "#fca5a5" : "#4ade80"} />
                          <FieldRow label="Worker Offer" value={formatMoney(workerOffer)} valueColor="#fb923c" />
                          <FieldRow label="Retention" value={formatMoney(retention)} valueColor="#c4b5fd" />
                          <FieldRow label="Gross Margin" value={formatMoney(grossMargin)} valueColor="#4ade80" />
                          <FieldRow label="Preferred Time" value={formatDateTime(job.preferredStartAt)} valueColor="#dbeafe" />
                          <FieldRow label="Must Finish By" value={timing.expectedCompletionLabel} valueColor="#fda4af" /></div></div><div
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
                            <p style={{ color: "#dbe7f5", lineHeight: 1.7 }}>All major progress for this job stays inside this card.</p></div><button
                            className="ghost-button admin-action-button"
                            onClick={() => {
                              if (!trackingOpen) {
                                setError("Forbidden for use outside assignment period.");
                                return;
                              }
                              setExpandedMapJobId((current) => (current === job._id ? "" : job._id));
                            }}
                          >
                            {expandedMapJobId === job._id ? "Hide Map" : trackingOpen ? "Open Map" : "Map Locked"}
                          </button></div>{!trackingOpen ? (
                          <div style={{ marginBottom: "12px", color: "#fca5a5", fontWeight: 700 }}>
                            Map is forbidden outside the valid assignment period.</div>) : (
                          <div style={{ marginBottom: "12px", color: hasLiveLocation ? "#22c55e" : (hasPinnedMap ? "#93c5fd" : "#fcd34d"), fontWeight: 700 }}>
                            {hasLiveLocation
                              ? `Map source: live worker location sync${job?.currentLocation?.updatedAt ? ` (updated ${formatDateTime(job.currentLocation.updatedAt)})` : ""}.`
                              : (hasPinnedMap ? "Map source: exact client pinned Google Map URL." : "Map source: fallback typed address search.")}</div>)}

                        {expandedMapJobId === job._id && trackingOpen ? (
                          <div style={{ marginTop: 12, marginBottom: 16 }}>
                            <div style={{ marginBottom: 8, color: "#cbd5e1" }}>
                              Tracking window is intended only during accepted job flow up to worker release.</div><iframe
                              title={`job-map-${job._id}`}
                              src={hasLiveLocation
                                ? `https://www.google.com/maps?q=${liveLatitude},${liveLongitude}&output=embed`
                                : (String(job?.location?.googlePinUrl || "").trim()
                                  ? `${mapUrl}${mapUrl.includes("?") ? "&" : "?"}output=embed`
                                  : `https://www.google.com/maps?q=${mapQuery}&output=embed`)}
                              style={{ width: "100%", height: "280px", border: 0, borderRadius: "14px" }}
                              loading="lazy"
                            /></div>) : null}
<div className="card-stack" style={{ gap: 10 }}>
                          {timeline.length === 0 ? (
                            <p>No timeline yet.</p>
                          ) : (
                            timeline.map((item, index) => (
                              <div
                                key={`${job._id}-timeline-${index}`}
                                style={{
                                  padding: "14px 16px",
                                  borderRadius: "14px",
                                  background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  boxShadow: "0 10px 22px rgba(2,6,23,0.10)"
                                }}
                              >
                                <div style={{ fontWeight: 700 }}>{item.label}</div><div style={{ color: "#93c5fd", marginTop: 4 }}>{formatDateTime(item.time || item.at || item.createdAt)}</div><div style={{ color: "#dbe7f5", marginTop: 6 }}>{cleanDisplayText(item.note)}</div></div>))
                          )}</div></div>{canQuote ? (
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
                          </button></div>) : null}

                      <div className="action-row admin-action-stack" style={{ marginTop: 16, flexWrap: "wrap" }}>
                        {clientWhatsappUrl ? (
                          <button
                            className="primary-button admin-action-button"
                            style={{ background: CLIENT_BLUE, borderColor: CLIENT_BLUE, color: "#eff6ff" }}
                            onClick={() => window.open(clientWhatsappUrl, "_blank", "noopener,noreferrer")}
                          >
                            WhatsApp Client
                          </button>
                        ) : null}

                        {job?.assignedWorker?.email ? (
                          <button
                            className="ghost-button admin-action-button"
                            style={{ borderColor: "rgba(148,163,184,0.28)", color: "#e2e8f0" }}
                            onClick={() =>
                              window.open(
                                getGmailComposeUrl(
                                  job?.assignedWorker?.email || "",
                                  `HomeCare Admin - ${cleanText(job?.title || "Assigned Job")}`,
                                  `Hello ${cleanText(job?.assignedWorker?.fullName || "Worker")},

This is HomeCare admin regarding job: ${cleanText(job?.title || "")}.

Please check your dashboard for the latest instructions.`
                                ),
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            Email Worker
                          </button>
                        ) : null}

                        {canAssign ? (
                          <button className="primary-button admin-action-button" onClick={() => { setSelectedJob(job); setAssignDraft({ workerUserId: "", workerOfferedAmount: String(job?.pricing?.workerOfferedAmount || Math.max(0, Math.round(Number(job?.pricing?.finalClientChargeAmount || 0) * 0.8))), adminQuoteNotes: "", platformRetentionRate: String(job?.pricing?.platformRetentionRate || 20) }); }}>
                            Assign Worker
                          </button>
                        ) : null}

                        {canMarkDeposit ? (
                          <button className="ghost-button admin-action-button" onClick={() => handleMarkDepositPaid(job._id)}>
                            Mark Deposit Paid
                          </button>
                        ) : null}

                        {canVerifyPayment ? (
                          <button className="ghost-button admin-action-button" disabled={actingJobId === job._id} onClick={() => handleVerifyPayment(job._id)}>
                            {actingJobId === job._id ? "Working..." : "Payment Received"}
                          </button>
                        ) : null}

                        {canFinalizeRelease ? (
                          <button className="primary-button admin-action-button" disabled={actingJobId === job._id} onClick={() => handleFinalizeRelease(job)}>
                            {actingJobId === job._id ? "Finalizing..." : "Verify Payment and Release Worker"}
                          </button>
                        ) : null}

                        {canRaiseIssue ? (
                          <button className="ghost-button admin-action-button" onClick={() => setModalState({ type: "raise_issue", open: true, payload: job })}>
                            Issue Raised
                          </button>
                        ) : null}

                        {canResolveIssue ? (
                          <button className="ghost-button admin-action-button" onClick={() => setModalState({ type: "resolve_issue", open: true, payload: job })}>
                            Resolve Issue
                          </button>
                        ) : null}

                        {canRelease ? (
                          <button className="primary-button admin-action-button" disabled={actingJobId === job._id} onClick={() => handleReleaseWorker(job)}>
                            {actingJobId === job._id ? "Releasing..." : "Release Worker"}
                          </button>
                        ) : null}

                        {canPayWorker ? (
                          <button
                            className="ghost-button admin-action-button"
                            onClick={() => openPayWorkerModal(job)}
                          >
                            Pay Worker
                          </button>
                        ) : null}

                        {released ? (
                          <button
                            className="primary-button admin-action-button"
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
                        ) : null}</div></div>) : null}</div>);
                })}
              </>
            )}</div></>
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
          const workerAvailabilityStatus = String(worker?.profile?.availability?.status || "").toLowerCase();
          const isWorkerCurrentlyAvailable = getWorkerAvailabilityState(worker);
          const isWorkerCurrentlyOnline = isWorkerOnlineNow(worker);
          const workerAvailabilityLine = formatAvailabilityWindow(worker.profile);
          const workerSections = [
            ["Services Offered", Array.isArray(worker.profile?.serviceCategories) ? worker.profile.serviceCategories.map(formatServiceLabel).join(", ") : cleanText(worker.profile?.serviceCategories || "-"), "#93c5fd"],
            ["Home Location", `${cleanText(worker.profile?.homeLocation?.county || "-")} / ${cleanText(worker.profile?.homeLocation?.town || "-")} / ${cleanText(worker.profile?.homeLocation?.estate || "-")}`, "#fdba74", false],
            ["Address", cleanText(worker.profile?.homeLocation?.addressLine || "-"), "#c4b5fd", false],
            ["Personal Details", `Phone: ${cleanText(worker.phone || "-")} | Email: ${cleanText(worker.email || "-")} | Last Login: ${formatDateTime(worker.lastLoginAt)}`, "#60a5fa", false],
            ["Availability & Work Preferences", (
              <div style={{ display: "grid", gap: "8px" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "fit-content",
                    padding: "8px 12px",
                    borderRadius: "999px",
                    fontWeight: 950,
                    color: isWorkerCurrentlyAvailable ? "#86efac" : "#fca5a5",
                    background: isWorkerCurrentlyAvailable ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)",
                    border: isWorkerCurrentlyAvailable ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(239,68,68,0.35)"
                  }}
                >
                  <span
                    className="live-status-dot"
                    style={{
                      color: isWorkerCurrentlyAvailable ? "#22c55e" : "#ef4444",
                      background: isWorkerCurrentlyAvailable ? "#22c55e" : "#ef4444"
                    }}
                  />
                  {workerAvailabilityLine}
                </div>
                <div>{`Work Radius: ${cleanText(worker.profile?.preferredWorkRadiusKm || "-")} KM | Can Bring Supplies: ${String(worker.profile?.canBringOwnSupplies) === "true" || worker.profile?.canBringOwnSupplies === true ? "Yes" : "No / Depends"}`}</div>
              </div>
            ), "#86efac", false],
            ["Submitted Uploads", renderWorkerUploads(worker), "#f9a8d4"],
            ["Audit Trail", `Suspended At: ${formatDateTime(worker.suspendedAt)} | Suspend Reason: ${cleanText(worker.suspendedReason || worker.profile?.suspensionReason || "-")} | Reactivated At: ${formatDateTime(worker.reactivatedAt)} | Reactivation Note: ${cleanText(worker.reactivationNote || "-")} | Deactivated At: ${formatDateTime(worker.deletedAt)} | Deactivation Reason: ${cleanText(worker.deletionReason || "-")}`, "#22d3ee", false],
            ["Admin Activity", `Last Updated: ${formatDateTime(worker.updatedAt || worker.profile?.updatedAt)} | Notes: ${cleanText(worker.profile?.adminNotes || worker.profile?.notesForAdmin || "-")}`, "#facc15", false],
          ];

          return (
            <div key={worker._id} className="glass-subcard" style={{ padding: "14px 16px", borderRadius: "22px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "flex-start"
                }}
              >
                <div style={{ flex: "1 1 380px", minWidth: "280px" }}>
                  <div style={{ fontSize: "1.28rem", fontWeight: 900, color: "#f8fafc" }}>
                    {cleanText(worker.fullName || "-")}</div><div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(worker.phone || "-")}</div><div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(worker.email || "-")}</div></div><div style={{ minWidth: "220px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ color: statusTone, fontWeight: 800 }}>Status: {cleanText(worker.currentAccountState || worker.accountStatus || "-")}</div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 900,
                        color: isWorkerCurrentlyOnline ? "#86efac" : "#fca5a5",
                        background: isWorkerCurrentlyOnline ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        border: isWorkerCurrentlyOnline ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(239,68,68,0.28)"
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "999px",
                          background: isWorkerCurrentlyOnline ? "#22c55e" : "#ef4444"
                        }}
                      />
                      {isWorkerCurrentlyOnline ? "Online" : "Offline"}
                    </div>
                  </div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>Registered: {formatDateTime(worker.createdAt)}</div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>Approved: {formatDateTime(worker.applicationSummary?.approvedAt)}</div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>Last Login: {formatDateTime(worker.lastLoginAt)}</div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>Last Seen: {formatDateTime(worker.profile?.lastSeenAt || worker.lastSeenAt)}</div></div></div><div
                style={{
                  marginTop: "12px",
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 240px) minmax(280px, 1fr)",
                  gap: "12px",
                  alignItems: "stretch"
                }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.03) 100%)"
                  }}
                >
                  <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: "8px" }}>
                    Worker Directory Profile Photo</div>{worker?.applicationRecord?.profilePhoto?.url ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(
                            new CustomEvent("admin-open-worker-image-preview", {
                              detail: {
                                src: worker.applicationRecord.profilePhoto.url,
                                label: `${cleanText(worker.fullName || "Worker")} Profile Photo`
                              }
                            })
                          );
                        }
                      }}
                      style={{
                        padding: 0,
                        margin: 0,
                        border: "none",
                        background: "transparent",
                        cursor: "zoom-in",
                        width: "100%",
                        display: "block"
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "1 / 1",
                          borderRadius: "14px",
                          overflow: "hidden",
                          position: "relative",
                          background: "rgba(15,23,42,0.72)",
                          border: "1px solid rgba(148,163,184,0.18)"
                        }}
                      >
                        <img
                          src={worker.applicationRecord.profilePhoto.url}
                          alt="Worker profile"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                            transform: `scale(${Math.min(3, Math.max(0.5, Number(worker?.profile?.profilePhotoDisplay?.zoom || 1)))})`,
                            transformOrigin: `${Math.min(100, Math.max(0, Number(worker?.profile?.profilePhotoDisplay?.offsetX || 50)))}% ${Math.min(100, Math.max(0, Number(worker?.profile?.profilePhotoDisplay?.offsetY || 50)))}%`
                          }}
                        /></div></button>
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: "14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(148,163,184,0.10)",
                        border: "1px solid rgba(148,163,184,0.22)",
                        color: "#cbd5e1",
                        textAlign: "center",
                        padding: "18px",
                        lineHeight: 1.6
                      }}
                    >
                      No worker profile photo preview stored yet.</div>)}</div><div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.03) 100%)",
                    minHeight: "100%"
                  }}
                >
                  <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: "8px" }}>
                    Saved Pin Location</div>{(worker?.profile?.homeLocation?.googlePinUrl || worker?.applicationRecord?.homeLocation?.googlePinUrl || worker?.applicationRecord?.googlePinUrl || worker?.applicationRecord?.locationPinUrl) ? (
                    <>
                      <div style={{ color: "#e2e8f0", lineHeight: 1.6, wordBreak: "break-all", marginBottom: "10px" }}>
                        {worker?.profile?.homeLocation?.googlePinUrl || worker?.applicationRecord?.homeLocation?.googlePinUrl || worker?.applicationRecord?.googlePinUrl || worker?.applicationRecord?.locationPinUrl}</div><button
                        type="button"
                        className="ghost-button admin-action-button"
                        onClick={() =>
                          window.open(
                            worker?.profile?.homeLocation?.googlePinUrl || worker?.applicationRecord?.homeLocation?.googlePinUrl || worker?.applicationRecord?.googlePinUrl || worker?.applicationRecord?.locationPinUrl,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                      >
                        Open Saved Pin
                      </button>
                    </>
                  ) : (
                    <div style={{ color: "#94a3b8", lineHeight: 1.6 }}>
                      No saved worker location pin is stored on this approved worker profile.</div>)}</div></div><div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                {workerSections.map(([label, value, color, isServices]) => (
                  <div
                    key={label}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.03) 100%)"
                    }}
                  >
                    <div style={{ color, fontWeight: 800, marginBottom: "6px" }}>{label}</div>{isServices ? (
                      <ServiceSummaryBlock services={value} />
                    ) : (
                      <div style={{ color: "#f8fafc", fontWeight: 700, lineHeight: 1.7 }}>{value}</div>)}</div>))}</div>
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "14px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.03) 100%)"
                  }}
                >
                  <div style={{ color: "#22d3ee", fontWeight: 800, marginBottom: "6px" }}>Payment Details</div>
                  <div style={{ color: "#f8fafc", fontWeight: 700, lineHeight: 1.7 }}>
                    {`M-Pesa: ${cleanText(worker?.profile?.mpesaNumber || worker?.applicationRecord?.mpesaNumber || "-")} | Registered Name: ${cleanText(worker?.profile?.mpesaRegisteredName || worker?.applicationRecord?.mpesaRegisteredName || worker?.profile?.bankAccountName || worker?.applicationRecord?.bankAccountName || "-")} | Bank / Account: ${cleanText(worker?.profile?.bankAccountDetails || worker?.applicationRecord?.bankAccountDetails || worker?.profile?.bankAccountNumber || worker?.applicationRecord?.bankAccountNumber || "n/a")}`}
                  </div>
                </div>

{renderWorkerApplicationSnapshot(worker)}
              {renderWorkerUploadCards(worker)}

              <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
                <div className="action-row admin-action-stack" style={{ flexWrap: "wrap", gap: "10px" }}>
                  <button
                    className="primary-button admin-action-button"
                    type="button"
                    style={{ minWidth: "170px" }}
                    onClick={() => openAdminModal("override_worker_profile", worker)}
                  >
                    Override Profile
                  </button>

                  <button
                    type="button"
                    className="ghost-button admin-action-button"
                    style={{ minWidth: "170px" }}
                    onClick={() => openAdminModal("reset_worker_password", worker)}
                  >
                    Reset Worker Password
                  </button>
                </div>

                <div className="action-row admin-action-stack" style={{ flexWrap: "wrap", gap: "10px" }}>
                  {getWhatsAppUrl(worker.phone) ? (
                    <button
                      type="button"
                      className="primary-button admin-action-button"
                      style={{ background: WORKER_ORANGE, borderColor: WORKER_ORANGE, color: "#111827", minWidth: "170px" }}
                      onClick={() => window.open(getWhatsAppUrl(worker.phone), "_blank", "noopener,noreferrer")}
                    >WhatsApp Worker</button>
                  ) : null}

                  {worker.email ? (
                    <button
                      type="button"
                      className="ghost-button admin-action-button"
                      style={{ minWidth: "170px" }}
                      onClick={() => window.open(getGmailComposeUrl(worker.email, "HomeCare Worker Support", ""), "_blank", "noopener,noreferrer")}
                    >
                      Email Worker
                    </button>
                  ) : null}
                </div>

                <div className="action-row admin-action-stack" style={{ flexWrap: "wrap", gap: "10px" }}>
                  {String(worker.currentAccountState || worker.accountStatus || "").toLowerCase() === "suspended" ? (
                    <button
                      type="button"
                      className="ghost-button admin-action-button"
                      style={{ minWidth: "170px" }}
                      onClick={() => openAdminModal("reactivate_worker", worker)}
                    >
                      Reactivate Worker
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button admin-action-button"
                      style={{ minWidth: "170px" }}
                      onClick={() => openAdminModal("suspend_worker", worker)}
                    >
                      Suspend Worker
                    </button>
                  )}

                  <button
                    type="button"
                    className="primary-button admin-action-button"
                    style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff", minWidth: "170px" }}
                    onClick={() => openAdminModal("delete_worker", worker)}
                  >
                    Deactivate Worker
                  </button>
                </div>
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
      <EmptyState title="No clients found" text="Client accounts will appear here with profile details and account actions." />
    ) : (
      <div className="card-stack">
        {visibleClientDirectory.map((client) => {
          const clientStatus = String(client.currentAccountState || client.accountStatus || "-").toLowerCase();
          const statusTone = clientStatus === "suspended" ? "#fca5a5" : clientStatus === "deleted" ? "#fda4af" : "#86efac";
          const location = client?.profile?.defaultLocation || {};
          return (
            <div key={client._id} className="glass-subcard" style={{ padding: "14px 16px", borderRadius: "22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 380px", minWidth: "280px" }}>
                  <div style={{ fontSize: "1.28rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(client.fullName || "-")}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(client.phone || "-")}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(client.email || "-")}</div>
                </div>
                <div style={{ minWidth: "220px" }}>
                  <div style={{ color: statusTone, fontWeight: 800 }}>Status: {cleanText(client.currentAccountState || client.accountStatus || "-")}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "6px" }}>Registered: {formatDateTime(client.createdAt)}</div>
                  <div style={{ color: "#cbd5e1", marginTop: "6px" }}>Last Login: {formatDateTime(client.lastLoginAt)}</div>
                </div>
              </div>

              <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                {[
                  ["Home Location", `${cleanText(location.county || "-")} / ${cleanText(location.town || "-")} / ${cleanText(location.estate || "-")}`, "#60a5fa"],
                  ["Address", cleanText(location.addressLine || "-"), "#c4b5fd"],
                  ["House Details", cleanText(location.houseDetails || "-"), "#fdba74"],
                  ["Saved Pin Location", cleanText(location.googlePinUrl || client?.profile?.googlePinUrl || client?.googlePinUrl || client?.locationPinUrl || "-"), "#93c5fd"],
                  ["Profile Audit", `Suspended At: ${formatDateTime(client.suspendedAt)} | Suspend Reason: ${cleanText(client.suspendedReason || "-")} | Deactivated At: ${formatDateTime(client.deletedAt)} | Deactivation Reason: ${cleanText(client.deletionReason || "-")}`, "#22d3ee"],
["Admin Activity",
`Last Updated: ${formatDateTime(client.updatedAt || client.profile?.updatedAt)} | Notes: ${cleanText(client.profile?.adminNotes || client.profile?.notesForAdmin || "-")}`,
"#facc15"]
                ].map(([label, value, color]) => (
                  <div key={label} style={{ padding: "12px 14px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.03) 100%)" }}>
                    <div style={{ color, fontWeight: 800, marginBottom: "6px" }}>{label}</div>
                    <div style={{ color: "#f8fafc", fontWeight: 700, lineHeight: 1.7 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="action-row admin-action-stack" style={{ marginTop: "12px", flexWrap: "wrap", gap: "10px" }}>
                <button
                  className="ghost-button admin-action-button"
                  type="button"
                  style={{ borderColor: "rgba(139,92,246,0.30)", color: "#e9d5ff", background: "rgba(139,92,246,0.08)" }}
                  onClick={() => openAdminModal("override_client_profile", client)}
                >
                  Override Profile
                </button>
                {getWhatsAppUrl(client.phone) ? (
                  <button
                    type="button"
                    className="primary-button admin-action-button"
                    style={{ background: CLIENT_BLUE, borderColor: CLIENT_BLUE, color: "#eff6ff" }}
                    onClick={() => window.open(getWhatsAppUrl(client.phone), "_blank", "noopener,noreferrer")}
                  >
                    WhatsApp Client
                  </button>
                ) : null}
                {client.email ? (
                  <button
                    type="button"
                    className="ghost-button admin-action-button"
                    style={{ borderColor: "rgba(148,163,184,0.28)", color: "#e2e8f0", background: "rgba(148,163,184,0.08)" }}
                    onClick={() => window.open(getGmailComposeUrl(client.email, "HomeCare Client Support", ""), "_blank", "noopener,noreferrer")}
                  >
                    Email Client
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost-button admin-action-button"
                  style={{ borderColor: "rgba(250,204,21,0.30)", color: "#fde68a", background: "rgba(250,204,21,0.08)" }}
                  onClick={() => openAdminModal("reset_client_password", client)}
                >
                  Reset Password
                </button>
                {String(client.currentAccountState || client.accountStatus || "").toLowerCase() === "suspended" ? (
                  <button
                    type="button"
                    className="ghost-button admin-action-button"
                    style={{ borderColor: "rgba(34,197,94,0.30)", color: "#bbf7d0", background: "rgba(34,197,94,0.08)" }}
                    onClick={() => openAdminModal("reactivate_client", client)}
                  >
                    Reactivate Client
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost-button admin-action-button"
                    style={{ borderColor: "rgba(245,158,11,0.30)", color: "#fde68a", background: "rgba(245,158,11,0.08)" }}
                    onClick={() => openAdminModal("suspend_client", client)}
                  >
                    Suspend Client
                  </button>
                )}
                <button
                  type="button"
                  className="primary-button admin-action-button"
                  style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
                  onClick={() => openAdminModal("delete_client", client)}
                >
                  Deactivate Client
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
        <div
          className="glass-card section-card"
          style={{
            padding: "16px 18px",
            borderRadius: "20px",
            minHeight: "unset",
            height: "auto",
            flex: "0 0 auto",
            alignSelf: "start",
            marginTop: "0"
          }}
        >
          <h3 style={{ margin: 0, marginBottom: "6px" }}>Suspended Workers</h3>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.55 }}>
            Suspended worker accounts appear here with suspension timing, reason, audit trail, and reactivation control.
          </p>

          <div style={{ marginTop: "12px" }}>
            {visibleSuspendedWorkersList.length === 0 ? (
              <EmptyState
                title="No suspended workers right now"
                text="Suspended worker accounts appear here with suspension timing, reason, audit trail, and reactivation control."
              />
            ) : (
              <div className="card-stack" style={{ gap: "10px" }}>
                {visibleSuspendedWorkersList.map((worker) => (
                  <div key={worker._id} className="glass-subcard" style={{ padding: "16px 18px", borderRadius: "18px" }}>
                    <div style={{ fontSize: "1.12rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(worker.fullName || "-")}</div>
                    <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(worker.phone || "-")}</div>
                    <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(worker.email || "-")}</div>
                    <div style={{ color: "#fcd34d", marginTop: "8px", fontWeight: 800 }}>
                      Status: {cleanText(worker.currentAccountState || worker.accountStatus || "-")}
                    </div>
                    <div style={{ color: "#fecaca", marginTop: "8px", fontWeight: 800 }}>
                      Suspension Reason: {cleanText(worker.suspendedReason || worker.profile?.suspensionReason || "Not recorded")}
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "8px" }}>
                      <strong>Suspended At:</strong> {formatDateTime(worker.suspendedAt)}
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "8px" }}>
                      <strong>Last Login:</strong> {formatDateTime(worker.lastLoginAt)}
                    </div>
                    <div style={{ color: "#22d3ee", marginTop: "8px", lineHeight: 1.7 }}>
                      <strong>Profile Audit:</strong> Suspended At: {formatDateTime(worker.suspendedAt)} | Suspend Reason: {cleanText(worker.suspendedReason || "-")} | Reactivated At: {formatDateTime(worker.reactivatedAt)} | Reactivation Note: {cleanText(worker.reactivationNote || "-")} | Deactivated At: {formatDateTime(worker.deletedAt)} | Deactivation Reason: {cleanText(worker.deletionReason || "-")}
                    </div>
                    <div className="action-row admin-action-stack" style={{ marginTop: "12px", flexWrap: "wrap" }}>
                      <button
                        className="ghost-button admin-action-button"
                        onClick={() => openAdminModal("reactivate_worker", worker, { resolutionNote: "" })}
                      >
                        Reactivate Worker
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

{adminView === "suspended_clients" ? (
        <div
          className="glass-card section-card"
          style={{
            padding: "16px 18px",
            borderRadius: "20px",
            minHeight: "unset",
            height: "auto",
            flex: "0 0 auto",
            alignSelf: "start",
            marginTop: "0"
          }}
        >
          <h3 style={{ margin: 0, marginBottom: "6px" }}>Suspended Clients</h3>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.55 }}>
            Suspended client accounts appear here with suspension timing, reason, audit trail, and reactivation control.
          </p>

          <div style={{ marginTop: "12px" }}>
            {visibleSuspendedClientsList.length === 0 ? (
              <EmptyState
                title="No suspended clients right now"
                text="Suspended client accounts appear here with suspension timing, reason, audit trail, and reactivation control."
              />
            ) : (
              <div className="card-stack" style={{ gap: "10px" }}>
                {visibleSuspendedClientsList.map((client) => (
                  <div key={client._id} className="glass-subcard" style={{ padding: "16px 18px", borderRadius: "18px" }}>
                    <div style={{ fontSize: "1.12rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(client.fullName || "-")}</div>
                    <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(client.phone || "-")}</div>
                    <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(client.email || "-")}</div>
                    <div style={{ color: "#fcd34d", marginTop: "8px", fontWeight: 800 }}>
                      Status: {cleanText(client.currentAccountState || client.accountStatus || "-")}
                    </div>
                    <div style={{ color: "#fecaca", marginTop: "8px", fontWeight: 800 }}>
                      Suspension Reason: {cleanText(client.suspendedReason || client.profile?.suspensionReason || "Not recorded")}
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "8px" }}>
                      <strong>Suspended At:</strong> {formatDateTime(client.suspendedAt)}
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "8px" }}>
                      <strong>Last Login:</strong> {formatDateTime(client.lastLoginAt)}
                    </div>
                    <div style={{ color: "#22d3ee", marginTop: "8px", lineHeight: 1.7 }}>
                      <strong>Profile Audit:</strong> Suspended At: {formatDateTime(client.suspendedAt)} | Suspend Reason: {cleanText(client.suspendedReason || "-")} | Deactivated At: {formatDateTime(client.deletedAt)} | Deactivation Reason: {cleanText(client.deletionReason || "-")}
                    </div>
                    <div className="action-row admin-action-stack" style={{ marginTop: "12px", flexWrap: "wrap" }}>
                      <button
                        className="ghost-button admin-action-button"
                        onClick={() => openAdminModal("reactivate_client", client, { resolutionNote: "" })}
                      >
                        Reactivate Client
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
{adminView === "deactivated_workers" ? (
        <div
          className="glass-card section-card"
          style={{
            padding: "16px 18px",
            borderRadius: "20px",
            minHeight: "unset",
            height: "auto",
            flex: "0 0 auto",
            alignSelf: "start",
            marginTop: "0"
          }}
        >
          <h3 style={{ margin: 0, marginBottom: "6px" }}>Deactivated Workers</h3>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.55 }}>
            Deactivated worker accounts appear here with timing, reason, audit trail, and reactivation control.
          </p>

          <div style={{ marginTop: "12px" }}>
            {visibleDeactivatedWorkersList.length === 0 ? (
              <EmptyState
                title="No deactivated workers yet"
                text="Deactivated worker accounts appear here with timing, reason, audit trail, and reactivation control."
              />
            ) : (
              <div className="card-stack" style={{ gap: "10px" }}>
                {visibleDeactivatedWorkersList.map((worker) => (
                  <div key={worker._id} className="glass-subcard" style={{ padding: "16px 18px", borderRadius: "18px" }}>
                    <div style={{ fontSize: "1.12rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(worker.fullName || "-")}</div>
                    <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(worker.phone || "-")}</div>
                    <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(worker.email || "-")}</div>
                    <div style={{ color: "#fda4af", marginTop: "8px", fontWeight: 800 }}>
                      Status: {cleanText(worker.currentAccountState || worker.accountStatus || "deactivated")}
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "8px" }}>
                      <strong>Deactivated At:</strong> {formatDateTime(worker.deletedAt)}
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "8px" }}>
                      <strong>Last Login:</strong> {formatDateTime(worker.lastLoginAt)}
                    </div>
                    <div style={{ color: "#fecaca", marginTop: "8px", fontWeight: 800 }}>
                      Deactivation Reason: {cleanText(worker.deletionReason || "-")}
                    </div>
                    <div style={{ color: "#22d3ee", marginTop: "8px", lineHeight: 1.7 }}>
                      <strong>Profile Audit:</strong> Suspended At: {formatDateTime(worker.suspendedAt)} | Suspend Reason: {cleanText(worker.suspendedReason || "-")} | Reactivated At: {formatDateTime(worker.reactivatedAt)} | Reactivation Reason: {cleanText(worker.reactivationNote || "-")} | Deactivated At: {formatDateTime(worker.deletedAt)} | Deactivation Reason: {cleanText(worker.deletionReason || "-")}
                    </div>
                    <div className="action-row admin-action-stack" style={{ marginTop: "12px", flexWrap: "wrap", gap: "10px" }}>
                      <button
                        className="primary-button admin-action-button"
                        style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16", minWidth: "172px" }}
                        onClick={() => openAdminModal("reactivate_worker", worker, { resolutionNote: "" })}
                      >
                        Reactivate Worker
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}


{adminView === "deactivated_clients" ? (
        <div
          className="glass-card section-card"
          style={{
            padding: "16px 18px",
            borderRadius: "20px",
            minHeight: "unset",
            height: "auto",
            flex: "0 0 auto",
            alignSelf: "start",
            marginTop: "0"
          }}
        >
          <h3 style={{ margin: 0, marginBottom: "6px" }}>Deactivated Clients</h3>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.55 }}>
            Deactivated client accounts appear here with timing, reason, audit trail, and reactivation control.
          </p>

          <div style={{ marginTop: "12px" }}>
            {visibleDeactivatedClientsList.length === 0 ? (
              <EmptyState
                title="No deactivated clients yet"
                text="Deactivated client accounts appear here with timing, reason, audit trail, and reactivation control."
              />
            ) : (
              <div className="card-stack" style={{ gap: "10px" }}>
                {visibleDeactivatedClientsList.map((client) => (
                  <div key={client._id} className="glass-subcard" style={{ padding: "16px 18px", borderRadius: "18px" }}>
                    <div style={{ fontSize: "1.12rem", fontWeight: 900, color: "#f8fafc" }}>{cleanText(client.fullName || "-")}</div>
                    <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(client.phone || "-")}</div>
                    <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(client.email || "-")}</div>
                    <div style={{ color: "#fda4af", marginTop: "8px", fontWeight: 800 }}>
                      Status: {cleanText(client.currentAccountState || client.accountStatus || "deactivated")}
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "8px" }}>
                      <strong>Deactivated At:</strong> {formatDateTime(client.deletedAt)}
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "8px" }}>
                      <strong>Last Login:</strong> {formatDateTime(client.lastLoginAt)}
                    </div>
                    <div style={{ color: "#fecaca", marginTop: "8px", fontWeight: 800 }}>
                      Deactivation Reason: {cleanText(client.deletionReason || "-")}
                    </div>
                    <div style={{ color: "#22d3ee", marginTop: "8px", lineHeight: 1.7 }}>
                      <strong>Profile Audit:</strong> Suspended At: {formatDateTime(client.suspendedAt)} | Suspend Reason: {cleanText(client.suspendedReason || "-")} | Reactivated At: {formatDateTime(client.reactivatedAt)} | Reactivation Reason: {cleanText(client.reactivationNote || "-")} | Deactivated At: {formatDateTime(client.deletedAt)} | Deactivation Reason: {cleanText(client.deletionReason || "-")}
                    </div>
                    <div className="action-row admin-action-stack" style={{ marginTop: "12px", flexWrap: "wrap", gap: "10px" }}>
                      <button
                        className="primary-button admin-action-button"
                        style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16", minWidth: "172px" }}
                        onClick={() => openAdminModal("reactivate_client", client, { resolutionNote: "" })}
                      >
                        Reactivate Client
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}


{adminView === "notification_center" ? (
        <div
          className="glass-card section-card"
          style={{
            padding: "16px 18px",
            borderRadius: "20px",
            minHeight: "unset",
            height: "auto",
            flex: "0 0 auto",
            alignSelf: "start",
            marginTop: "0"
          }}
        >
          <div className="section-head" style={{ marginBottom: "6px", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ margin: 0, marginBottom: "4px" }}>Notification Center</h3>
              <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.55 }}>
                Monitor all active job stages here, then handle admin-only actions below.
              </p></div><button className="ghost-button admin-action-button" onClick={() => setAdminView("dashboard")}>Back to Dashboard</button></div><div className="glass-subcard" style={{ padding: "14px 16px", borderRadius: "16px", marginTop: "0", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: "1rem" }}>Operational Quick Actions</div><div style={{ color: "#94a3b8", fontSize: "0.92rem", marginTop: "4px" }}>
                  All active jobs by current stage, next actor, and required follow-up.</div></div><div style={getLiveIndicatorStyle(operationalStageItems.length > 0)}>
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "999px",
                    background: operationalStageItems.length > 0 ? "#22c55e" : "#ef4444"
                  }}
                />
                {operationalStageItems.length > 0 ? "Live" : "None"}</div></div>{operationalStageItems.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                No active jobs are moving through the workflow right now.</div>) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {operationalStageItems.map((item) => (
                  <button
                    key={item.jobId}
                    type="button"
                    onClick={() => {
                      setJobFocusFilter("all");
                      setAdminView("dashboard");
                      setSuccess(`${item.title} is now highlighted in the main jobs list.`);
                    }}
                    className="ghost-button admin-action-button"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: "16px",
                      background: "rgba(15,23,42,0.38)",
                      border: "1px solid rgba(148,163,184,0.16)",
                      color: "#e2e8f0"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ minWidth: "260px", flex: "1 1 360px" }}>
                        <div style={{ color: item.tone, fontWeight: 900, marginBottom: "6px" }}>{item.stage}</div><div style={{ color: "#f8fafc", fontWeight: 800 }}>{item.title}</div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>{item.detail}</div></div><div style={{ minWidth: "200px", color: "#94a3b8", fontSize: "0.92rem" }}>
                        <div style={{ fontWeight: 800, color: "#94a3b8", marginBottom: "4px" }}>NEXT ACTION BY</div><div style={{ marginTop: "6px" }}>Client: {item.clientName}</div><div>Worker: {item.workerName}</div></div></div></button>
                ))}</div>)}</div>{filteredNotificationItems.length === 0 ? (
            <EmptyState title="No admin notifications right now" text="Notifications will appear here when jobs require admin action." />
          ) : (
<div className="card-stack" style={{ gap: "10px", marginTop: "8px" }}>
              {filteredNotificationItems.map((item) => (
                <div key={item.id} className="glass-subcard" style={{ padding: "14px 16px", borderRadius: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ minWidth: "260px", flex: "1 1 360px" }}>
                      <div style={{ color: item.tone || "#c4b5fd", fontWeight: 900, fontSize: "1rem" }}>{item.title}</div><div style={{ color: "#e2e8f0", marginTop: "8px" }}>{item.detail}</div></div>{item.onClick ? (
                      <button className="primary-button admin-action-button" onClick={item.onClick}>
                        {item.actionLabel || "Open"}
                      </button>
                    ) : null}</div></div>))}</div>)}</div>) : null}
      {adminView === "pending_worker_applications" ? (
        <div
          className="glass-card section-card"
          style={{
            padding: "16px 18px",
            borderRadius: "20px",
            minHeight: "unset",
            height: "auto",
            flex: "0 0 auto",
            alignSelf: "start",
            marginTop: "0"
          }}
        >
          <h3 style={{ margin: 0, marginBottom: "6px" }}>Pending Worker Applications</h3>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.55 }}>
            Vet, approve, defer, or mark incomplete using platform-styled modals.
          </p>

          <div style={{ marginTop: "12px" }}>
            {visiblePendingWorkerApplications.length === 0 ? (
              <div style={{ marginTop: "8px" }}>
                <EmptyState
                  title="No pending worker applications"
                  text="Fresh worker onboarding requests will appear here. This screen is working even when there are no current applications to review."
                /></div>) : (
<div className="card-stack" style={{ gap: "12px" }}>
                {visiblePendingWorkerApplications.map((app) => (
                  <div key={app._id} className="glass-subcard" style={{ padding: "18px", borderRadius: "22px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                        alignItems: "flex-start"
                      }}
                    >
                      <div style={{ flex: "1 1 380px", minWidth: "280px" }}>
                        <div style={{ fontSize: "1.28rem", fontWeight: 900, color: "#f8fafc" }}>
                          {cleanText(app.fullName || "-")}</div><div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(app.phone || "-")}</div><div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(app.email || "-")}</div></div><div style={{ minWidth: "220px" }}>
                        <div style={{ color: "#fcd34d", fontWeight: 800 }}>
                          Status: {cleanText(app.status || "-")}</div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>
                          Applied: {formatDateTime(app.createdAt)}</div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>
                          Experience: {cleanText(app.yearsOfExperience || 0)} years</div></div></div><div style={{ marginTop: "14px" }}>
                      <ServiceSummaryBlock services={app.serviceCategories} /></div><div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
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
                            background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)"
                          }}
                        >
                          <div style={{ color, fontWeight: 800, marginBottom: "6px" }}>{label}</div><div style={{ color: "#f8fafc", lineHeight: 1.6 }}>{value}</div></div>))}</div>{renderWorkerUploadCards({ _id: app._id, applicationRecord: app })}

                    <div
                      style={{
                        marginTop: "12px",
                        padding: "12px 14px",
                        borderRadius: "16px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)"
                      }}
                    >
                      <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: "6px" }}>
                        Saved Pin Location</div>{app?.homeLocation?.googlePinUrl || app?.googlePinUrl || app?.locationPinUrl ? (
                        <>
                          <div style={{ color: "#e2e8f0", lineHeight: 1.6, wordBreak: "break-all", marginBottom: "10px" }}>
                            {app?.homeLocation?.googlePinUrl || app?.googlePinUrl || app?.locationPinUrl}</div><button
                            type="button"
                            className="ghost-button admin-action-button"
                            onClick={() =>
                              window.open(
                                app?.homeLocation?.googlePinUrl || app?.googlePinUrl || app?.locationPinUrl,
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            Open Saved Pin
                          </button>
                        </>
                      ) : (
                        <div style={{ color: "#94a3b8", lineHeight: 1.6 }}>
                          No saved worker location pin was submitted on this application.</div>)}</div><div className="action-row admin-action-stack" style={{ marginTop: "12px", flexWrap: "wrap" }}>
                      <button
                        className="primary-button admin-action-button"
                        style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16" }}
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAdminModal("approve_application", app, { adminReviewNotes: `Welcome to HomeCare. Your application has been approved and your worker access details are ready below.` }); }}
                      >
                        Approve
                      </button>

                      <button
                        className="ghost-button admin-action-button"
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAdminModal("incomplete_application", app, { adminReviewNotes: app?.adminReviewNotes || "Please complete the missing details highlighted below so admin can continue reviewing your application." }); }}
                      >
                        Incomplete Application
                      </button>

                      <button
                        className="ghost-button admin-action-button"
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAdminModal("reject_application", app, { rejectionReason: "" }); }}
                      >
                        Defer / Reject
                      </button></div>{cleanText(app.adminReviewNotes || "") !== "-" ? (
                      <div style={{ marginTop: "14px", color: "#fcd34d", fontWeight: 700 }}>
                        Latest Review Note: {cleanText(app.adminReviewNotes)}</div>) : null}</div>))}</div>)}</div></div>) : null}

      {adminView === "super_admin_management" ? (
        <div className="glass-card section-card" style={{ padding: "18px 20px", borderRadius: "22px" }}>
          <div className="section-head" style={{ marginBottom: "10px", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ margin: 0, marginBottom: "6px" }}>Super Admin Management</h3>
              <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.65 }}>
                Create, reset, deactivate, and reactivate admin operators with full super-admin approval.
              </p>
            </div>
            <button
              className="primary-button admin-action-button"
              onClick={() => {
                setAdminOperatorForm({ fullName: "", phone: "", email: "", adminPassword: "" });
                setModalState({ open: true, type: "create_admin_operator", payload: null });
              }}
            >
              Create Admin Operator
            </button>
          </div>

          <div className="card-stack" style={{ gap: "12px" }}>
            {adminAccounts.length === 0 ? (
              <EmptyState
                title="No admin operators found"
                text="Create the first admin operator here. This area is reserved for super admin actions only."
              />
            ) : (
              adminAccounts.map((admin) => (
                <div key={admin._id || admin.id || admin.email} className="glass-subcard" style={{ padding: "16px", borderRadius: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ minWidth: "260px", flex: "1 1 360px" }}>
                      <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: "1.08rem" }}>{cleanText(admin.fullName || admin.name || "Admin Operator")}</div>
                      <div style={{ color: "#cbd5e1", marginTop: "6px" }}>{cleanText(admin.phone || "-")}</div>
                      <div style={{ color: "#cbd5e1", marginTop: "4px" }}>{cleanText(admin.email || "-")}</div>
                      <div style={{ color: isAdminOperatorActive(admin) ? "#86efac" : "#fca5a5", fontWeight: 800, marginTop: "8px" }}>
                        Status: {isAdminOperatorActive(admin) ? "active" : "deactivated"}
                      </div>
                      <div
                        style={{
                          marginTop: "12px",
                          padding: "12px 14px",
                          borderRadius: "14px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.03) 100%)"
                        }}
                      >
                        <div style={{ color: "#22d3ee", fontWeight: 800, marginBottom: "6px" }}>Admin Audit Log</div>
                        <div style={{ color: "#f8fafc", lineHeight: 1.75 }}>
                          {`Created: ${formatDateTime(admin?.createdAt)} | Updated: ${formatDateTime(admin?.updatedAt)} | Last Password Reset: ${formatDateTime(admin?.lastPasswordResetAt || admin?.passwordResetAt)} | Deactivated At: ${formatDateTime(admin?.deactivatedAt || admin?.deletedAt || admin?.disabledAt)} | Deactivation Reason: ${cleanText(admin?.deactivationReason || admin?.disabledReason || admin?.reason || "-")} | Reactivated At: ${formatDateTime(admin?.reactivatedAt || admin?.restoredAt)} | Reactivation Note: ${cleanText(admin?.reactivationNote || admin?.restoredNote || admin?.note || "-")}`}
                        </div>
                      </div>
                    </div>

                    <div className="action-row admin-action-stack" style={{ gap: "10px", flexWrap: "wrap", minWidth: "260px" }}>
                      <button
                        className="ghost-button admin-action-button"
                        onClick={() => {
                          setAdminOperatorActionForm({ adminPassword: "", reason: "", note: "" });
                          setModalState({ open: true, type: "reset_admin_password", payload: admin });
                        }}
                      >
                        Reset Password
                      </button>

                      {!isAdminOperatorActive(admin) ? (
                        <button
                          className="primary-button admin-action-button"
                          style={{ background: "#22c55e", borderColor: "#22c55e", color: "#052e16" }}
                          onClick={() => {
                            setAdminOperatorActionForm({ adminPassword: "", reason: "", note: "" });
                            setModalState({ open: true, type: "reactivate_admin", payload: admin });
                          }}
                        >
                          Reactivate Admin
                        </button>
                      ) : (
                        <button
                          className="primary-button admin-action-button"
                          style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}
                          onClick={() => {
                            setAdminOperatorActionForm({ adminPassword: "", reason: "", note: "" });
                            setModalState({ open: true, type: "deactivate_admin", payload: admin });
                          }}
                        >
                          Deactivate Admin
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

{adminView === "my_password" ? (
  <div className="glass-card section-card" style={{ padding: "18px 20px", borderRadius: "22px" }}>
    <h3 style={{ marginBottom: "10px" }}>Change My Password</h3>
    <p style={{ color: "#cbd5e1", lineHeight: 1.7, marginBottom: "14px" }}>
      Update your current admin password here. Your new password should be private and hard to guess.
    </p>

    <div className="details-grid" style={{ gridTemplateColumns: "1fr", gap: "14px" }}>
      <label className="field">
        <span>Current Password</span>
        <input
          type={showPasswordChangeValues ? "text" : "password"}
          value={passwordChangeForm.currentPassword}
          onChange={(e) => setPasswordChangeForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
        />
      </label>

      <label className="field">
        <span>New Password</span>
        <input
          type={showPasswordChangeValues ? "text" : "password"}
          value={passwordChangeForm.newPassword}
          onChange={(e) => setPasswordChangeForm((prev) => ({ ...prev, newPassword: e.target.value }))}
        />
      </label>

      <label className="field">
        <span>Confirm New Password</span>
        <input
          type={showPasswordChangeValues ? "text" : "password"}
          value={passwordChangeForm.confirmPassword}
          onChange={(e) => setPasswordChangeForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
        />
      </label>

      <label className="check-field" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <input
          type="checkbox"
          checked={showPasswordChangeValues}
          onChange={(e) => setShowPasswordChangeValues(e.target.checked)}
        />
        <span>Show password values</span>
      </label>
    </div>

    {passwordChangeResult ? (
      <div style={{
        marginTop: "14px",
        padding: "12px 14px",
        borderRadius: "14px",
        background: passwordChangeResult.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        border: passwordChangeResult.type === "success" ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(239,68,68,0.28)",
        color: passwordChangeResult.type === "success" ? "#bbf7d0" : "#fecaca",
        fontWeight: 700,
        lineHeight: 1.7
      }}>
        {passwordChangeResult.message}
      </div>
    ) : null}

    <div className="action-row admin-action-stack" style={{ marginTop: "18px", flexWrap: "wrap" }}>
      <button className="primary-button admin-action-button" onClick={submitMyPasswordChange} disabled={isBusy}>
        {isBusy ? "Saving..." : "Change Password"}
      </button>
      <button
        className="ghost-button admin-action-button"
        onClick={() => {
          setPasswordChangeForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
          setPasswordChangeResult(null);
          setShowPasswordChangeValues(false);
          setAdminView("dashboard");
        }}
      >
        Done / Go to Dashboard
      </button>
    </div>
  </div>
) : null}
{modalState.open && modalState.type === "unlock_super_admin_panel" ? (
        <ModalShell title="Unlock Super Admin Management" onClose={resetModal}>
          <p style={{ color: "#cbd5e1", marginBottom: "10px", lineHeight: 1.7 }}>
            Enter super admin password to open the protected admin management panel.
          </p>

          <label className="field">
            <span>Super Admin Password</span>
            <input
              type="password"
              value={modalForm.password}
              onChange={(e) => setModalForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Enter super admin password"
            />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button className="primary-button admin-action-button" onClick={submitSuperAdminPanelUnlock}>
              Open Super Admin Panel
            </button></div></ModalShell>
      ) : null}

      {modalState.open && modalState.type === "create_admin_operator" ? (
        <ModalShell title="Create Admin Operator" onClose={resetModal} width={760}>
          <div className="details-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
            <label className="field">
              <span>Full Name</span>
              <input value={adminOperatorForm.fullName} onChange={(e) => setAdminOperatorForm((prev) => ({ ...prev, fullName: e.target.value }))} />
            </label>

            <label className="field">
              <span>Phone</span>
              <input value={adminOperatorForm.phone} onChange={(e) => setAdminOperatorForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </label>

            <label className="field field-span-2">
              <span>Email</span>
              <input value={adminOperatorForm.email} onChange={(e) => setAdminOperatorForm((prev) => ({ ...prev, email: e.target.value }))} />
            </label>

            <label className="field field-span-2">
              <span>Super Admin Password Confirmation</span>
              <input type="password" value={adminOperatorForm.adminPassword} onChange={(e) => setAdminOperatorForm((prev) => ({ ...prev, adminPassword: e.target.value }))} />
            </label></div><div className="action-row admin-action-stack" style={{ marginTop: "18px" }}>
            <button className="primary-button admin-action-button" onClick={submitCreateAdminOperator} disabled={isBusy}>
              {isBusy ? "Creating..." : "Create Admin Operator"}
            </button>
            <button className="ghost-button admin-action-button" onClick={resetModal} disabled={isBusy}>
              Cancel
            </button></div></ModalShell>
      ) : null}

                              {modalState.open && modalState.type === "reset_client_password" ? (
        <ModalShell title={`Reset ${cleanText(modalState.payload?.fullName || "Client")} Password`} onClose={resetModal} width={620}>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(255,255,255,0.03) 100%)",
              border: "1px solid rgba(59,130,246,0.20)",
              color: "#dbe7f5",
              lineHeight: 1.7
            }}
          >
            Generate a fresh temporary password for this client. Share it securely after it is generated.
          </div>

          {error ? (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                borderRadius: "14px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.28)",
                color: "#fecaca",
                lineHeight: 1.7,
                fontWeight: 700
              }}
            >
              {error}
            </div>
          ) : null}

          <label className="field" style={{ marginTop: "14px", display: "block" }}>
            <span>Admin Password Confirmation</span>
            <input
              type="password"
              value={adminOperatorActionForm.adminPassword}
              onChange={(e) => setAdminOperatorActionForm((prev) => ({ ...prev, adminPassword: e.target.value }))}
              placeholder="Enter your current admin password"
            />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px" }}>
            <button className="primary-button admin-action-button" onClick={submitResetClientPassword} disabled={isBusy}>
              {isBusy ? "Resetting..." : "Generate New Password"}
            </button>
            <button className="ghost-button admin-action-button" onClick={resetModal} disabled={isBusy}>
              Cancel
            </button>
          </div>
        </ModalShell>
      ) : null}

      {clientResetPasswordResult ? (
        <ModalShell title="Client Password Reset Complete" onClose={() => setClientResetPasswordResult(null)} width={760}>
          <div style={{ color: "#dbe7f5", lineHeight: 1.8 }}>
            <div style={{ marginBottom: "10px" }}>
              Review the generated credentials below, then share them securely with the client before closing this card.
            </div>
            <FieldRow label="Client" value={cleanText(clientResetPasswordResult?.clientName || "-")} />
            <FieldRow label="Phone" value={cleanText(clientResetPasswordResult?.phone || "-")} />
            <FieldRow label="Email" value={cleanText(clientResetPasswordResult?.email || "-")} />
            <FieldRow label="Temporary Password" value={cleanText(clientResetPasswordResult?.temporaryPassword || "-")} valueColor="#fcd34d" />
          </div>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button admin-action-button"
              style={{ background: CLIENT_BLUE, borderColor: CLIENT_BLUE, color: "#eff6ff" }}
              onClick={() => {
                const message = [
                  `Hello ${cleanText(clientResetPasswordResult?.clientName || "Client")},`,
                  "",
                  "Your HomeCare client password has been reset successfully.",
                  `Temporary password: ${cleanText(clientResetPasswordResult?.temporaryPassword || "-")}`,
                  "",
                  "Use this temporary password to sign in successfully.",
                  "Immediately after login, go to Reset Password / Change Password and set your own new private password.",
                  "Do not continue using this temporary password after login."
                ].join("\n");
                const url = getWhatsAppUrl(clientResetPasswordResult?.phone || "", message);
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              Send WhatsApp
            </button>

            <button
              type="button"
              className="ghost-button admin-action-button"
              onClick={() => {
                const subject = encodeURIComponent("HomeCare Client Password Reset");
                const body = encodeURIComponent([
                  `Hello ${cleanText(clientResetPasswordResult?.clientName || "Client")},`,
                  "",
                  "Your HomeCare client password has been reset successfully.",
                  `Temporary password: ${cleanText(clientResetPasswordResult?.temporaryPassword || "-")}`,
                  "",
                  "Use this temporary password to sign in successfully.",
                  "Immediately after login, go to Reset Password / Change Password and set your own new private password.",
                  "Do not continue using this temporary password after login."
                ].join("\n"));
                window.open(`mailto:${encodeURIComponent(clientResetPasswordResult?.email || "")}?subject=${subject}&body=${body}`, "_self");
              }}
            >
              Send Email
            </button>

            <button
              type="button"
              className="ghost-button admin-action-button"
              onClick={() => navigator.clipboard.writeText(String(clientResetPasswordResult?.temporaryPassword || ""))}
            >
              Copy Password
            </button>

            <button className="primary-button admin-action-button" onClick={() => setClientResetPasswordResult(null)}>
              Done
            </button>
          </div>
        </ModalShell>
      ) : null}
{modalState.open && modalState.type === "reset_worker_password" ? (
        <ModalShell title={`Reset ${cleanText(modalState.payload?.fullName || "Worker")} Password`} onClose={resetModal} width={620}>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(255,255,255,0.03) 100%)",
              border: "1px solid rgba(99,102,241,0.20)",
              color: "#dbe7f5",
              lineHeight: 1.7
            }}
          >
            Generate a fresh temporary password for this worker. Share it securely after it is generated.
          </div>

          {error ? (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                borderRadius: "14px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.28)",
                color: "#fecaca",
                lineHeight: 1.7,
                fontWeight: 700
              }}
            >
              {error}
            </div>
          ) : null}

          <label className="field" style={{ marginTop: "14px", display: "block" }}>
            <span>Admin Password Confirmation</span>
            <input
              type="password"
              value={adminOperatorActionForm.adminPassword}
              onChange={(e) => setAdminOperatorActionForm((prev) => ({ ...prev, adminPassword: e.target.value }))}
              placeholder="Enter your current admin password"
            />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px" }}>
            <button className="primary-button admin-action-button" onClick={submitResetWorkerPassword} disabled={isBusy}>
              {isBusy ? "Resetting..." : "Generate New Password"}
            </button>
            <button className="ghost-button admin-action-button" onClick={resetModal} disabled={isBusy}>
              Cancel
            </button>
          </div>
        </ModalShell>
      ) : null}

            {workerResetPasswordResult ? (
        <ModalShell title="Worker Password Reset Complete" onClose={() => setWorkerResetPasswordResult(null)} width={760}>
          <div style={{ color: "#dbe7f5", lineHeight: 1.8 }}>
            <div style={{ marginBottom: "10px" }}>
              Review the generated credentials below, then share them securely with the worker before closing this card.
            </div>
            <FieldRow label="Worker" value={cleanText(workerResetPasswordResult?.workerName || "-")} />
            <FieldRow label="Phone" value={cleanText(workerResetPasswordResult?.phone || "-")} />
            <FieldRow label="Email" value={cleanText(workerResetPasswordResult?.email || "-")} />
            <FieldRow label="Temporary Password" value={cleanText(workerResetPasswordResult?.temporaryPassword || "-")} valueColor="#fcd34d" />
          </div>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button admin-action-button"
              style={{ background: WORKER_ORANGE, borderColor: WORKER_ORANGE, color: "#111827" }}
              onClick={() => {
                const message = [
                  `Hello ${cleanText(workerResetPasswordResult?.workerName || "Worker")},`,
                  "",
                  "Your HomeCare worker password has been reset successfully.",
                  `Temporary password: ${cleanText(workerResetPasswordResult?.temporaryPassword || "-")}`,
                  "",
                  "Use this temporary password to sign in successfully.","Immediately after login, go to Reset Password / Change Password and set your own new private password.","Do not continue using this temporary password after login."
                ].join("\n");
                const url = getWhatsAppUrl(workerResetPasswordResult?.phone || "", message);
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              Send WhatsApp
            </button>

            <button
              type="button"
              className="ghost-button admin-action-button"
              onClick={() => {
                const subject = encodeURIComponent("HomeCare Worker Password Reset");
                const body = encodeURIComponent([
                  `Hello ${cleanText(workerResetPasswordResult?.workerName || "Worker")},`,
                  "",
                  "Your HomeCare worker password has been reset successfully.",
                  `Temporary password: ${cleanText(workerResetPasswordResult?.temporaryPassword || "-")}`,
                  "",
                  "Use this temporary password to sign in successfully.","Immediately after login, go to Reset Password / Change Password and set your own new private password.","Do not continue using this temporary password after login."
                ].join("\n"));
                window.open(`mailto:${encodeURIComponent(workerResetPasswordResult?.email || "")}?subject=${subject}&body=${body}`, "_self");
              }}
            >
              Send Email
            </button>

            <button
              type="button"
              className="ghost-button admin-action-button"
              onClick={() => navigator.clipboard.writeText(String(workerResetPasswordResult?.temporaryPassword || ""))}
            >
              Copy Password
            </button>

            <button className="primary-button admin-action-button" onClick={() => setWorkerResetPasswordResult(null)}>
              Done
            </button>
          </div>
        </ModalShell>
      ) : null}
{modalState.open && modalState.type === "reset_admin_password" ? (
        <ModalShell title={`Reset ${cleanText(modalState.payload?.fullName || "Admin")} Password`} onClose={resetModal} width={620}>
          <label className="field">
            <span>Super Admin Password Confirmation</span>
            <input type="password" value={adminOperatorActionForm.adminPassword} onChange={(e) => setAdminOperatorActionForm((prev) => ({ ...prev, adminPassword: e.target.value }))} />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px" }}>
            <button className="primary-button admin-action-button" onClick={submitResetAdminOperatorPassword} disabled={isBusy}>
              {isBusy ? "Resetting..." : "Generate New Password"}
            </button>
            <button className="ghost-button admin-action-button" onClick={resetModal} disabled={isBusy}>
              Cancel
            </button></div></ModalShell>
      ) : null}

      {modalState.open && modalState.type === "deactivate_admin" ? (
        <ModalShell title={`Deactivate ${cleanText(modalState.payload?.fullName || "Admin")}`} onClose={resetModal} width={680}>
          <label className="field">
            <span>Reason</span>
            <textarea rows="4" value={adminOperatorActionForm.reason} onChange={(e) => setAdminOperatorActionForm((prev) => ({ ...prev, reason: e.target.value }))} />
          </label>

          <label className="field">
            <span>Super Admin Password Confirmation</span>
            <input type="password" value={adminOperatorActionForm.adminPassword} onChange={(e) => setAdminOperatorActionForm((prev) => ({ ...prev, adminPassword: e.target.value }))} />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px" }}>
            <button className="primary-button admin-action-button" onClick={submitDeactivateAdminOperator} disabled={isBusy}>
              {isBusy ? "Deactivating..." : "Deactivate Admin"}
            </button>
            <button className="ghost-button admin-action-button" onClick={resetModal} disabled={isBusy}>
              Cancel
            </button></div></ModalShell>
      ) : null}

      {modalState.open && modalState.type === "reactivate_admin" ? (
        <ModalShell title={`Reactivate ${cleanText(modalState.payload?.fullName || "Admin")}`} onClose={resetModal} width={680}>
          <label className="field">
            <span>Reactivation Note</span>
            <textarea rows="4" value={adminOperatorActionForm.note} onChange={(e) => setAdminOperatorActionForm((prev) => ({ ...prev, note: e.target.value }))} />
          </label>

          <label className="field">
            <span>Super Admin Password Confirmation</span>
            <input type="password" value={adminOperatorActionForm.adminPassword} onChange={(e) => setAdminOperatorActionForm((prev) => ({ ...prev, adminPassword: e.target.value }))} />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px" }}>
            <button className="primary-button admin-action-button" onClick={submitReactivateAdminOperator} disabled={isBusy}>
              {isBusy ? "Reactivating..." : "Reactivate Admin"}
            </button>
            <button className="ghost-button admin-action-button" onClick={resetModal} disabled={isBusy}>
              Cancel
            </button></div></ModalShell>
      ) : null}

      
            {modalState.open && modalState.type === "override_client_profile" ? (
        <ModalShell
          title={`Override ${cleanText(modalState.payload?.fullName || "Client")} Profile`}
          onClose={resetModal}
          width={920}
        >
          <div className="details-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
            <label className="field">
              <span>Full Name</span>
              <input name="fullName" value={overrideForm.fullName || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Phone</span>
              <input name="phone" value={overrideForm.phone || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Email</span>
              <input name="email" value={overrideForm.email || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>County</span>
              <input name="county" value={overrideForm.county || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Town</span>
              <input name="town" value={overrideForm.town || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Estate</span>
              <input name="estate" value={overrideForm.estate || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Address Line</span>
              <input name="addressLine" value={overrideForm.addressLine || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>House Details</span>
              <input name="houseDetails" value={overrideForm.houseDetails || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Saved Pin URL</span>
              <input name="googleMapPinUrl" value={overrideForm.googleMapPinUrl || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Admin Override Note</span>
              <textarea
                name="adminNotes"
                rows="4"
                value={overrideForm.adminNotes || ""}
                onChange={handleOverrideFieldChange}
                placeholder="State what was changed and why"
              />
            </label>
          </div>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px", flexWrap: "wrap" }}>
            <button className="primary-button admin-action-button" onClick={handleSaveProfileOverride} disabled={isSavingOverride}>
              {isSavingOverride ? "Saving..." : "Save Client Override"}
            </button>
            <button className="ghost-button admin-action-button" onClick={resetModal} disabled={isSavingOverride}>
              Cancel
            </button>
          </div>
        </ModalShell>
      ) : null}
{modalState.open && modalState.type === "override_worker_profile" ? (
        <ModalShell
          title={`Override ${cleanText(modalState.payload?.fullName || "Worker")} Profile`}
          onClose={resetModal}
          width={920}
        >
          <div className="details-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
            <label className="field">
              <span>Full Name</span>
              <input name="fullName" value={overrideForm.fullName || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Phone</span>
              <input name="phone" value={overrideForm.phone || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Email</span>
              <input name="email" value={overrideForm.email || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>County</span>
              <input name="county" value={overrideForm.county || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Town</span>
              <input name="town" value={overrideForm.town || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Estate</span>
              <input name="estate" value={overrideForm.estate || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Address Line</span>
              <input name="addressLine" value={overrideForm.addressLine || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Saved Pin URL</span>
              <input name="googleMapPinUrl" value={overrideForm.googleMapPinUrl || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>National ID Number</span>
              <input name="nationalIdNumber" value={overrideForm.nationalIdNumber || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Years of Experience</span>
              <input name="yearsOfExperience" type="number" value={overrideForm.yearsOfExperience || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Service Categories (comma separated)</span>
              <textarea
                name="serviceCategories"
                rows="3"
                value={Array.isArray(overrideForm.serviceCategories) ? overrideForm.serviceCategories.join(", ") : (overrideForm.serviceCategories || "")}
                onChange={handleOverrideFieldChange}
              />
            </label>

            <label className="field">
              <span>Next of Kin Name</span>
              <input name="nextOfKinName" value={overrideForm.nextOfKinName || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Next of Kin Phone</span>
              <input name="nextOfKinPhone" value={overrideForm.nextOfKinPhone || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Next of Kin Relationship</span>
              <input name="nextOfKinRelationship" value={overrideForm.nextOfKinRelationship || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Emergency / Neighbor Contact</span>
              <input name="neighborFriendContact" value={overrideForm.neighborFriendContact || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Can Bring Own Supplies</span>
              <input name="canBringOwnSupplies" value={overrideForm.canBringOwnSupplies || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>Preferred Work Radius (KM)</span>
              <input name="preferredWorkRadiusKm" value={overrideForm.preferredWorkRadiusKm || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>M-Pesa Number</span>
              <input name="mpesaNumber" value={overrideForm.mpesaNumber || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field">
              <span>M-Pesa Registered Name</span>
              <input name="mpesaRegisteredName" value={overrideForm.mpesaRegisteredName || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Bank / Account Details</span>
              <input name="bankAccountDetails" value={overrideForm.bankAccountDetails || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Experience Summary</span>
              <textarea name="experienceSummary" rows="4" value={overrideForm.experienceSummary || ""} onChange={handleOverrideFieldChange} />
            </label>

            <label className="field field-span-2">
              <span>Admin Override Note</span>
              <textarea name="adminNotes" rows="4" value={overrideForm.adminNotes || ""} onChange={handleOverrideFieldChange} placeholder="State what was changed and why" />
            </label>
          </div>

          <div className="action-row admin-action-stack" style={{ marginTop: "18px", flexWrap: "wrap" }}>
            <button className="primary-button admin-action-button" onClick={handleSaveProfileOverride} disabled={isSavingOverride}>
              {isSavingOverride ? "Saving..." : "Save Worker Override"}
            </button>
            <button className="ghost-button admin-action-button" onClick={resetModal} disabled={isSavingOverride}>
              Cancel
            </button>
          </div>
        </ModalShell>
      ) : null}

{modalState.open && modalState.type === "delete_client" ? (
        <ModalShell
          title={`Delete ${cleanText(modalState.payload?.fullName || "client")} Account`}
          onClose={resetModal}
        >
          <p style={{ color: "#fecaca", marginBottom: "12px", fontWeight: 700 }}>
            This deactivates the client account, removes it from the active client directory, and keeps it under deactivated clients for admin control.
          </p>

          <label className="field">
            <span>Deactivation Reason</span>
            <textarea
              rows="4"
              value={modalForm.reason}
              onChange={(e) => setModalForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="State clearly why this client account is being deactivated"
            />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button
              className="primary-button admin-action-button"
              style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
              onClick={submitDeleteClient}
            >
              Deactivate Client Account
            </button></div></ModalShell>
      ) : null}

      {modalState.open && modalState.type === "incomplete_application" ? (
        <ModalShell title="Mark Application Incomplete" onClose={resetModal} width={760}>
          <div
            style={{
              marginBottom: "10px",
              padding: "14px 16px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, rgba(248,113,113,0.10), rgba(255,255,255,0.03))",
              border: "1px solid rgba(248,113,113,0.18)",
              color: "#fecaca",
              lineHeight: 1.7
            }}
          >
            <strong>Auto-detected missing fields:</strong>{" "}
            {Array.isArray(modalState.payload?.missingFields) && modalState.payload.missingFields.length
              ? modalState.payload.missingFields.join(", ")
              : "No missing fields were auto-detected, but admin can still request corrections."}</div><label className="field">
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
              borderRadius: "14px",
              background: "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(255,255,255,0.03))",
              border: "1px solid rgba(96,165,250,0.16)",
              color: "#dbe7f5",
              lineHeight: 1.7
            }}
          >
            Message preview:<br />
            {buildApplicationIncompleteMessage(modalState.payload, modalForm.adminReviewNotes || "please review your application details")}</div><div className="action-row admin-action-stack" style={{ marginTop: "12px", flexWrap: "wrap" }}>
            <button className="primary-button admin-action-button" onClick={() => submitApplicationReview("needs_more_info")}>
              Save Incomplete Response
            </button>

            <button
              className="ghost-button admin-action-button"
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
              className="ghost-button admin-action-button"
              onClick={() => {
                const app = modalState.payload;
                const subject = encodeURIComponent("HomeCare Worker Application - Incomplete Details");
                const body = encodeURIComponent(buildApplicationIncompleteMessage(app, modalForm.adminReviewNotes || "please review your application details"));
                window.open(getGmailComposeUrl(app?.email || "", subject, body), "_blank", "noopener,noreferrer");
              }}
            >
              Send via Email
            </button></div></ModalShell>
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
          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button className="primary-button admin-action-button" style={{ background: DANGER_RED, borderColor: DANGER_RED }} onClick={() => submitApplicationReview("rejected")}>
              Reject Application
            </button></div></ModalShell>
      ) : null}

      
      {modalState.open && modalState.type === "unlock_activities" ? (
        <ModalShell title="Unlock Activities Today" onClose={resetModal}>
          <p style={{ color: "#cbd5e1", marginBottom: "10px", lineHeight: 1.7 }}>
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

          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button className="primary-button admin-action-button" onClick={submitActivitiesUnlock}>
              Unlock Activities
            </button></div></ModalShell>
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

          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button
              className="primary-button admin-action-button"
              style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
              onClick={submitSuspendWorker}
            >
              Suspend Worker
            </button></div></ModalShell>
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

          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button
              className="primary-button admin-action-button"
              style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16" }}
              onClick={submitReactivateWorker}
            >
              Reactivate Worker
            </button></div></ModalShell>
      ) : null}


            {modalState.open && modalState.type === "suspend_client" ? (
        <ModalShell title={`Suspend ${cleanText(modalState.payload?.fullName || "client")}`} onClose={resetModal}>
          <p style={{ color: "#fecaca", marginBottom: "12px", fontWeight: 700 }}>
            State clearly why this client is being suspended.
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

          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button
              className="primary-button admin-action-button"
              style={{ background: WARNING_AMBER, borderColor: WARNING_AMBER, color: "#111827" }}
              onClick={submitSuspendClient}
            >
              Suspend Client
            </button>
          </div>
        </ModalShell>
      ) : null}
{modalState.open && modalState.type === "reactivate_client" ? (
        <ModalShell title={`Reactivate ${cleanText(modalState.payload?.fullName || "client")}`} onClose={resetModal}>
          <p style={{ color: "#bbf7d0", marginBottom: "12px", fontWeight: 700 }}>
            Reactivate this client so their account returns to the active client directory and attached jobs can continue normally.
          </p>

          <label className="field">
            <span>Reason for Reactivation</span>
            <textarea
              rows="4"
              value={modalForm.resolutionNote}
              onChange={(e) => setModalForm((prev) => ({ ...prev, resolutionNote: e.target.value }))}
              placeholder="State clearly why this client account is being reactivated"
            />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button
              className="primary-button admin-action-button"
              style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16" }}
              onClick={submitReactivateClient}
            >
              Reactivate Client
            </button></div></ModalShell>
      ) : null}


      {modalState.open && modalState.type === "delete_worker" ? (
        <ModalShell title={`Deactivate ${cleanText(modalState.payload?.fullName || "worker")} Account`} onClose={resetModal}>
          <p style={{ color: "#fecaca", marginBottom: "12px", fontWeight: 700 }}>
            This deactivates the worker account, removes it from the active worker directory, and keeps it under deactivated workers for admin control.
          </p>

          <label className="field">
            <span>Deactivation Reason</span>
            <textarea
              rows="4"
              value={modalForm.reason}
              onChange={(e) => setModalForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="State why this worker account is being deactivated"
            />
          </label>

          <div className="action-row admin-action-stack" style={{ marginTop: "14px" }}>
            <button
              className="primary-button admin-action-button"
              style={{ background: DANGER_RED, borderColor: DANGER_RED, color: "#fff" }}
              onClick={submitDeleteWorker}
            >
              Deactivate Worker Account
            </button></div></ModalShell>
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
              borderRadius: "14px",
              background: "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(255,255,255,0.03))",
              border: "1px solid rgba(34,197,94,0.18)",
              color: "#dcfce7",
              lineHeight: 1.7
            }}
          >
            On approval the system will generate a fresh password, create the worker account, and open the approval result card with WhatsApp and Email onboarding options.</div><div className="action-row admin-action-stack" style={{ marginTop: "12px" }}>
            <button
              className="primary-button admin-action-button"
              style={{ background: SUCCESS_GREEN, borderColor: SUCCESS_GREEN, color: "#052e16" }}
              onClick={() => submitApplicationReview("approved")}
            >
              Approve Application
            </button></div></ModalShell>
      ) : null}


      
      {adminCredentialsResult ? (
        <ModalShell title="Admin Operator Created Successfully" onClose={() => setAdminCredentialsResult(null)} width={760}>
          <FieldRow label="Admin" value={cleanText(adminCredentialsResult?.admin?.fullName || "-")} />
          <FieldRow label="Phone" value={cleanText(adminCredentialsResult?.admin?.phone || "-")} />
          <FieldRow label="Email" value={cleanText(adminCredentialsResult?.admin?.email || "-")} />
          <div style={{ marginTop: "12px", color: "#cbd5e1", lineHeight: 1.7 }}>
            Credentials were generated successfully. Share them only through the approved delivery flow. Raw credentials are no longer displayed on this screen.</div><label className="field" style={{ marginTop: "12px", display: "block" }}>
            <span>Prefilled admin onboarding message</span>
            <textarea
              rows="8"
              value={[
                `Hello ${cleanText(adminCredentialsResult?.admin?.fullName || "Admin")},`,
                "",
                "Your HomeCare admin operator account has been created successfully.",
                `Sign-in identifier: ${cleanText(adminCredentialsResult?.admin?.email || adminCredentialsResult?.admin?.phone || "-")}`,
                `Temporary password: ${cleanText(adminCredentialsResult?.temporaryPassword || "-")}`,
                `Recovery key: ${cleanText(adminCredentialsResult?.recoveryKey || "-")}`,
                "",
                "Please sign in and change the temporary password immediately after your first login."
              ].join("\n")}
              readOnly
            />
          </label>

          <div style={{ marginTop: "10px", color: "#94a3b8", lineHeight: 1.7 }}>
            You can share details directly via the registered contacts.</div><div className="action-row admin-action-stack" style={{ marginTop: "16px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button admin-action-button"
              style={{ background: ADMIN_PURPLE, borderColor: ADMIN_PURPLE }}
              onClick={() => {
                const message = [
                  `Hello ${cleanText(adminCredentialsResult?.admin?.fullName || "Admin")},`,
                  "",
                  "Your HomeCare admin operator account has been created successfully.",
                  `Sign-in identifier: ${cleanText(adminCredentialsResult?.admin?.email || adminCredentialsResult?.admin?.phone || "-")}`,
                  `Temporary password: ${cleanText(adminCredentialsResult?.temporaryPassword || "-")}`,
                  `Recovery key: ${cleanText(adminCredentialsResult?.recoveryKey || "-")}`,
                  "",
                  "Please sign in and change the temporary password immediately after your first login."
                ].join("\n");
                const url = getWhatsAppUrl(adminCredentialsResult?.admin?.phone || "", message);
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              Send WhatsApp
            </button>

            <button
              type="button"
              className="ghost-button admin-action-button"
              onClick={() => {
                const subject = encodeURIComponent("HomeCare Admin Operator Account Details");
                const body = encodeURIComponent([
                  `Hello ${cleanText(adminCredentialsResult?.admin?.fullName || "Admin")},`,
                  "",
                  "Your HomeCare admin operator account has been created successfully.",
                  `Sign-in identifier: ${cleanText(adminCredentialsResult?.admin?.email || adminCredentialsResult?.admin?.phone || "-")}`,
                  `Temporary password: ${cleanText(adminCredentialsResult?.temporaryPassword || "-")}`,
                  `Recovery key: ${cleanText(adminCredentialsResult?.recoveryKey || "-")}`,
                  "",
                  "Please sign in and change the temporary password immediately after your first login."
                ].join("\n"));
                window.open(`mailto:${encodeURIComponent(adminCredentialsResult?.admin?.email || "")}?subject=${subject}&body=${body}`, "_self");
              }}
            >
              Send Email
            </button>

            <button className="primary-button admin-action-button" onClick={() => setAdminCredentialsResult(null)}>
              Done
            </button></div></ModalShell>
      ) : null}

      {resetAdminPasswordResult ? (
        <ModalShell title="Admin Password Reset Successfully" onClose={() => setResetAdminPasswordResult(null)} width={760}>
          <FieldRow label="Admin" value={cleanText(resetAdminPasswordResult?.fullName || "-")} />
          <FieldRow label="Phone" value={cleanText(resetAdminPasswordResult?.phone || "-")} />
          <FieldRow label="Email" value={cleanText(resetAdminPasswordResult?.email || "-")} />
          <div style={{ marginTop: "12px", color: "#cbd5e1", lineHeight: 1.7 }}>
            A fresh temporary password was generated successfully. Deliver it only through the approved recovery channel. Raw credentials are no longer displayed on this screen.</div><label className="field" style={{ marginTop: "12px", display: "block" }}>
            <span>Prefilled admin recovery message</span>
            <textarea
              rows="7"
              value={[
                `Hello ${cleanText(resetAdminPasswordResult?.fullName || "Admin")},`,
                "",
                "Your HomeCare admin password has been reset successfully.",
                `Temporary password: ${cleanText(resetAdminPasswordResult?.temporaryPassword || "-")}`,
                "",
                "Use this temporary password to sign in successfully.","Immediately after login, go to Reset Password / Change Password and set your own new private password.","Do not continue using this temporary password after login."
              ].join("\n")}
              readOnly
            />
          </label>

          <div style={{ marginTop: "10px", color: "#94a3b8", lineHeight: 1.7 }}>
            You can share details directly via the registered contacts.</div><div className="action-row admin-action-stack" style={{ marginTop: "16px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button admin-action-button"
              style={{ background: ADMIN_PURPLE, borderColor: ADMIN_PURPLE }}
              onClick={() => {
                const message = [
                  `Hello ${cleanText(resetAdminPasswordResult?.fullName || "Admin")},`,
                  "",
                  "Your HomeCare admin password has been reset successfully.",
                  `Temporary password: ${cleanText(resetAdminPasswordResult?.temporaryPassword || "-")}`,
                  "",
                  "Use this temporary password to sign in successfully.","Immediately after login, go to Reset Password / Change Password and set your own new private password.","Do not continue using this temporary password after login."
                ].join("\n");
                const url = getWhatsAppUrl(resetAdminPasswordResult?.phone || "", message);
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              Send WhatsApp
            </button>

            <button
              type="button"
              className="ghost-button admin-action-button"
              onClick={() => {
                const subject = encodeURIComponent("HomeCare Admin Password Reset");
                const body = encodeURIComponent([
                  `Hello ${cleanText(resetAdminPasswordResult?.fullName || "Admin")},`,
                  "",
                  "Your HomeCare admin password has been reset successfully.",
                  `Temporary password: ${cleanText(resetAdminPasswordResult?.temporaryPassword || "-")}`,
                  "",
                  "Use this temporary password to sign in successfully.","Immediately after login, go to Reset Password / Change Password and set your own new private password.","Do not continue using this temporary password after login."
                ].join("\n"));
                window.open(`mailto:${encodeURIComponent(resetAdminPasswordResult?.email || "")}?subject=${subject}&body=${body}`, "_self");
              }}
            >
              Send Email
            </button>

            <button className="primary-button admin-action-button" onClick={() => setResetAdminPasswordResult(null)}>
              Done
            </button></div></ModalShell>
      ) : null}

      {approvalResult ? (
  <ModalShell title="Worker Approved Successfully" onClose={closeApprovalResult} width={820}>
    <div style={{ color: "#dbe7f5", lineHeight: 1.8 }}>
      <div style={{ marginBottom: "10px" }}>
        Review the generated credentials below, then send them to the worker before closing this card.</div><FieldRow label="Worker" value={cleanText(approvalResult.workerUser?.fullName || approvalResult.application?.fullName || "-")} />
      <FieldRow label="Phone" value={cleanText(approvalResult.workerUser?.phone || approvalResult.application?.phone || "-")} />
      <FieldRow label="Email" value={cleanText(approvalResult.application?.email || approvalResult.workerUser?.email || "-")} />
      <FieldRow label="Password" value={cleanText(approvalResult.tempPassword || "-")} valueColor="#fcd34d" />
<FieldRow label="Recovery Key" value={cleanText(approvalResult.recoveryKey || "-")} valueColor="#60a5fa" /></div><label className="field" style={{ marginTop: "12px", display: "block" }}>
      <span>Prefilled onboarding message</span>
      <textarea
        rows="8"
        value={approvalMessage}
        onChange={(e) => setApprovalMessage(e.target.value)}
        placeholder="Approval message for the worker"
      />
    </label>

    <div style={{ marginTop: "14px", color: "#cbd5e1", lineHeight: 1.7 }}>
      Admin does not store or retain access to autogenerated passwords. The worker should change this password after first login. If forgotten later, the Forgot Password flow should generate a fresh one.</div><div className="action-row admin-action-stack" style={{ marginTop: "12px", flexWrap: "wrap" }}>
      <button
        type="button"
        className="primary-button admin-action-button"
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
        className="ghost-button admin-action-button"
        onClick={() => {
          const subject = encodeURIComponent("Welcome to HomeCare - Worker Account Approved");
          const body = encodeURIComponent(approvalMessage);
          window.open(`mailto:${approvalResult.application?.email || approvalResult.workerUser?.email || ""}?subject=${subject}&body=${body}`, "_blank");
        }}
      >
        Send Email
      </button>

      <button type="button" className="ghost-button admin-action-button" onClick={closeApprovalResult}>
        Done - Close Card
      </button></div></ModalShell>
) : null}

      {showPayWorkerModal && payWorkerJob ? (
        <ModalShell title="Confirm Worker Payout" onClose={closePayWorkerModal} width={720}>
          <div style={{ display: "grid", gap: "10px" }}>
            <div className="glass-subcard" style={{ padding: "14px 16px", borderRadius: "14px" }}>
              <div style={{ color: "#93c5fd", fontWeight: 800, marginBottom: "6px" }}>Job</div><div style={{ color: "#f8fafc", fontWeight: 800 }}>{cleanText(payWorkerJob?.title || "-")}</div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>
                Worker: {cleanText(payWorkerJob?.assignedWorker?.fullName || "-")}</div><div style={{ color: "#cbd5e1", marginTop: "6px" }}>
                Worker M-Pesa Number: {cleanText(payWorkerJob?.assignedWorker?.phone || "-")}</div></div><label className="field">
              <span>Amount to Pay Worker</span>
              <input
                type="number"
                value={payWorkerForm.amount}
                onChange={(e) => setPayWorkerForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="Enter payout amount"
              />
            </label>

            <label className="field">
              <span>M-Pesa Message</span>
              <textarea
                rows="4"
                value={payWorkerForm.mpesaMessage}
                onChange={(e) => setPayWorkerForm((prev) => ({ ...prev, mpesaMessage: e.target.value }))}
                placeholder="Paste the exact M-Pesa payout confirmation message"
              />
            </label>

            <label className="field">
              <span>Admin Note (Optional)</span>
              <textarea
                rows="3"
                value={payWorkerForm.note}
                onChange={(e) => setPayWorkerForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Optional admin payout note"
              />
            </label>

            <div className="action-row admin-action-stack" style={{ marginTop: "8px", flexWrap: "wrap" }}>
              <button
                className="primary-button admin-action-button"
                disabled={actingJobId === payWorkerJob._id}
                onClick={submitPayWorker}
              >
                {actingJobId === payWorkerJob._id ? "Saving..." : "Confirm Payout"}
              </button>

              <button className="ghost-button admin-action-button" onClick={closePayWorkerModal}>
                Cancel
              </button></div></div></ModalShell>
      ) : null}

    </AppShell>
  );
}






































































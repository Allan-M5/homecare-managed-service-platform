import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/layout/AppShell";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuth } from "../../contexts/AuthContext";
import { updateMyClientProfileRequest } from "../../api/profileApi";
import {
  createClientJobRequest,
  getMyClientJobsRequest,
  acceptClientQuoteRequest,
  deferClientQuoteRequest,
  reportClientBalancePaidRequest,
  raiseClientJobIssueRequest,
  clientRespondExtraTimeRequest
} from "../../api/jobsApi";
import { http } from "../../api/http";

const initialForm = {
  serviceCategory: "",
  title: "",
  description: "",
  instructions: "",
  avoidNotes: "",
  budgetAmount: "",
  isBudgetNegotiable: true,
  expectedDurationHours: "",
  preferredStartAt: "",
  mustBeCompletedBy: "",
  county: "",
  town: "",
  estate: "",
  addressLine: "",
  houseDetails: "",
  latitude: "",
  longitude: "",
  googlePlaceId: "",
  googlePinUrl: ""
};

const initialPostJobState = {
  jobId: "",
  paymentProofText: "",
  rating: "5",
  comment: "",
  issueNotes: ""
};

function cleanText(value = "") {
  let text = String(value ?? "");

  const quickFixes = [
    [/â€™|’/g, "'"],
    [/â€œ|“/g, '"'],
    [/â€\u009d|”/g, '"'],
    [/â€“|–/g, "-"],
    [/â€”|—/g, " - "],
    [/\uFFFD/g, ""]
  ];

  for (const [pattern, replacement] of quickFixes) {
    text = text.replace(pattern, replacement);
  }

  for (let i = 0; i < 2; i += 1) {
    if (!/[â€™â€œâ€\u009d\uFFFD]/.test(text)) break;

    try {
      const decoded = decodeURIComponent(escape(text));
      if (decoded && decoded !== text) {
        text = decoded;
        continue;
      }
    } catch (_) {
      // ignore decode failures
    }

    break;
  }

  return text.replace(/\s+/g, " ").trim();
}

function cleanDisplayText(value = "") {
  return cleanText(value)
    .replace(/([A-Za-z0-9]{2,})'(?=[A-Za-z0-9]{2,})/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMoney(value) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function getVisibleBalance(job) {
  const paymentStatus = String(job?.payment?.paymentStatus || "unpaid").toLowerCase();
  const finalCharge = Number(job?.pricing?.finalClientChargeAmount || 0);
  const quotedBalance = Number(job?.payment?.balanceAmount || 0);

  if (paymentStatus === "paid_in_full") return 0;

  if (["deposit_paid", "client_reported_balance_payment"].includes(paymentStatus)) {
    return quotedBalance > 0 ? quotedBalance : finalCharge;
  }

  return finalCharge;
}

function getNextStep(job) {
  const paymentStatus = job?.payment?.paymentStatus || "unpaid";

  if (job?.status === "quote_pending_client") {
    return "Admin has sent a final quote. Review it and choose Accept Quote and Proceed or Defer Offer.";
  }

  if (job?.status === "quote_accepted_ready_for_dispatch" && !job?.assignedWorker?.fullName) {
    return "You accepted the quote. Admin is now expected to assign a worker.";
  }

  if (job?.status === "worker_accepted") {
    return "Worker has accepted the job and is preparing to leave for your location.";
  }

  if (job?.status === "worker_en_route") {
    return "Worker is on the way to your location.";
  }

  if (job?.status === "worker_arrived") {
    return "Worker has arrived on site and should clock in when actual work begins.";
  }

  if (job?.status === "work_in_progress") {
    return "Worker is currently serving you. Wait for clock out before payment confirmation.";
  }

  if (job?.status === "awaiting_admin_clearance" && paymentStatus === "client_reported_balance_payment") {
    return "You submitted payment proof. Admin is verifying receipt before worker release.";
  }

  if (job?.status === "awaiting_admin_clearance") {
    return "Worker has clocked out. Either pay the balance and paste the M-Pesa message, or raise an issue.";
  }

  if (job?.status === "issue_reported") {
    return "Issue has been raised. Admin is reviewing before worker release.";
  }

  if (job?.status === "issue_resolved" && paymentStatus !== "paid_in_full") {
    return "Issue resolved. Complete payment proof submission so admin can release the worker.";
  }

  if (job?.status === "issue_resolved" && paymentStatus === "paid_in_full") {
    return "Issue resolved and payment is complete. Admin should release the worker.";
  }

  if (job?.status === "completed") {
    return "This job has been completed and the worker was officially released.";
  }

  return "Follow the latest status and wait for the next platform update.";
}

function getLiveLocationPoint(source = {}) {
  const latCandidates = [source?.lat, source?.latitude, source?.coords?.lat, source?.coords?.latitude];
  const lngCandidates = [source?.lng, source?.lon, source?.longitude, source?.coords?.lng, source?.coords?.lon, source?.coords?.longitude];

  const lat = latCandidates.find((value) => Number.isFinite(Number(value)));
  const lng = lngCandidates.find((value) => Number.isFinite(Number(value)));

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  if (Math.abs(parsedLat) > 90 || Math.abs(parsedLng) > 180) return null;
  if (parsedLat === 0 && parsedLng === 0) return null;

  return { lat: parsedLat, lng: parsedLng };
}

function getClientExtraTimeState(job = {}) {
  const ext = job?.timeExtension || {};
  const activityLog = Array.isArray(job?.activityLog) ? job.activityLog : [];

  const status = String(ext?.status || "").trim().toLowerCase();
  const clientStatus = String(ext?.clientResponseStatus || ext?.clientDecision || "").trim().toLowerCase();

  const latestRequest = [...activityLog]
    .reverse()
    .find((entry) => String(entry?.type || "").trim().toLowerCase() === "worker_requested_extra_time");

  const latestClientResponse = [...activityLog]
    .reverse()
    .find((entry) =>
      ["client_approved_extra_time", "client_deferred_extra_time", "client_declined_extra_time"].includes(
        String(entry?.type || "").trim().toLowerCase()
      )
    );

  const latestRequestTime = new Date(latestRequest?.createdAt || latestRequest?.at || 0).getTime();
  const latestResponseTime = new Date(latestClientResponse?.createdAt || latestClientResponse?.at || 0).getTime();

  const noteSource = String(latestRequest?.note || ext?.reason || "");
  const noteMinutesMatch = noteSource.match(/requested\s+(\d+)\s+minutes/i);
  const requestedMinutes = Number(ext?.requestedMinutes || noteMinutesMatch?.[1] || 0);

  const reasonMatch = noteSource.match(/reason:\s*([^|]+)/i);
  const reason = cleanDisplayText(reasonMatch?.[1] || ext?.reason || noteSource || "-");

  const approved =
    ["approved"].includes(status) ||
    ["approved"].includes(clientStatus) ||
    String(latestClientResponse?.type || "").trim().toLowerCase() === "client_approved_extra_time";

  const declined =
    ["declined", "deferred", "rejected"].includes(status) ||
    ["declined", "deferred", "rejected"].includes(clientStatus) ||
    ["client_deferred_extra_time", "client_declined_extra_time"].includes(
      String(latestClientResponse?.type || "").trim().toLowerCase()
    );

  const pending =
    !approved &&
    !declined &&
    (
      ["requested", "pending", "pending_client", "awaiting_client_approval"].includes(status) ||
      ["requested", "pending", "pending_client", "awaiting_client_approval"].includes(clientStatus) ||
      (latestRequest && (!latestClientResponse || latestRequestTime > latestResponseTime))
    );

  return {
    isPending: pending,
    isApproved: approved,
    isRejected: declined,
    requestedMinutes,
    reason
  };
}

function getTimeline(job) {
  const items = [];
  const quoteTime = job?.pricing?.clientQuoteAcceptedAt
    ? new Date(new Date(job.pricing.clientQuoteAcceptedAt).getTime() - 1000)
    : (job?.pricing?.finalClientChargeAmount ? new Date(new Date(job.createdAt).getTime() + 1000) : null);

  if (job?.createdAt) {
    items.push({
      label: "Job created",
      time: job.createdAt,
      note: cleanDisplayText(job.description || job.serviceCategory || "Job created")
    });
  }

  if (quoteTime && Number(job?.pricing?.finalClientChargeAmount || 0) > 0) {
    items.push({
      label: "Admin sent final quote",
      time: quoteTime,
      note: cleanDisplayText(
        `${formatMoney(job.pricing?.finalClientChargeAmount || 0)}${job?.payment?.depositAmount ? ` | Deposit ${formatMoney(job.payment.depositAmount)}` : ""}${job?.pricing?.clientQuoteNotes ? ` | ${job.pricing.clientQuoteNotes}` : ""}`
      )
    });
  }

  if (job?.pricing?.clientQuoteAcceptedAt) {
    items.push({
      label: "You accepted the quote",
      time: job.pricing.clientQuoteAcceptedAt,
      note: "Admin can now assign a worker"
    });
  }

  if (job?.assignedAt) {
    items.push({
      label: "Worker assigned",
      time: job.assignedAt,
      note: cleanDisplayText(job.assignedWorker?.fullName || "Worker assigned")
    });
  }

  if (job?.workerAcceptedAt) {
    items.push({
      label: "Worker accepted the assignment",
      time: job.workerAcceptedAt,
      note: "Worker is now committed to your job"
    });
  }

  if (job?.enRouteAt) {
    items.push({
      label: "Worker left for site",
      time: job.enRouteAt,
      note: "Journey to your location started"
    });
  }

  if (job?.arrivedAt) {
    items.push({
      label: "Worker arrived",
      time: job.arrivedAt,
      note: "Worker reached your site"
    });
  }

  if (job?.startedAt) {
    items.push({
      label: "Work started",
      time: job.startedAt,
      note: "Worker clocked in"
    });
  }

  if (job?.completedAt) {
    items.push({
      label: "Work completed on site",
      time: job.completedAt,
      note: "Client payment confirmation or issue action is required"
    });
  }

  const paymentTime = job?.payment?.adminPaymentVerifiedAt || job?.payment?.clientReportedBalancePaidAt || job?.payment?.balancePaidAt;
  if (paymentTime) {
    items.push({
      label: "Service balance payment",
      time: paymentTime,
      note: cleanDisplayText(job?.payment?.clientPaymentProofText || "Balance payment recorded")
    });
  }

  if (job?.releasedAt) {
    items.push({
      label: "Worker released",
      time: job.releasedAt,
      note: "Job closed successfully"
    });
  }

  const activityItems = Array.isArray(job?.activityLog)
    ? job.activityLog
        .filter((entry) =>
          ["worker_requested_extra_time", "client_approved_extra_time", "client_deferred_extra_time"].includes(
            String(entry?.type || "").trim()
          )
        )
        .map((entry) => ({
          label: cleanDisplayText(entry?.title || "Timeline update"),
          time: entry?.createdAt,
          note: cleanDisplayText(entry?.note || "-")
        }))
    : [];

  return [...items, ...activityItems]
    .filter((item) => item.time)
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}


export default function ClientDashboardPage() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("client-dashboard-mobile-fix")) return;

    const style = document.createElement("style");
    style.id = "client-dashboard-mobile-fix";
    style.innerHTML = `
      @media (max-width: 768px) {
        .job-head {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 12px !important;
        }

        .badge-row {
          justify-content: flex-start !important;
          width: 100% !important;
        }

        .badge-row > * {
          max-width: 100%;
        }

        .client-job-card-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .client-job-card-grid > div {
          min-width: 0 !important;
        }

        .client-job-card-text,
        .client-job-card-text * {
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
          white-space: normal !important;
        }

        .client-history-head {
          flex-direction: column !important;
          align-items: flex-start !important;
        }

        .client-history-head .ghost-button {
          width: auto !important;
        }

        .client-dashboard-mobile-shell {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .client-dashboard-mobile-shell > * {
          min-width: 0 !important;
          width: 100% !important;
        }

        .client-job-card-grid div,
        .glass-card,
        .glass-subcard {
          min-width: 0 !important;
        }

        .action-row {
          flex-wrap: wrap !important;
        }

        .action-row > button,
        .action-row > a {
          width: 100% !important;
          min-width: 0 !important;
        }

        .form-grid,
        .details-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }

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

        input[type="datetime-local"] {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          display: block !important;
          box-sizing: border-box !important;
          -webkit-appearance: none !important;
          appearance: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const { user, profile, handleAccountDeletion, refreshCurrentUser, logout } = useAuth();

  const [form, setForm] = useState(initialForm);
  const [jobs, setJobs] = useState([]);
  const [postJob, setPostJob] = useState(initialPostJobState);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showDeferQuoteModal, setShowDeferQuoteModal] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deferQuoteReason, setDeferQuoteReason] = useState("");
  const [deferQuoteJob, setDeferQuoteJob] = useState(null);
  const [expandedMapJobId, setExpandedMapJobId] = useState("");
  const [clientView, setClientView] = useState("dashboard");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [actingJobId, setActingJobId] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [message, setMessage] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordValues, setShowPasswordValues] = useState(false);
  const [passwordChangeResult, setPasswordChangeResult] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const [profileForm, setProfileForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    county: "",
    town: "",
    estate: "",
    addressLine: "",
    houseDetails: ""
  });

  const sidebarExtra = (
    <div style={{ display: "grid", gap: "12px" }}>
      <button
        type="button"
        onClick={() => setClientView("dashboard")}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: "14px",
          background: clientView === "dashboard"
            ? "linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(255,255,255,0.04) 100%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.025) 100%)",
          border: clientView === "dashboard"
            ? "1px solid rgba(96,165,250,0.30)"
            : "1px solid rgba(255,255,255,0.10)",
          color: "#f8fafc",
          fontWeight: 800,
          textAlign: "left"
        }}
      >
        Dashboard
      </button>

      <button
        type="button"
        onClick={() => setClientView("password")}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: "14px",
          background: clientView === "password"
            ? "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(255,255,255,0.04) 100%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.025) 100%)",
          border: clientView === "password"
            ? "1px solid rgba(196,181,253,0.30)"
            : "1px solid rgba(255,255,255,0.10)",
          color: "#f8fafc",
          fontWeight: 800,
          textAlign: "left"
        }}
      >
        Change My Password
      </button>

      <button
        type="button"
        className="primary-button"
        onClick={logout}
        style={{ width: "100%" }}
      >
        Logout
      </button>

      <button
        type="button"
        onClick={() => {
          setDeletePassword("");
          setDeleteReason("");
          setShowDeleteModal(true);
        }}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, rgba(239,68,68,0.16) 0%, rgba(255,255,255,0.04) 100%)",
          border: "1px solid rgba(248,113,113,0.30)",
          color: "#fecaca",
          fontWeight: 800,
          letterSpacing: "0.01em"
        }}
      >
        Deactivate My Account
      </button>
    </div>
  );

  const loadJobs = async () => {
    try {
      const response = await getMyClientJobsRequest();
      setJobs(response.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load your jobs.");
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    const hasLiveJobs = jobs.some((job) =>
      [
        "worker_accepted",
        "worker_en_route",
        "worker_arrived",
        "work_in_progress",
        "awaiting_admin_clearance",
        "issue_reported",
        "issue_resolved"
      ].includes(String(job?.status || "").trim())
    );

    if (!hasLiveJobs) return undefined;

    const intervalId = window.setInterval(() => {
      loadJobs();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [jobs]);

  const stats = useMemo(() => {
    return {
      awaitingDecision: jobs.filter((job) => job.status === "quote_pending_client").length,
      awaitingPostJobAction: jobs.filter((job) => job.status === "awaiting_admin_clearance").length
    };
  }, [jobs]);

  const activeJobs = useMemo(() => {
    const activeStates = new Set([
      "pending_review",
      "quote_pending_client",
      "quote_accepted_ready_for_dispatch",
      "worker_accepted",
      "worker_en_route",
      "worker_arrived",
      "work_in_progress",
      "awaiting_admin_clearance",
      "issue_reported",
      "issue_resolved"
    ]);
    return jobs.filter((job) => activeStates.has(String(job?.status || "").trim()));
  }, [jobs]);

  const historyJobs = useMemo(() => {
    return jobs.filter((job) => !activeJobs.some((item) => item?._id === job?._id));
  }, [jobs, activeJobs]);

  const getClientActiveStatusLabel = (job) => {
    return cleanDisplayText(
      job?.status ||
      job?.assignmentStatus ||
      job?.pricing?.quoteStatus ||
      job?.reviewStatus ||
      "pending_review"
    );
  };

  const presentValue = (value, fallback = "Not yet available") => {
    const cleaned = cleanDisplayText(value || "");
    if (!cleaned || cleaned === " " || cleaned === "-" || cleaned === "   ") {
      return fallback;
    }
    return cleaned;
  };


  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleProfileFieldChange = (event) => {
    const { name, value } = event.target;
    setProfileForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleSaveClientProfile = async () => {
    setError("");
    setSuccess("");
    setMessage("");

    if (!String(profileForm.fullName || "").trim()) {
      setError("Full name is required.");
      return;
    }

    if (!String(profileForm.phone || "").trim()) {
      setError("Phone number is required.");
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateMyClientProfileRequest({
        fullName: String(profileForm.fullName || "").trim(),
        phone: String(profileForm.phone || "").trim(),
        email: String(profileForm.email || "").trim(),
        county: String(profileForm.county || "").trim(),
        town: String(profileForm.town || "").trim(),
        estate: String(profileForm.estate || "").trim(),
        addressLine: String(profileForm.addressLine || "").trim(),
        houseDetails: String(profileForm.houseDetails || "").trim()
      });
      await refreshCurrentUser();
      setSuccess("Profile updated successfully.");
      setShowEditProfileModal(false);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveClientPassword = async () => {
    const currentPassword = String(passwordForm.currentPassword || "").trim();
    const newPassword = String(passwordForm.newPassword || "").trim();
    const confirmPassword = String(passwordForm.confirmPassword || "").trim();

    setError("");
    setSuccess("");
    setMessage("");
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

    setIsChangingPassword(true);
    try {
      const response = await http.patch("/api/auth/change-password", {
        currentPassword,
        newPassword
      });

      const okMessage = response?.data?.message || "Password updated successfully.";
      setSuccess(okMessage);
      setPasswordChangeResult({
        type: "success",
        message: okMessage
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      setShowPasswordValues(false);
    } catch (err) {
      const failMessage = err?.response?.data?.message || "Failed to change password.";
      setError(failMessage);
      setPasswordChangeResult({
        type: "error",
        message: failMessage
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const generatedTitle =
        form.title?.trim() ||
        `${form.serviceCategory.replace(/_/g, " ")} - ${form.estate || form.town || "Client Request"}`;

      await createClientJobRequest({
        ...form,
        title: generatedTitle,
        budgetAmount: Number(form.budgetAmount),
        expectedDurationHours: Number(form.expectedDurationHours),
        preferredStartAt: new Date(form.preferredStartAt).toISOString(),
        mustBeCompletedBy: form.mustBeCompletedBy ? new Date(form.mustBeCompletedBy).toISOString() : null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        photoUrls: []
      });

      setMessage("Job created successfully.");
      setForm((current) => ({
        ...initialForm,
        estate: current.estate,
        addressLine: current.addressLine,
        houseDetails: current.houseDetails,
        latitude: current.latitude,
        longitude: current.longitude,
        googlePinUrl: current.googlePinUrl
      }));
      await loadJobs();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create job.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptQuote = async (jobId) => {
    setError("");
    setSuccess("");

    try {
      await acceptClientQuoteRequest(jobId);
      setSuccess("Quote accepted successfully.");
      await loadJobs();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to accept quote.");
    }
  };

  const handleDeferQuote = async () => {
    if (!deferQuoteJob?._id) {
      setError("No quote selected for defer.");
      return;
    }

    if (!String(deferQuoteReason || "").trim()) {
      setError("Please give the reason for your offer defer request.");
      return;
    }

    setError("");
    setSuccess("");
    setActingJobId(deferQuoteJob._id);

    try {
      await deferClientQuoteRequest(deferQuoteJob._id, {
        reason: String(deferQuoteReason || "").trim()
      });
      setSuccess("Your defer response has been sent to admin.");
      setShowDeferQuoteModal(false);
      setDeferQuoteJob(null);
      setDeferQuoteReason("");
      await loadJobs();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to defer quote.");
    } finally {
      setActingJobId("");
    }
  };

  const handleReportBalancePaid = async (jobId) => {
    setError("");
    setSuccess("");
    setActingJobId(jobId);

    try {
      await reportClientBalancePaidRequest(jobId, {
        paymentProofText: postJob.paymentProofText,
        rating: Number(postJob.rating || 0),
        comment: postJob.comment
      });
      setSuccess("Balance payment proof submitted. Admin will verify then release the worker.");
      setPostJob(initialPostJobState);
      await loadJobs();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to submit payment proof.");
    } finally {
      setActingJobId("");
    }
  };

  const handleRespondExtraTime = async (jobId, decision) => {
    setActingJobId(jobId);
    setError("");
    setSuccess("");

    try {
      await clientRespondExtraTimeRequest(jobId, {
        decision,
        responseNote:
          decision === "approved"
            ? "Approved additional time to allow proper completion."
            : "Declined extra time. Please complete within agreed scope."
      });

      setSuccess(
        decision === "approved"
          ? "Extra time approved successfully."
          : "Extra time request declined."
      );

      await loadJobs();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to respond to extra time.");
    } finally {
      setActingJobId("");
    }
  };

  const handleRaiseIssue = async (jobId) => {
    setError("");
    setSuccess("");
    setActingJobId(jobId);

    try {
      await raiseClientJobIssueRequest(jobId, {
        issueNotes: postJob.issueNotes,
        rating: Number(postJob.rating || 0),
        comment: postJob.comment
      });
      setSuccess("Issue raised successfully. Admin will review before worker release.");
      setPostJob(initialPostJobState);
      await loadJobs();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to raise issue.");
    } finally {
      setActingJobId("");
    }
  };

  const renderMapPanel = (job) => {
    const trackingOpen =
      [
        "worker_accepted",
        "worker_en_route",
        "worker_arrived",
        "work_in_progress",
        "awaiting_admin_clearance",
        "issue_reported",
        "issue_resolved"
      ].includes(job.status) &&
      !job.releasedAt &&
      job.status !== "completed" &&
      job.assignmentStatus !== "released";

    const livePoint = getLiveLocationPoint(job?.currentLocation);
    const hasLiveLocation = Boolean(livePoint);
    const liveLatitude = livePoint?.lat;
    const liveLongitude = livePoint?.lng;
    const hasPinnedMap = Boolean(String(job?.location?.googlePinUrl || "").trim());
    const pinnedMapUrl = String(job?.location?.googlePinUrl || "").trim();
    const addressQuery = encodeURIComponent(
      [
        job?.location?.addressLine,
        job?.location?.estate,
        job?.location?.town,
        job?.location?.county
      ]
        .filter(Boolean)
        .join(", ")
    );
    const fallbackMapUrl = `https://www.google.com/maps?q=${addressQuery}`;
    const liveMapUrl = hasLiveLocation
      ? `https://www.google.com/maps?q=${liveLatitude},${liveLongitude}`
      : "";
    const destinationMapUrl = hasPinnedMap ? pinnedMapUrl : fallbackMapUrl;

    return (
      <div
        className="glass-card section-card"
        style={{
          marginTop: 18,
          padding: 18,
          background: "linear-gradient(155deg, rgba(51,65,85,0.72) 0%, rgba(71,85,105,0.54) 100%)",
          border: "1px solid rgba(148,163,184,0.16)",
          borderRadius: "20px",
          marginBottom: "18px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h4 style={{ marginBottom: 8, color: "#f8fafc", fontSize: "1.08rem" }}>Map Tracking</h4>
            <p style={{ color: "#dbe7f5", lineHeight: 1.7, margin: 0 }}>
              This map is available only during the valid assignment period so you can trust worker movement and site direction.
            </p>
          </div>

          <button
            className="ghost-button"
            disabled={!trackingOpen}
            onClick={() => {
              if (!trackingOpen) return;
              setExpandedMapJobId((current) => (current === job._id ? "" : job._id));
            }}
          >
            {trackingOpen ? (expandedMapJobId === job._id ? "Hide Map" : "Open Map") : "Map Locked"}
          </button>
        </div>

        {!trackingOpen ? (
          <div style={{ marginTop: "12px", color: "#fca5a5", fontWeight: 700 }}>
            Map tracking is forbidden outside the valid assignment period.
          </div>
        ) : (
          <div>
            <div style={{ marginTop: "12px", color: hasLiveLocation ? "#22c55e" : (hasPinnedMap ? "#93c5fd" : "#86efac"), fontWeight: 700 }}>
              {hasLiveLocation
                ? `Map source: live worker location sync${job?.currentLocation?.updatedAt ? ` (updated ${formatDateTime(job.currentLocation.updatedAt)})` : ""}.`
                : (hasPinnedMap ? "Map source: exact client pinned Google Map URL." : "Map tracking is open during this live assignment period.")}
            </div>

            <div style={{ marginTop: "8px", color: "#cbd5e1", fontWeight: 700 }}>
              {hasLiveLocation
                ? "Destination remains the client pinned site or saved address."
                : (hasPinnedMap ? "Destination source: exact client pinned Google Map URL." : "Destination source: fallback typed address search.")}
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
              {hasLiveLocation ? (
                <a
                  href={liveMapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ghost-button"
                  style={{ textDecoration: "none" }}
                >
                  Open Live Worker Map
                </a>
              ) : null}

              <a
                href={destinationMapUrl}
                target="_blank"
                rel="noreferrer"
                className="ghost-button"
                style={{ textDecoration: "none" }}
              >
                Open Destination Map
              </a>
            </div>

            {expandedMapJobId === job._id ? (
              <div style={{ marginTop: "12px" }}>
                <iframe
                  title={`client-job-map-${job._id}`}
                  src={
                    hasLiveLocation
                      ? `${liveMapUrl}&output=embed`
                      : `${destinationMapUrl}${"&output=embed"}`
                  }
                  style={{ width: "100%", height: "280px", border: 0, borderRadius: "16px", marginTop: "12px" }}
                  loading="lazy"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  const renderTimelinePanel = (job, extraTimeState, timeline) => {
    const hasPendingExtraTime = extraTimeState.isPending;
    const hasApprovedExtraTime = extraTimeState.isApproved;
    const hasRejectedExtraTime = extraTimeState.isRejected;

    return (
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
        <h4 style={{ marginBottom: 12, color: "#f8fafc", fontSize: "1.08rem" }}>Job History</h4>

        {hasPendingExtraTime ? (
          <div
            style={{
              marginBottom: "14px",
              padding: "14px 16px",
              borderRadius: "14px",
              background: "#fff7ed",
              border: "1px solid #fdba74"
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px", color: "#9a3412" }}>
              Worker Requested Additional Time
            </div>
            <div style={{ color: "#7c2d12", lineHeight: 1.7 }}>
              Requested: {Number(extraTimeState.requestedMinutes || 0)} minutes
              <br />
              Reason: {extraTimeState.reason || "-"}
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
              <button
                className="primary-button"
                onClick={() => handleRespondExtraTime(job._id, "approved")}
                disabled={actingJobId === job._id}
              >
                Approve Time
              </button>
              <button
                className="ghost-button"
                onClick={() => handleRespondExtraTime(job._id, "declined")}
                disabled={actingJobId === job._id}
              >
                Decline Request
              </button>
            </div>
          </div>
        ) : null}

        {hasApprovedExtraTime ? (
          <div
            style={{
              marginBottom: "14px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.3)",
              color: "#065f46",
              fontWeight: 700
            }}
          >
            Extra time approved: {Number(job?.timeExtension?.approvedMinutes || 0)} minutes
          </div>
        ) : null}

        {hasRejectedExtraTime ? (
          <div
            style={{
              marginBottom: "14px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#7f1d1d",
              fontWeight: 700
            }}
          >
            Extra time request declined
          </div>
        ) : null}

        <div className="card-stack" style={{ gap: 10 }}>
          {timeline.map((item, index) => (
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
              <div style={{ color: "#93c5fd", marginTop: 4 }}>{formatDateTime(item.time)}</div>
              <div style={{ color: "#dbe7f5", marginTop: 6 }}>{item.note}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderJobCard = (job, { isHistory = false } = {}) => {
    const paymentStatus = job.payment?.paymentStatus || "unpaid";
    const visibleBalance = getVisibleBalance(job);
    const extraTimeState = getClientExtraTimeState(job);
    const timeline = getTimeline(job);
    const nextStep = getNextStep(job);

    return (
      <div
        className="glass-subcard"
        key={job._id}
        style={{
          background: "linear-gradient(145deg, rgba(39,51,71,0.96) 0%, rgba(55,65,85,0.92) 52%, rgba(15,23,42,0.98) 100%)",
          border: "1px solid rgba(148,163,184,0.22)",
          boxShadow: "0 24px 50px rgba(2,6,23,0.24)",
          borderRadius: "24px",
          padding: "24px",
          minWidth: 0,
          width: "100%",
          overflow: "hidden"
        }}
      >
        <div
          className="job-head"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: "16px",
            alignItems: "start",
            marginBottom: "18px"
          }}
        >
          <div>
            <h4
              style={{
                fontSize: "1.5rem",
                color: "#ffffff",
                letterSpacing: "0.01em",
                lineHeight: 1.15,
                marginBottom: "8px"
              }}
            >
              {cleanDisplayText(job.title)}
            </h4>
            <p style={{ color: "#cbd5e1", margin: 0, fontSize: "1rem" }}>
              {`${cleanDisplayText(job.location?.estate || "-")}   Budget ${formatMoney(job.budgetAmount)}`}
            </p>
          </div>

          <div
            className="badge-row"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              justifyContent: "flex-end"
            }}
          >
            <StatusBadge value={isHistory ? job.status : getClientActiveStatusLabel(job)} />
            <StatusBadge value={job.assignmentStatus} />
            <StatusBadge value={paymentStatus} />
          </div>
        </div>

        <div
          className="client-job-card-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          {[
            ["Final Quote", formatMoney(job.pricing?.finalClientChargeAmount || 0), "#dbeafe"],
            ["Deposit Required", formatMoney(job.payment?.depositAmount || 0), "#bbf7d0"],
            ["Outstanding Balance", formatMoney(visibleBalance), "#fde68a"],
            ["Assigned Worker", presentValue(job.assignedWorker?.fullName, "Not assigned yet"), "#ddd6fe"],
            ["Admin Quote Notes", presentValue(job.pricing?.clientQuoteNotes, "No quote note shared yet"), "#fbcfe8"],
            ["Balance Payment Proof", presentValue(job.payment?.clientPaymentProofText, "No payment proof submitted yet"), "#a5f3fc"]
          ].map(([label, value, accent]) => (
            <div
              key={`${job._id}-${label}`}
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(148,163,184,0.04) 100%)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "18px",
                padding: "14px 16px",
                minHeight: "76px"
              }}
            >
              <div style={{ color: accent, fontWeight: 800, fontSize: "0.86rem", letterSpacing: "0.01em", marginBottom: "8px" }}>
                {label}
              </div>
              <div style={{ color: "#f8fafc", fontWeight: 700, lineHeight: 1.55 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginBottom: "14px",
            borderRadius: "18px",
            padding: "16px 18px",
            background: "linear-gradient(135deg, rgba(14,116,144,0.14) 0%, rgba(30,41,59,0.48) 100%)",
            border: "1px solid rgba(103,232,249,0.18)"
          }}
        >
          <div style={{ color: "#a5f3fc", fontWeight: 800, fontSize: "0.88rem", letterSpacing: "0.01em", marginBottom: "8px" }}>
            What happens next
          </div>
          <div style={{ color: "#e2e8f0", lineHeight: 1.7 }}>
            {nextStep}
          </div>
        </div>

        <div
          className="client-job-card-text"
          style={{
            marginBottom: "10px",
            color: "#dbe7f5",
            lineHeight: 1.75,
            fontSize: "0.98rem"
          }}
        >
          {presentValue(job.description, "No additional description shared.")}
        </div>

        {renderMapPanel(job)}
        {renderTimelinePanel(job, extraTimeState, timeline)}

        {job.status === "quote_pending_client" ? (
          <div className="action-row" style={{ marginTop: 16 }}>
            <button className="primary-button" onClick={() => handleAcceptQuote(job._id)}>
              Accept Quote and Proceed
            </button>

            <button
              className="ghost-button"
              onClick={() => {
                setDeferQuoteJob(job);
                setDeferQuoteReason("");
                setShowDeferQuoteModal(true);
              }}
            >
              Defer Offer
            </button>
          </div>
        ) : null}

        {["awaiting_admin_clearance", "issue_resolved"].includes(job.status) ? (
          <div className="form-grid top-gap" style={{ marginTop: 18 }}>
            <label className="field field-span-2">
              <span>M-Pesa Payment Message</span>
              <textarea
                rows="4"
                placeholder={job.status === "issue_resolved" ? "Issue has been resolved. Paste the exact M-Pesa confirmation message after paying the balance." : "Paste the exact M-Pesa confirmation message after paying the balance."}
                value={postJob.jobId === job._id ? postJob.paymentProofText : ""}
                onChange={(e) =>
                  setPostJob((current) => ({
                    ...current,
                    jobId: job._id,
                    paymentProofText: e.target.value
                  }))
                }
              />
            </label>

            <label className="field">
              <span>Rate Worker (1-5)</span>
              <select
                value={postJob.jobId === job._id ? postJob.rating : "5"}
                onChange={(e) =>
                  setPostJob((current) => ({
                    ...current,
                    jobId: job._id,
                    rating: e.target.value
                  }))
                }
              >
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Good</option>
                <option value="3">3 - Fair</option>
                <option value="2">2 - Poor</option>
                <option value="1">1 - Very Poor</option>
              </select>
            </label>

            <label className="field">
              <span>Rate / Comment Worker Service</span>
              <input
                value={postJob.jobId === job._id ? postJob.comment : ""}
                onChange={(e) =>
                  setPostJob((current) => ({
                    ...current,
                    jobId: job._id,
                    comment: e.target.value
                  }))
                }
                placeholder="Say how the service was"
              />
            </label>

            <label className="field field-span-2">
              <span>Raise Issue</span>
              <textarea
                rows="3"
                placeholder="Describe the issue clearly if there is any problem."
                value={postJob.jobId === job._id ? postJob.issueNotes : ""}
                onChange={(e) =>
                  setPostJob((current) => ({
                    ...current,
                    jobId: job._id,
                    issueNotes: e.target.value
                  }))
                }
              />
            </label>

            <div className="action-row field-span-2">
              <button
                className="primary-button"
                disabled={actingJobId === job._id}
                onClick={() => handleReportBalancePaid(job._id)}
              >
                {actingJobId === job._id ? "Submitting..." : "Bal Paid In Full"}
              </button>

              <button
                className="ghost-button"
                disabled={actingJobId === job._id}
                onClick={() => handleRaiseIssue(job._id)}
              >
                Raise Issue
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };


  return (
    <AppShell
      title={null}
      subtitle={null}
      hideMainHeader
      sidebarExtra={sidebarExtra}
      hideSidebarLogoutButton
    >
      {error ? <div className="error-banner">{error}</div> : null}
      {success ? <div className="success-banner">{success}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      {clientView === "dashboard" ? (
        <>
      <div
        className="glass-card section-card"
        style={{
          marginBottom: "22px",
          padding: "28px 28px 30px",
          background: "linear-gradient(135deg, rgba(37,99,235,0.16) 0%, rgba(15,23,42,0.82) 42%, rgba(16,185,129,0.12) 100%)",
          border: "1px solid rgba(148,163,184,0.22)",
          boxShadow: "0 26px 60px rgba(2,6,23,0.24)"
        }}
      >
        <div style={{ maxWidth: "920px" }}>
          <h2 style={{ margin: 0, color: "#f8fafc", fontSize: "1.7rem", letterSpacing: "0.01em" }}>Client Dashboard</h2>
          <p style={{ marginTop: "12px", marginBottom: 0, color: "#dbe7f5", lineHeight: 1.75, fontSize: "1rem" }}>
            Create requests, review final quotes, track worker progress, and complete the post-job payment or issue flow clearly.
          </p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: "20px" }}>
        <div className="glass-card" style={{ padding: "4px", borderRadius: "26px", background: "linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(15,23,42,0.12) 100%)", border: "1px solid rgba(96,165,250,0.18)" }}>
          <StatCard label="Client" value={cleanDisplayText(user?.fullName || "Client")} hint="Signed-in account" />
        </div>
        <div className="glass-card" style={{ padding: "4px", borderRadius: "26px", background: "linear-gradient(135deg, rgba(20,184,166,0.16) 0%, rgba(15,23,42,0.12) 100%)", border: "1px solid rgba(45,212,191,0.18)" }}>
          <StatCard label="Estate" value={cleanDisplayText(profile?.defaultLocation?.estate || "Not set")} hint="Default area" />
        </div>
        <div className="glass-card" style={{ padding: "4px", borderRadius: "26px", background: "linear-gradient(135deg, rgba(168,85,247,0.16) 0%, rgba(15,23,42,0.12) 100%)", border: "1px solid rgba(196,181,253,0.18)" }}>
          <StatCard label="My Jobs" value={jobs.length} hint="Recorded service requests" />
        </div>
        <div className="glass-card" style={{ padding: "4px", borderRadius: "26px", background: "linear-gradient(135deg, rgba(245,158,11,0.16) 0%, rgba(15,23,42,0.12) 100%)", border: "1px solid rgba(251,191,36,0.18)" }}>
          <StatCard label="Awaiting Quote Decision" value={stats.awaitingDecision} hint="Quotes needing your action" />
        </div>
        <div className="glass-card" style={{ padding: "4px", borderRadius: "26px", background: "linear-gradient(135deg, rgba(244,63,94,0.16) 0%, rgba(15,23,42,0.12) 100%)", border: "1px solid rgba(251,113,133,0.18)" }}>
          <StatCard label="Awaiting Payment / Issue Action" value={stats.awaitingPostJobAction} hint="Post-job steps needing your action" />
        </div>
      </div>

      <div className="glass-card section-card" style={{ padding: "24px 24px 26px", background: "linear-gradient(135deg, rgba(30,41,59,0.96) 0%, rgba(51,65,85,0.92) 50%, rgba(14,116,144,0.12) 100%)", border: "1px solid rgba(148,163,184,0.20)", boxShadow: "0 22px 48px rgba(2,6,23,0.18)" }}>
        <div className="section-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px" }}>
          <div style={{ maxWidth: "78%" }}>
            <h3 style={{ marginBottom: "6px" }}>Client Profile</h3>
            <p style={{ color: "#dbe7f5", lineHeight: 1.7 }}>
              Your saved account details and default location live here for faster booking, cleaner job posting, and a more premium service flow.
            </p>
          </div>

          <button
            className="primary-button"
            style={{ minWidth: "160px" }}
            onClick={() => {
              setProfileForm({
                fullName: user?.fullName || "",
                phone: user?.phone || "",
                email: user?.email || "",
                county: profile?.defaultLocation?.county || "",
                town: profile?.defaultLocation?.town || "",
                estate: profile?.defaultLocation?.estate || "",
                addressLine: profile?.defaultLocation?.addressLine || "",
                houseDetails: profile?.defaultLocation?.houseDetails || ""
              });
              setShowEditProfileModal(true);
            }}
          >
            Edit My Profile
          </button>
        </div>

        <div className="details-grid" style={{ marginTop: "8px", rowGap: "14px", columnGap: "18px", alignItems: "start", background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(148,163,184,0.03) 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "18px 18px 16px" }}>
          <div><strong style={{ color: "#cbd5e1" }}>Full Name:</strong> <span style={{ color: "#f8fafc" }}>{cleanDisplayText(user?.fullName || "-")}</span></div>
          <div><strong style={{ color: "#cbd5e1" }}>Phone:</strong> <span style={{ color: "#f8fafc" }}>{cleanText(user?.phone || "-")}</span></div>
          <div><strong style={{ color: "#cbd5e1" }}>Email:</strong> <span style={{ color: "#dbe7f5" }}>{cleanText(user?.email || "-")}</span></div>
          <div><strong style={{ color: "#cbd5e1" }}>County:</strong> <span style={{ color: "#dbe7f5" }}>{cleanDisplayText(profile?.defaultLocation?.county || "-")}</span></div>
          <div><strong style={{ color: "#cbd5e1" }}>Town:</strong> <span style={{ color: "#dbe7f5" }}>{cleanDisplayText(profile?.defaultLocation?.town || "-")}</span></div>
          <div><strong style={{ color: "#cbd5e1" }}>Estate:</strong> <span style={{ color: "#dbe7f5" }}>{cleanDisplayText(profile?.defaultLocation?.estate || "-")}</span></div>
          <div className="field-span-2"><strong style={{ color: "#cbd5e1" }}>Address:</strong> <span style={{ color: "#dbe7f5" }}>{cleanDisplayText(profile?.defaultLocation?.addressLine || "-")}</span></div>
          <div className="field-span-2"><strong style={{ color: "#cbd5e1" }}>House Details:</strong> <span style={{ color: "#dbe7f5" }}>{cleanDisplayText(profile?.defaultLocation?.houseDetails || "-")}</span></div>
        </div>
      </div>

      <div
        className="dashboard-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "22px",
          alignItems: "start"
        }}
      >
        <div style={{ display: "grid", gap: "18px", alignItems: "start" }}>
          <div
            className="glass-card section-card"
            style={{
              background: "linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.96) 55%, rgba(8,145,178,0.14) 100%)",
              border: "1px solid rgba(125,211,252,0.18)",
              boxShadow: "0 18px 45px rgba(2,6,23,0.28)", width: "100%", minWidth: 0,
              height: "fit-content",
              minHeight: "unset",
              alignSelf: "start"
            }}
          >
            <h3>Create New Job</h3>

            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Service Category</span>
                <select name="serviceCategory" value={form.serviceCategory} onChange={handleChange}>
                  <option value="">Select service category</option>
                  <option value="studio_bedsitter_cleaning">Studio / Bedsitter Cleaning</option>
                  <option value="one_bedroom_cleaning">1 Bedroom House Cleaning</option>
                  <option value="two_bedroom_cleaning">2 Bedroom House Cleaning</option>
                  <option value="three_plus_bedroom_cleaning">3+ Bedroom House Cleaning</option>
                  <option value="kitchen_deep_cleaning">Kitchen Deep Cleaning</option>
                  <option value="bathroom_deep_cleaning">Bathroom Deep Cleaning</option>
                  <option value="sofa_upholstery_cleaning">Sofa / Upholstery Cleaning</option>
                  <option value="mattress_cleaning">Mattress Cleaning</option>
                  <option value="carpet_rug_cleaning">Carpet / Rug Cleaning</option>
                  <option value="balcony_outdoor_cleaning">Balcony / Outdoor Cleaning</option>
                  <option value="laundry_washing">Laundry Washing</option>
                  <option value="laundry_washing_ironing">Laundry Washing + Ironing</option>
                  <option value="utensils_dishes_cleaning">Utensils / Dishes Cleaning</option>
                  <option value="move_in_move_out_cleaning">Move-in / Move-out Cleaning</option>
                  <option value="after_event_cleaning">After-event Cleaning</option>
                  <option value="office_cleaning">Office Cleaning</option>
                  <option value="grocery_pickup">Grocery Pickup</option>
                  <option value="parcel_delivery">Parcel Delivery</option>
                  <option value="pharmacy_pickup">Pharmacy Pickup</option>
                  <option value="house_supplies_purchase">House Supplies Purchase</option>
                  <option value="queue_bill_payment_errand">Queue / Bill Payment Errand</option>
                  <option value="document_dropoff_pickup">Document Drop-off / Pickup</option>
                  <option value="delivery_transportation">Delivery Transportation</option>
                  <option value="movers_services">Movers Services</option>
                  <option value="custom_errand">Custom Errand</option>
                  <option value="salon_services">Salon Services</option>
                  <option value="barber_services">Barber Services</option>
                  <option value="babysitting_services">Babysitting Services</option>
                  <option value="pet_care_services">Pet Care Services</option>
                  <option value="plumbing_services">Plumbing Services</option>
                  <option value="electrical_services">Electrical Services</option>
                  <option value="pest_control_services">Pest Control Services</option>
                  <option value="car_wash_services">Car Wash Services</option>
                </select>
              </label>

              <label className="field field-span-2">
                <span>Job Title</span>
                <input name="title" value={form.title} onChange={handleChange} placeholder="Optional - auto-generated if left blank" />
              </label>

              <label className="field field-span-2">
                <span>Description</span>
                <textarea name="description" value={form.description} onChange={handleChange} rows="4" />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Budget (KES)</span>
                <input name="budgetAmount" type="number" value={form.budgetAmount} onChange={handleChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Expected Duration (hours)</span>
                <input name="expectedDurationHours" type="number" step="0.5" value={form.expectedDurationHours} onChange={handleChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Preferred Start</span>
                <input name="preferredStartAt" type="datetime-local" value={form.preferredStartAt} onChange={handleChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Must Finish By</span>
                <input name="mustBeCompletedBy" type="datetime-local" value={form.mustBeCompletedBy} onChange={handleChange} />
              </label>

              <label className="field field-span-2">
                <span>Instructions</span>
                <textarea name="instructions" value={form.instructions} onChange={handleChange} rows="3" />
              </label>

              <label className="field field-span-2">
                <span>Avoid Notes</span>
                <textarea name="avoidNotes" value={form.avoidNotes} onChange={handleChange} rows="3" />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Estate</span>
                <input name="estate" value={form.estate} onChange={handleChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Address</span>
                <input name="addressLine" value={form.addressLine} onChange={handleChange} />
              </label>

              <label className="field field-span-2">
                <span>House Details</span>
                <input name="houseDetails" value={form.houseDetails} onChange={handleChange} />
              </label>

              <label className="field field-span-2">
                <span>Google Map Pin URL</span>
                <input
                  name="googlePinUrl"
                  value={form.googlePinUrl}
                  onChange={handleChange}
                  placeholder="Paste the Google Maps pinned job-site URL"
                />
              </label>

              <label className="check-field field-span-2">
                <input
                  type="checkbox"
                  name="isBudgetNegotiable"
                  checked={form.isBudgetNegotiable}
                  onChange={handleChange}
                />
                <span>Budget is negotiable</span>
              </label>

              <button type="submit" className="primary-button field-span-2" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Job"}
              </button>
            </form>
          </div>

          <div
            className="glass-card section-card"
            style={{
              background: "linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.96) 55%, rgba(8,145,178,0.14) 100%)",
              border: "1px solid rgba(125,211,252,0.18)",
              boxShadow: "0 18px 45px rgba(2,6,23,0.28)", width: "100%", minWidth: 0
            }}
          >
            <div className="section-head client-history-head">
              <div>
                <h3 style={{ fontSize: "1.25rem", color: "#f8fafc", marginBottom: "8px", letterSpacing: "0.01em" }}>
                  Current / Active Jobs
                </h3>
                <p>Your live requests stay here so the latest active work is always easy to follow.</p>
              </div>
            </div>

            <div className="card-stack">
              {activeJobs.length === 0 ? (
                <p>No current active jobs right now.</p>
              ) : (
                activeJobs.map((job) => renderJobCard(job, { isHistory: false }))
              )}
            </div>
          </div>
        </div>

        <div
          className="glass-card section-card"
          style={{
            background: "linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.96) 55%, rgba(8,145,178,0.14) 100%)",
            border: "1px solid rgba(125,211,252,0.18)",
            boxShadow: "0 18px 45px rgba(2,6,23,0.28)", width: "100%", minWidth: 0, overflow: "hidden"
          }}
        >
          <div className="section-head">
            <div>
              <h3 style={{ fontSize: "1.45rem", color: "#f8fafc", marginBottom: "8px", letterSpacing: "0.01em" }}>Job History</h3>
              <p>Completed and older requests stay here for clean review and reference.</p>
            </div>
            <button className="ghost-button" onClick={loadJobs}>Refresh</button>
          </div>

          <div className="card-stack">
            {historyJobs.length === 0 ? (
              <p>No historical jobs yet.</p>
            ) : (
              historyJobs.map((job) => renderJobCard(job, { isHistory: true }))
            )}
          </div>
        </div>
      </div>

        </>
      ) : null}

      {clientView === "password" ? (
        <div
          className="glass-card section-card"
          style={{
            marginBottom: "22px",
            padding: "24px 24px 26px",
            background: "linear-gradient(135deg, rgba(30,41,59,0.96) 0%, rgba(51,65,85,0.92) 50%, rgba(14,116,144,0.12) 100%)",
            border: "1px solid rgba(148,163,184,0.20)",
            boxShadow: "0 22px 48px rgba(2,6,23,0.18)"
          }}
        >
          <div className="section-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px" }}>
            <div style={{ maxWidth: "78%" }}>
              <h3 style={{ marginBottom: "6px" }}>Change My Password</h3>
              <p style={{ color: "#dbe7f5", lineHeight: 1.7 }}>
                Update your client password here before launch so your account recovery flow stays clean and secure.
              </p>
            </div>
          </div>

          <div
            className="details-grid"
            style={{
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              rowGap: "14px",
              columnGap: "18px",
              alignItems: "start",
              background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(148,163,184,0.03) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "20px",
              padding: "18px 18px 16px"
            }}
          >
            <label className="field" style={{ display: "block", color: "#f8fafc" }}>
              <span>Current Password</span>
              <input
                type={showPasswordValues ? "text" : "password"}
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
              />
            </label>

            <label className="field" style={{ display: "block", color: "#f8fafc" }}>
              <span>New Password</span>
              <input
                type={showPasswordValues ? "text" : "password"}
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
              />
            </label>

            <label className="field" style={{ display: "block", color: "#f8fafc" }}>
              <span>Confirm New Password</span>
              <input
                type={showPasswordValues ? "text" : "password"}
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              />
            </label>

            <label className="check-field" style={{ display: "flex", alignItems: "center", gap: "10px", color: "#f8fafc" }}>
              <input
                type="checkbox"
                checked={showPasswordValues}
                onChange={(event) => setShowPasswordValues(event.target.checked)}
              />
              <span>Show password values</span>
            </label>
          </div>

          {passwordChangeResult ? (
            <div
              style={{
                marginTop: "14px",
                padding: "12px 14px",
                borderRadius: "14px",
                background: passwordChangeResult.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                border: passwordChangeResult.type === "success" ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(239,68,68,0.28)",
                color: passwordChangeResult.type === "success" ? "#bbf7d0" : "#fecaca",
                fontWeight: 700,
                lineHeight: 1.7
              }}
            >
              {passwordChangeResult.message}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button"
              disabled={isChangingPassword}
              onClick={handleSaveClientPassword}
            >
              {isChangingPassword ? "Saving..." : "Change Password"}
            </button>

            <button
              type="button"
              className="ghost-button"
              disabled={isChangingPassword}
              onClick={() => {
                setPasswordForm({
                  currentPassword: "",
                  newPassword: "",
                  confirmPassword: ""
                });
                setShowPasswordValues(false);
                setPasswordChangeResult(null);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {showEditProfileModal ? (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}
          onClick={() => {
            if (!isSavingProfile) {
              setShowEditProfileModal(false);
            }
          }}
        >
          <div
            className="glass-card section-card"
            style={{ width: "100%", maxWidth: "760px", background: "linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.96) 55%, rgba(8,145,178,0.14) 100%)", color: "#f8fafc", borderRadius: "20px", padding: "28px", boxShadow: "0 30px 80px rgba(0,0,0,0.42)", border: "1px solid rgba(125,211,252,0.18)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: "#f8fafc" }}>Edit My Profile</h3>
            <p style={{ marginBottom: "16px", color: "#cbd5e1", lineHeight: 1.6 }}>
              Update your account details and your default location for faster future job posting.
            </p>

            <div className="details-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Full Name</span>
                <input name="fullName" value={profileForm.fullName} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Phone</span>
                <input name="phone" value={profileForm.phone} onChange={handleProfileFieldChange} />
              </label>

              <label className="field field-span-2" style={{ display: "block", color: "#f8fafc" }}>
                <span>Email</span>
                <input name="email" value={profileForm.email} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>County</span>
                <input name="county" value={profileForm.county} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Town</span>
                <input name="town" value={profileForm.town} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>Estate</span>
                <input name="estate" value={profileForm.estate} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block", color: "#f8fafc" }}>
                <span>House Details</span>
                <input name="houseDetails" value={profileForm.houseDetails} onChange={handleProfileFieldChange} />
              </label>

              <label className="field field-span-2" style={{ display: "block", color: "#f8fafc" }}>
                <span>Address</span>
                <input name="addressLine" value={profileForm.addressLine} onChange={handleProfileFieldChange} />
              </label>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "22px", flexWrap: "wrap" }}>
              <button type="button" className="primary-button" disabled={isSavingProfile} onClick={handleSaveClientProfile}>
                {isSavingProfile ? "Saving..." : "Save Profile"}
              </button>

              <button
                type="button"
                className="ghost-button"
                disabled={isSavingProfile}
                style={{ borderRadius: "12px", padding: "12px 18px", fontWeight: 600 }}
                onClick={() => setShowEditProfileModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeferQuoteModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px"
          }}
          onClick={() => {
            setShowDeferQuoteModal(false);
            setDeferQuoteReason("");
            setDeferQuoteJob(null);
          }}
        >
          <div
            className="glass-card section-card"
            style={{
              width: "100%",
              maxWidth: "560px",
              background: "linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.96) 55%, rgba(8,145,178,0.14) 100%)",
              color: "#f8fafc",
              borderRadius: "20px",
              padding: "28px",
              boxShadow: "0 30px 80px rgba(0,0,0,0.42)",
              border: "1px solid rgba(125,211,252,0.18)"
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: "#f8fafc" }}>Defer Offer</h3>
            <p style={{ marginBottom: "16px", color: "#cbd5e1", lineHeight: 1.6 }}>
              Tell admin why you are deferring this quote so they can respond properly.
            </p>

            <label className="field" style={{ display: "block", color: "#f8fafc" }}>
              <span style={{ display: "block", marginBottom: "8px" }}>Reason</span>
              <textarea
                rows="5"
                value={deferQuoteReason}
                onChange={(event) => setDeferQuoteReason(event.target.value)}
                placeholder="Explain why you are deferring the quote..."
              />
            </label>

            <div style={{ display: "flex", gap: "12px", marginTop: "22px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="primary-button"
                disabled={actingJobId === deferQuoteJob?._id}
                onClick={handleDeferQuote}
              >
                {actingJobId === deferQuoteJob?._id ? "Submitting..." : "Send Defer Response"}
              </button>

              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setShowDeferQuoteModal(false);
                  setDeferQuoteReason("");
                  setDeferQuoteJob(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="glass-card section-card" style={{ width: "100%", maxWidth: "460px", background: "#ffffff", color: "#111827", borderRadius: "20px", padding: "28px", boxShadow: "0 30px 80px rgba(0,0,0,0.35)", border: "1px solid rgba(15,23,42,0.08)" }}>
            <h3 style={{ marginTop: 0, color: "#ff4d4f" }}>Confirm Account Deactivation</h3>
            <p style={{ marginBottom: "16px", color: "#475569", lineHeight: 1.6 }}>
              This action will deactivate your account immediately and log you out. Your reason will help admin understand service gaps, quality concerns, or account-related frustrations.
            </p>

            <label className="field" style={{ display: "block", color: "#0f172a" }}>
              <span style={{ display: "block", color: "#334155", fontWeight: 700, marginBottom: "8px" }}>Password</span>
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder="Enter your password"
                style={{ width: "100%", marginTop: "8px", background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "14px 16px", outline: "none" }}
              />
            </label>

            <label className="field" style={{ display: "block", marginTop: "12px", color: "#0f172a" }}>
              <span style={{ display: "block", color: "#334155", fontWeight: 700, marginBottom: "8px" }}>Reason</span>
              <textarea
                rows="4"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Tell us why you are leaving"
                style={{ width: "100%", marginTop: "8px", background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "14px 16px", outline: "none", resize: "vertical" }}
              />
            </label>

            <div style={{ display: "flex", gap: "12px", marginTop: "22px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="primary-button"
                style={{ background: "linear-gradient(135deg, #ff5a5f 0%, #ef4444 100%)", border: "none", color: "#ffffff", borderRadius: "12px", padding: "12px 18px", fontWeight: 700, boxShadow: "0 14px 30px rgba(239,68,68,0.28)" }}
                disabled={isDeletingAccount}
                onClick={async () => {
                  if (!deletePassword.trim() || !deleteReason.trim()) {
                    alert("Password and reason are required.");
                    return;
                  }

                  try {
                    setIsDeletingAccount(true);
                    await handleAccountDeletion(deletePassword, deleteReason);
                  } catch (deleteError) {
                    alert(deleteError?.response?.data?.message || "Failed to deactivate account.");
                  } finally {
                    setIsDeletingAccount(false);
                  }
                }}
              >
                {isDeletingAccount ? "Deleting..." : "Confirm Deactivation"}
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={isDeletingAccount}
                style={{ background: "#eef2f7", border: "1px solid #cbd5e1", color: "#0f172a", borderRadius: "12px", padding: "12px 18px", fontWeight: 600 }}
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword("");
                  setDeleteReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}





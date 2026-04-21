import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { updateMyWorkerProfileRequest } from "../../api/profileApi";
import AppShell from "../../components/layout/AppShell";
import StatCard from "../../components/ui/StatCard";
import Loader from "../../components/common/Loader";
import { http } from "../../api/http";
import { changePasswordRequest } from "../../api/authApi";
import {
  getWorkerDashboardRequest,
  updateWorkerAvailabilityRequest
} from "../../api/workerApi";
import {
  getAssignedWorkerJobsRequest,
  acceptWorkerJobRequest,
  declineWorkerJobRequest,
  updateWorkerCurrentLocationRequest
} from "../../api/jobsApi";

const statShellStyles = {
  availability: {
    background: "linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(16,185,129,0.08) 100%)",
    border: "1px solid rgba(74,222,128,0.34)",
    boxShadow: "0 14px 30px rgba(16,185,129,0.12)"
  },
  completed: {
    background: "linear-gradient(135deg, rgba(96,165,250,0.18) 0%, rgba(59,130,246,0.08) 100%)",
    border: "1px solid rgba(96,165,250,0.34)",
    boxShadow: "0 14px 30px rgba(59,130,246,0.12)"
  },
  assigned: {
    background: "linear-gradient(135deg, rgba(250,204,21,0.16) 0%, rgba(245,158,11,0.08) 100%)",
    border: "1px solid rgba(250,204,21,0.30)",
    boxShadow: "0 14px 30px rgba(245,158,11,0.10)"
  }
};

const declineReasonOptions = [
  "I am too far from the client location",
  "I am already committed to another job",
  "The offered amount is too low",
  "The time window is not workable for me",
  "I do not handle this task type comfortably"
];

function cleanText(value = "") {
  let text = String(value ?? "").trim();
  if (!text) return "";

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

  return text
    .replace(/\uFFFD/g, "")
    .replace(/-/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProfilePhotoFrameStyle(display = {}) {
  const zoom = Number(display?.zoom || 1);
  const offsetX = Number(display?.offsetX || 50);
  const offsetY = Number(display?.offsetY || 50);

  const safeZoom = Number.isFinite(zoom) ? Math.min(3, Math.max(0.5, zoom)) : 1;
  const safeOffsetX = Number.isFinite(offsetX) ? Math.min(100, Math.max(0, offsetX)) : 50;
  const safeOffsetY = Number.isFinite(offsetY) ? Math.min(100, Math.max(0, offsetY)) : 50;

  return {
    transform: `scale(${safeZoom})`,
    transformOrigin: `${safeOffsetX}% ${safeOffsetY}%`
  };
}

function getWorkerOfferAmount(job = {}) {
  return Number(
    job?.workerOfferedAmount
    ?? job?.pricing?.workerOfferedAmount
    ?? job?.pricing?.workerPayoutAmount
    ?? job?.workerOffer?.amount
    ?? job?.assignment?.workerOfferedAmount
    ?? 0
  );
}

function getWorkerAcceptedAmount(job = {}) {
  return Number(
    job?.workerAcceptedAmount
    ?? job?.acceptedWorkerAmount
    ?? job?.workerAcceptedPay
    ?? job?.pricing?.acceptedWorkerAmount
    ?? job?.assignment?.acceptedWorkerAmount
    ?? getWorkerOfferAmount(job)
    ?? 0
  );
}

function formatWorkerAvailabilityLine(dashboard) {
  const availability = dashboard?.availability || dashboard?.worker?.availability || dashboard?.profile?.availability || {};
  const status = String(availability?.status || dashboard?.summary?.availabilityStatus || '').toLowerCase();
  const availableAt = availability?.availableAt || dashboard?.worker?.availableAt || dashboard?.profile?.availableAt || null;
  if (!availableAt) return '-';
  const date = new Date(availableAt);
  if (Number.isNaN(date.getTime())) return '-';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const dayLabel = sameDay ? 'today' : (isTomorrow ? 'tomorrow' : date.toLocaleDateString());
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (status === 'available') return `Available from ${dayLabel} at ${timeLabel}`;
  if (status === 'unavailable') return `Unavailable until ${dayLabel} at ${timeLabel}`;
  return `${dayLabel} at ${timeLabel}`;
}

function resolveWorkerStage(job) {
  if (job?.releasedAt || job?.status === "completed" || job?.assignmentStatus === "released") {
    return { key: "released", label: "Released by Admin", tone: "success" };
  }
  if (job?.status === "issue_reported") {
    return { key: "issue_reported", label: "Issue Raised After Job", tone: "danger" };
  }
  if (job?.status === "issue_resolved") {
    return { key: "issue_resolved", label: "Issue Resolved - Awaiting Release", tone: "warning" };
  }
  if (job?.status === "awaiting_admin_clearance") {
    return { key: "awaiting_verification", label: "Pending Release Clearance", tone: "warning" };
  }
  if (job?.startedAt || job?.status === "work_in_progress") {
    return { key: "in_progress", label: "Engaged Now", tone: "success" };
  }
  if (job?.arrivedAt || job?.status === "worker_arrived") {
    return { key: "arrived", label: "Arrived at Site", tone: "success" };
  }
  if (job?.enRouteAt || job?.status === "worker_en_route") {
    return { key: "en_route", label: "Leaving for Site", tone: "info" };
  }
  if (job?.workerAcceptedAt || job?.status === "worker_accepted") {
    return { key: "accepted", label: "Accepted and Preparing", tone: "info" };
  }
  if (String(job?.workerOfferStatus || "").toLowerCase() === "pending") {
    return { key: "offer_pending", label: "Offer Awaiting Response", tone: "info" };
  }
  if (String(job?.workerOfferStatus || "").toLowerCase() === "declined") {
    return { key: "declined", label: "Offer Declined", tone: "danger" };
  }
  return { key: "idle", label: "No Live Action", tone: "muted" };
}

function toneStyles(tone) {
  if (tone === "success") return { background: "rgba(34,197,94,0.14)", color: "#dcfce7", border: "1px solid rgba(34,197,94,0.34)" };
  if (tone === "info") return { background: "rgba(59,130,246,0.14)", color: "#dbeafe", border: "1px solid rgba(59,130,246,0.34)" };
  if (tone === "warning") return { background: "rgba(245,158,11,0.14)", color: "#fde68a", border: "1px solid rgba(245,158,11,0.34)" };
  if (tone === "danger") return { background: "rgba(239,68,68,0.14)", color: "#fecaca", border: "1px solid rgba(239,68,68,0.34)" };
  return { background: "rgba(148,163,184,0.10)", color: "#e2e8f0", border: "1px solid rgba(148,163,184,0.24)" };
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function getExpectedCompletionTime(startedAt, expectedDurationHours) {
  if (!startedAt || !expectedDurationHours) return "-";
  const startMs = new Date(startedAt).getTime();
  const durationMs = Number(expectedDurationHours || 0) * 60 * 60 * 1000;
  return formatDateTime(new Date(startMs + durationMs));
}

function formatOfferCountdown(expiresAt, nowTime) {
  if (!expiresAt) return "No Timer";
  const diff = new Date(expiresAt).getTime() - nowTime;
  if (diff <= 0) return "Offer Expired";
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds} Left`;
}

function getExecutionState(startedAt, expectedDurationHours, nowTime) {
  if (!startedAt || !expectedDurationHours) {
    return { label: "Timer starts when work begins", tone: "muted", isOverdue: false, isNearEnd: false };
  }

  const startMs = new Date(startedAt).getTime();
  const durationMs = Number(expectedDurationHours || 0) * 60 * 60 * 1000;
  const endMs = startMs + durationMs;
  const diff = endMs - nowTime;

  if (diff <= 0) {
    const overtimeMinutes = Math.floor(Math.abs(diff) / 60000);
    const hours = Math.floor(overtimeMinutes / 60);
    const minutes = overtimeMinutes % 60;
    return {
      label: `Time Exceeded by ${hours}h ${String(minutes).padStart(2, "0")}m`,
      tone: "danger",
      isOverdue: true,
      isNearEnd: false
    };
  }

  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    label: `${hours}h ${String(minutes).padStart(2, "0")}m Remaining`,
    tone: diff <= 15 * 60 * 1000 ? "warning" : "success",
    isOverdue: false,
    isNearEnd: diff <= 15 * 60 * 1000
  };
}

function getMapUrl(job) {
  const pinnedUrl = String(job?.location?.googlePinUrl || "").trim();
  if (pinnedUrl) return pinnedUrl;

  const query = encodeURIComponent(
    [job?.location?.addressLine, job?.location?.estate, job?.location?.town, job?.location?.county]
      .filter(Boolean)
      .join(", ")
  );
  return `https://www.google.com/maps?q=${query}`;
}

function getWorkerTimeline(job) {
  const items = [];

  if (job?.assignedAt) {
    items.push({
      label: "Worker engaged by admin",
      time: job.assignedAt,
      note: cleanText(job?.pricing?.workerAssignmentNotes || "Job offer sent")
    });
  }

  if (job?.workerAcceptedAt) {
    items.push({
      label: "Worker accepted the assignment",
      time: job.workerAcceptedAt,
      note: "Assignment accepted"
    });
  }

  if (job?.workerDeclinedAt) {
    items.push({
      label: "Worker deferred offer",
      time: job.workerDeclinedAt,
      note: cleanText(job?.declineReason || "-")
    });
  }

  if (job?.enRouteAt) {
    items.push({
      label: "Worker left for site",
      time: job.enRouteAt,
      note: "Journey started"
    });
  }

  if (job?.arrivedAt) {
    items.push({
      label: "Worker arrived",
      time: job.arrivedAt,
      note: "Reached site"
    });
  }

  if (job?.startedAt) {
    items.push({
      label: "Work started",
      time: job.startedAt,
      note: "Clocked in"
    });
  }

  if (job?.completedAt) {
    items.push({
      label: "Work completed",
      time: job.completedAt,
      note: "Clocked out"
    });
  }

  const paymentTime = job?.payment?.adminPaymentVerifiedAt || job?.payment?.clientReportedBalancePaidAt || job?.payment?.balancePaidAt;
  if (paymentTime) {
    items.push({
      label: "Admin verified payment",
      time: paymentTime,
      note: "Balance receipt confirmed"
    });
  }

  if (job?.releasedAt) {
    items.push({
      label: "Released by admin",
      time: job.releasedAt,
      note: "Job closed successfully"
    });
  }

  if (job?.timeExtension?.requestedAt) {
    items.push({
      label: "Additional time requested",
      time: job.timeExtension.requestedAt,
      note: cleanText(`Requested ${Number(job?.timeExtension?.requestedMinutes || 0)} minutes | Reason: ${job?.timeExtension?.reason || "-"}`)
    });
  }

  if (job?.timeExtension?.respondedAt) {
    items.push({
      label: String(job?.timeExtension?.status || "").toLowerCase() === "approved" ? "Additional time approved" : "Additional time declined",
      time: job.timeExtension.respondedAt,
      note: cleanText(`Client response: ${job?.timeExtension?.clientResponseNote || "-"}${job?.timeExtension?.approvedMinutes ? ` | Approved ${Number(job.timeExtension.approvedMinutes)} minutes` : ""}`)
    });
  }

  if (job?.payout?.isPaid && job?.payout?.paidAt) {
    items.push({
      label: "Worker payout recorded",
      time: job.payout.paidAt,
      note: cleanText(`KES ${Number(job?.payout?.amount || 0).toLocaleString()} | ${job?.payout?.mpesaMessage || "-"}${job?.payout?.note ? ` | ${job.payout.note}` : ""}`)
    });
  }

  return items
    .filter((item) => item.time)
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

export default function WorkerDashboardPage() {
  const { handleAccountDeletion, logout, user, refreshCurrentUser } = useAuth();

  const navigate = useNavigate();
  const handleWorkerLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login?role=worker', { replace: true });
    }
  };

  const [dashboard, setDashboard] = useState(null);
  const [assignedJobs, setAssignedJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingJobs, setIsRefreshingJobs] = useState(false);
  const [actingJobId, setActingJobId] = useState("");
  const [error, setError] = useState("");
  const [nowTime, setNowTime] = useState(Date.now());

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineJobId, setDeclineJobId] = useState("");
  const [declinePreset, setDeclinePreset] = useState("");
  const [declineCustomReason, setDeclineCustomReason] = useState("");

  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [clockOutJob, setClockOutJob] = useState(null);
  const [showExtraTimeModal, setShowExtraTimeModal] = useState(false);
  const [extraTimeJob, setExtraTimeJob] = useState(null);
  const [extraTimeForm, setExtraTimeForm] = useState({
    requestedMinutes: "30",
    reason: ""
  });
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilityTarget, setAvailabilityTarget] = useState("available");
  const [availabilityMode, setAvailabilityMode] = useState("immediate");
  const [availabilityDateTime, setAvailabilityDateTime] = useState("");
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showProfilePhotoModal, setShowProfilePhotoModal] = useState(false);
  const [profileGalleryIndex, setProfileGalleryIndex] = useState(0);
  const [profileViewerZoom, setProfileViewerZoom] = useState(1);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    county: "",
    town: "",
    estate: "",
    addressLine: "",
    mpesaNumber: "",
    preferredWorkRadiusKm: "10",
    canBringOwnSupplies: false,
    yearsOfExperience: "0",
    experienceSummary: "",

    nextOfKinName: "",
    nextOfKinPhone: "",
    nextOfKinRelationship: "",

    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",

    bankName: "",
    bankAccountName: "",
    bankAccountNumber: ""
  ,
    
    locationPinUrl: "",profilePhotoDisplay: {
      zoom: 1,
      offsetX: 50,
      offsetY: 50
    }
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [successMessage, setSuccessMessage] = useState("");
  const trackingWatchRef = useRef(null);
  const lastTrackedPointRef = useRef("");
  const lastTrackedJobIdRef = useRef("");

  const loadDashboard = async () => {
    const [dashboardResponse, jobsResponse] = await Promise.all([
      getWorkerDashboardRequest(),
      getAssignedWorkerJobsRequest()
    ]);

    setDashboard(dashboardResponse.data);
    setAssignedJobs(jobsResponse.data || []);
  };

  const refreshAssignedJobs = async () => {
    setIsRefreshingJobs(true);
    setError("");

    try {
      await loadDashboard();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to refresh assigned jobs.");
    } finally {
      setIsRefreshingJobs(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await loadDashboard();
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load dashboard.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const trackingJob = assignedJobs.find((job) =>
      ["worker_en_route", "worker_arrived", "work_in_progress", "awaiting_admin_clearance", "issue_reported", "issue_resolved"].includes(String(job?.status || "").toLowerCase())
    );

    if (!trackingJob?._id) {
      if (trackingWatchRef.current && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(trackingWatchRef.current);
      }
      trackingWatchRef.current = null;
      lastTrackedPointRef.current = "";
      lastTrackedJobIdRef.current = "";
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    if (lastTrackedJobIdRef.current !== trackingJob._id) {
      lastTrackedPointRef.current = "";
      lastTrackedJobIdRef.current = trackingJob._id;
    }

    if (trackingWatchRef.current) {
      navigator.geolocation.clearWatch(trackingWatchRef.current);
      trackingWatchRef.current = null;
    }

    trackingWatchRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = Number(position?.coords?.latitude);
        const lng = Number(position?.coords?.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        const pointKey = `${trackingJob._id}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
        if (lastTrackedPointRef.current === pointKey) {
          return;
        }

        lastTrackedPointRef.current = pointKey;

        try {
          await updateWorkerCurrentLocationRequest(trackingJob._id, { lat, lng });
        } catch (_err) {
          // Silent on purpose so live tracking does not disrupt worker flow UI.
        }
      },
      () => {
        // Silent on purpose. Manual journey flow must continue even when device location is blocked.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000
      }
    );

    return () => {
      if (trackingWatchRef.current && navigator.geolocation) {
        navigator.geolocation.clearWatch(trackingWatchRef.current);
      }
      trackingWatchRef.current = null;
    };
  }, [assignedJobs]);

  const liveJobs = useMemo(() => {
    return assignedJobs.filter((job) =>
      ["worker_accepted", "worker_en_route", "worker_arrived", "work_in_progress", "awaiting_admin_clearance", "issue_reported", "issue_resolved"].includes(job.status)
    );
  }, [assignedJobs]);

  const hasLiveJob = liveJobs.length > 0;

  const liveAvailabilityValue = hasLiveJob
    ? "Engaged Now"
    : dashboard?.summary?.availabilityStatus === "available"
      ? "Available"
      : dashboard?.summary?.availabilityStatus === "unavailable"
        ? "Unavailable"
        : "Available";

  const availabilityConfig = dashboard?.profile?.availability || {};
  const scheduledAvailabilityAt =
    availabilityConfig?.scheduledFor ||
    availabilityConfig?.availableFrom ||
    availabilityConfig?.unavailableUntil ||
    availabilityConfig?.effectiveAt ||
    "";

  const scheduledAvailabilityLabel = hasLiveJob
    ? ""
    : scheduledAvailabilityAt
      ? `${liveAvailabilityValue === "Available" ? "Available from" : "Unavailable until"} ${formatDateTime(scheduledAvailabilityAt)}`
      : "";


  const availabilityToneStyles = useMemo(() => {
    const status = String(dashboard?.summary?.availabilityStatus || dashboard?.profile?.availability?.status || "").toLowerCase();
    if (status === "unavailable") {
      return {
        background: "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(217,119,6,0.08) 100%)",
        border: "1px solid rgba(251,191,36,0.34)",
        boxShadow: "0 14px 30px rgba(245,158,11,0.12)"
      };
    }
    if (status === "suspended") {
      return {
        background: "linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(185,28,28,0.08) 100%)",
        border: "1px solid rgba(248,113,113,0.34)",
        boxShadow: "0 14px 30px rgba(239,68,68,0.12)"
      };
    }
    return statShellStyles.availability;
  }, [dashboard]);

    const handleAvailability = (status) => {
    if (hasLiveJob) {
      setError("Availability cannot be changed while you are engaged on a live job.");
      return;
    }

    setAvailabilityTarget(status);
    setAvailabilityMode("immediate");
    setAvailabilityDateTime("");
    setShowAvailabilityModal(true);
  };

  const handleConfirmAvailability = async () => {
    if (hasLiveJob) {
      setError("Availability cannot be changed while you are engaged on a live job.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      let payload;

      if (availabilityTarget === "available" && availabilityMode === "immediate") {
        payload = {
          status: "available",
          reason: "Ready for assignments."
        };
      } else if (availabilityTarget === "available" && availabilityMode === "scheduled") {
        if (!availabilityDateTime) {
          setError("Please choose the future date and time when you want to become available.");
          setIsSaving(false);
          return;
        }

        payload = {
          status: "available",
          reason: "Scheduled future availability.",
          availableAt: new Date(availabilityDateTime).toISOString()
        };
      } else if (availabilityTarget === "unavailable" && availabilityMode === "immediate") {
        payload = {
          status: "unavailable",
          reason: "Currently unavailable."
        };
      } else {
        if (!availabilityDateTime) {
          setError("Please choose the future date and time when you want to become available again.");
          setIsSaving(false);
          return;
        }

        payload = {
          status: "unavailable",
          reason: "Temporarily unavailable until scheduled return time.",
          availableAt: new Date(availabilityDateTime).toISOString()
        };
      }

      const response = await updateWorkerAvailabilityRequest(payload);

      setDashboard((current) => ({
        ...current,
        profile: response.data,
        summary: {
          ...current.summary,
          availabilityStatus: response.data.availability?.status || payload.status
        }
      }));

      setShowAvailabilityModal(false);
      setAvailabilityDateTime("");
      setAvailabilityMode("immediate");
      setSuccessMessage(
        payload.status === "available"
          ? (payload.availableAt ? "Availability saved. Admin will see when you become available." : "You are now marked as available for dispatch.")
          : (payload.availableAt ? "Unavailable window saved. Admin will see when you become available again." : "You are now marked as unavailable.")
      );
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update availability.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfileFieldChange = (event) => {
    const { name, value } = event.target;
    setProfileForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleSaveWorkerProfile = async () => {
    setError("");
    setSuccessMessage("");

    if (!String(profileForm.fullName || "").trim()) {
      setError("Full name is required.");
      return;
    }

    if (!String(profileForm.phone || "").trim()) {
      setError("Phone number is required.");
      return;
    }

    setIsSaving(true);
    try {
      await updateMyWorkerProfileRequest({
        fullName: String(profileForm.fullName || "").trim(),
        phone: String(profileForm.phone || "").trim(),
        email: String(profileForm.email || "").trim(),
        county: String(profileForm.county || "").trim(),
        town: String(profileForm.town || "").trim(),
        estate: String(profileForm.estate || "").trim(),
        addressLine: String(profileForm.addressLine || "").trim(),
        
        googlePinUrl: String(profileForm.locationPinUrl || "").trim(),
mpesaNumber: String(profileForm.mpesaNumber || "").trim(),
        preferredWorkRadiusKm: Number(profileForm.preferredWorkRadiusKm || 10),
        canBringOwnSupplies: Boolean(profileForm.canBringOwnSupplies),
        yearsOfExperience: Number(profileForm.yearsOfExperience || 0),
        experienceSummary: String(profileForm.experienceSummary || "").trim(),

        nextOfKinName: String(profileForm.nextOfKinName || "").trim(),
        nextOfKinPhone: String(profileForm.nextOfKinPhone || "").trim(),
        nextOfKinRelationship: String(profileForm.nextOfKinRelationship || "").trim(),

        emergencyContactName: String(profileForm.emergencyContactName || "").trim(),
        emergencyContactPhone: String(profileForm.emergencyContactPhone || "").trim(),
        emergencyContactRelationship: String(profileForm.emergencyContactRelationship || "").trim(),

        bankName: String(profileForm.bankName || "").trim(),
        bankAccountName: String(profileForm.bankAccountName || "").trim(),
        bankAccountNumber: String(profileForm.bankAccountNumber || "").trim(),
        profilePhotoDisplay: {
          zoom: Number(profileForm?.profilePhotoDisplay?.zoom || 1),
          offsetX: Number(profileForm?.profilePhotoDisplay?.offsetX || 50),
          offsetY: Number(profileForm?.profilePhotoDisplay?.offsetY || 50)
        }
      });
      await refreshCurrentUser();
      await loadDashboard();
      setShowEditProfileModal(false);
      setSuccessMessage("Profile updated successfully.");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setSuccessMessage("");
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setError("Please fill in your current password and the new password twice.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (String(passwordForm.newPassword).length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    setIsSaving(true);
    try {
      await changePasswordRequest({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setSuccessMessage("Password updated successfully. Use the new password the next time you sign in.");
      setShowResetPasswordModal(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update password.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAccept = async (jobId) => {
    setActingJobId(jobId);
    setError("");

    try {
      await acceptWorkerJobRequest(jobId);
      await loadDashboard();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not accept job.");
    } finally {
      setActingJobId("");
    }
  };

  const handleConfirmDecline = async () => {
    const composedReason = [declinePreset, declineCustomReason]
      .filter(Boolean)
      .join(" - ");

    if (!composedReason) {
      setError("Please select or write a reason before declining.");
      return;
    }

    setActingJobId(declineJobId);
    setError("");

    try {
      await declineWorkerJobRequest(declineJobId, { reason: composedReason });
      setShowDeclineModal(false);
      setDeclineJobId("");
      setDeclinePreset("");
      setDeclineCustomReason("");
      await loadDashboard();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not decline job.");
    } finally {
      setActingJobId("");
    }
  };

  const handleJourneyAction = async (jobId, action) => {
    setActingJobId(jobId);
    setError("");

    const routeMap = {
      enroute: `/api/jobs/worker/${jobId}/enroute`,
      arrived: `/api/jobs/worker/${jobId}/arrived`,
      start: `/api/jobs/worker/${jobId}/start`,
      complete: `/api/jobs/worker/${jobId}/complete`
    };

    try {
      await http.patch(routeMap[action]);
      await loadDashboard();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update progress.");
    } finally {
      setActingJobId("");
    }
  };

  const handleConfirmClockOut = async () => {
    if (!clockOutJob?._id) return;
    await handleJourneyAction(clockOutJob._id, "complete");
    setShowClockOutModal(false);
    setClockOutJob(null);
  };

  const openExtraTimeModal = (job) => {
    setError("");
    setExtraTimeJob(job);
    setExtraTimeForm({
      requestedMinutes: "30",
      reason: ""
    });
    setShowExtraTimeModal(true);
  };

  const closeExtraTimeModal = () => {
    setShowExtraTimeModal(false);
    setExtraTimeJob(null);
    setExtraTimeForm({
      requestedMinutes: "30",
      reason: ""
    });
  };

  const handleSubmitExtraTimeRequest = async () => {
    if (!extraTimeJob?._id) return;

    const requestedMinutes = Number(extraTimeForm.requestedMinutes || 0);
    const reason = String(extraTimeForm.reason || "").trim();

    if (!requestedMinutes || requestedMinutes < 15) {
      setError("Additional time must be at least 15 minutes.");
      return;
    }

    if (!reason) {
      setError("Reason for additional time is required.");
      return;
    }

    setActingJobId(extraTimeJob._id);
    setError("");
    setSuccessMessage("");

    try {
      await http.patch(`/api/jobs/worker/${extraTimeJob._id}/request-extra-time`, {
        requestedMinutes,
        reason
      });
      closeExtraTimeModal();
      setSuccessMessage("Additional time request sent to client and admin.");
      await loadDashboard();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not request additional time.");
    } finally {
      setActingJobId("");
    }
  };

  if (isLoading) return <Loader label="Loading dashboard..." />;

  const workerApplication = dashboard?.applicationRecord || {};
  const workerProfilePhoto = workerApplication?.profilePhoto?.url || "";
  const workerProfilePhotoDisplay = {
    zoom: Number(dashboard?.profile?.profilePhotoDisplay?.zoom || 1),
    offsetX: Number(dashboard?.profile?.profilePhotoDisplay?.offsetX || 50),
    offsetY: Number(dashboard?.profile?.profilePhotoDisplay?.offsetY || 50)
  };
  const workerServices = Array.isArray(workerApplication?.serviceCategories) && workerApplication.serviceCategories.length
    ? workerApplication.serviceCategories
    : (Array.isArray(dashboard?.profile?.serviceCategories) ? dashboard.profile.serviceCategories : []);
  const workerLocationPinUrl = String(
    dashboard?.profile?.homeLocation?.googlePinUrl ||
    workerApplication?.homeLocation?.googlePinUrl ||
    ""
  ).trim();

  const workerUploadsSummary = [
    workerApplication?.profilePhoto?.fileName,
    workerApplication?.nationalIdFront?.fileName,
    workerApplication?.nationalIdBack?.fileName,
    workerApplication?.selfieWithId?.fileName
  ].filter(Boolean).join(" | ");
  const profileGalleryItems = [
    workerApplication?.profilePhoto?.url,
    workerApplication?.nationalIdFront?.url,
    workerApplication?.nationalIdBack?.url,
    workerApplication?.selfieWithId?.url
  ].filter(Boolean);

  const latestProfileAudit = Array.isArray(dashboard?.profile?.profileAuditTrail) && dashboard.profile.profileAuditTrail.length
    ? dashboard.profile.profileAuditTrail[dashboard.profile.profileAuditTrail.length - 1]
    : null;

  const sidebarExtra = (
    <div style={{ display: "grid", gap: "12px" }}>
      <div className="glass-subcard" style={{ padding: "16px", borderRadius: "18px" }}>
        <div style={{ color: "#f8fafc", fontSize: "1.05rem", fontWeight: 900 }}>{cleanText(dashboard?.worker?.fullName || "Worker")}</div>
        <div style={{ marginTop: "8px", display: "inline-flex", padding: "6px 12px", borderRadius: "999px", background: "rgba(34,197,94,0.14)", border: "1px solid rgba(74,222,128,0.30)", color: "#dcfce7", fontWeight: 800 }}>
          Worker
        </div>
      </div>

      <button
        type="button"
        onClick={handleWorkerLogout}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, rgba(52,211,153,0.16) 0%, rgba(255,255,255,0.04) 100%)",
          border: "1px solid rgba(52,211,153,0.30)",
          color: "#d1fae5",
          fontWeight: 800,
          letterSpacing: "0.01em"
        }}
      >
        Logout
      </button>

      <button
        type="button"
        onClick={() => {
          setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
          setShowResetPasswordModal(true);
        }}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(255,255,255,0.04) 100%)",
          border: "1px solid rgba(96,165,250,0.30)",
          color: "#dbeafe",
          fontWeight: 800,
          letterSpacing: "0.01em"
        }}
      >
        Reset Password
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

  return (
    <AppShell
      title="My Dashboard"
      subtitle="Track readiness, assignments, live execution, and release clearance."
      sidebarExtra={sidebarExtra}
      sidebarLogoutInline
      hideSidebarUserBlock
      hideSidebarLogoutButton
    >
      {error ? <div className="error-banner">{error}</div> : null}
      {successMessage ? <div className="success-banner">{successMessage}</div> : null}

      <div className="stats-grid">
        <div style={{ borderRadius: "24px", ...availabilityToneStyles }}>
          <StatCard
            label="Availability"
            value={liveAvailabilityValue}
            hint={hasLiveJob ? `Live job engagement detected (${liveJobs.length} open)` : (formatWorkerAvailabilityLine(dashboard) !== "-" ? formatWorkerAvailabilityLine(dashboard) : "Set your next availability window")}
          />
        </div>

        <div style={{ borderRadius: "24px", ...statShellStyles.completed }}>
          <StatCard label="Completed Jobs" value={dashboard?.summary?.totalJobsCompleted ?? 0} hint="Total finished tasks" />
        </div>

        <div style={{ borderRadius: "24px", ...statShellStyles.assigned }}>
          <StatCard label="Assigned Jobs" value={assignedJobs.length} hint="Jobs linked to your account" />
        </div>
      </div>

      <div style={{ display: "grid", gap: "18px" }}>
        <div className="glass-card section-card" style={{ padding: "22px 22px 24px" }}>
          <div className="section-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px" }}>
            <div style={{ maxWidth: "78%" }}>
              <h3 style={{ marginBottom: "6px" }}>Worker Profile</h3>
              <p style={{ color: "#dbe7f5", lineHeight: 1.7 }}>
                Your account profile is shown here first. Edit profile actions now sit inside this section, not as a standalone sidebar shortcut.
              </p>
            </div>

            <button
              className="primary-button"
              style={{ minWidth: "160px" }}
              onClick={() => {
                setProfileForm({
                  fullName: dashboard?.worker?.fullName || user?.fullName || "",
                  phone: dashboard?.worker?.phone || user?.phone || "",
                  email: dashboard?.worker?.email || user?.email || "",
                  county: dashboard?.profile?.homeLocation?.county || workerApplication?.homeLocation?.county || "",
                  town: dashboard?.profile?.homeLocation?.town || workerApplication?.homeLocation?.town || "",
                  estate: dashboard?.profile?.homeLocation?.estate || workerApplication?.homeLocation?.estate || "",
                  addressLine: dashboard?.profile?.homeLocation?.addressLine || workerApplication?.homeLocation?.addressLine || "",
                  mpesaNumber: dashboard?.profile?.mpesaNumber || workerApplication?.mpesaNumber || "",
                  experienceSummary: dashboard?.profile?.experienceSummary || workerApplication?.experienceSummary || "",

                  nextOfKinName: dashboard?.profile?.nextOfKinName || workerApplication?.nextOfKinName || "",
                  nextOfKinPhone: dashboard?.profile?.nextOfKinPhone || workerApplication?.nextOfKinPhone || "",
                  nextOfKinRelationship: dashboard?.profile?.nextOfKinRelationship || workerApplication?.nextOfKinRelationship || "",

                  emergencyContactName: dashboard?.profile?.emergencyContactName || workerApplication?.emergencyContactName || "",
                  emergencyContactPhone: dashboard?.profile?.emergencyContactPhone || workerApplication?.emergencyContactPhone || "",
                  emergencyContactRelationship: dashboard?.profile?.emergencyContactRelationship || workerApplication?.emergencyContactRelationship || "",

                  bankName: dashboard?.profile?.bankName || workerApplication?.bankName || "",
                  bankAccountName: dashboard?.profile?.bankAccountName || workerApplication?.bankAccountName || "",
                  bankAccountNumber: dashboard?.profile?.bankAccountNumber || workerApplication?.bankAccountNumber || "",
                  
                  locationPinUrl: dashboard?.profile?.homeLocation?.googlePinUrl || workerApplication?.homeLocation?.googlePinUrl || "",
profilePhotoDisplay: {
                    zoom: Number(dashboard?.profile?.profilePhotoDisplay?.zoom || 1),
                    offsetX: Number(dashboard?.profile?.profilePhotoDisplay?.offsetX || 50),
                    offsetY: Number(dashboard?.profile?.profilePhotoDisplay?.offsetY || 50)
                  }
                });
                setShowEditProfileModal(true);
              }}
            >
              Edit My Profile
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "18px", alignItems: "start" }}>
            <button
              type="button"
              className="glass-subcard"
              onClick={() => {
                if (workerProfilePhoto) { setProfileGalleryIndex(0); setProfileViewerZoom(1); setShowProfilePhotoModal(true); }
              }}
              style={{
                padding: "14px",
                borderRadius: "18px",
                width: "100%",
                textAlign: "left",
                cursor: workerProfilePhoto ? "zoom-in" : "default",
                background: "transparent"
              }}
            >
              {workerProfilePhoto ? (
                <div
                  style={{
                    width: "100%",
                    height: "220px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    position: "relative",
                    background: "rgba(15,23,42,0.72)",
                    border: "1px solid rgba(148,163,184,0.18)"
                  }}
                >
                  <img
                    src={workerProfilePhoto}
                    alt="Worker profile"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      ...getProfilePhotoFrameStyle(workerProfilePhotoDisplay)
                    }}
                  />
                </div>
              ) : (
                <div style={{ height: "220px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(148,163,184,0.10)", border: "1px solid rgba(148,163,184,0.22)", color: "#cbd5e1", textAlign: "center", padding: "18px", lineHeight: 1.6 }}>
                  No profile photo preview stored yet.
                </div>
              )}
            </button>

            <div style={{ display: "grid", gap: "12px" }}>
              {workerLocationPinUrl ? (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)"
                  }}
                >
                  <div style={{ color: "#22d3ee", fontWeight: 800, marginBottom: "6px" }}>Saved Location Pin</div>
                  <div style={{ color: "#f8fafc", lineHeight: 1.6, marginBottom: "10px", wordBreak: "break-word" }}>
                    {workerLocationPinUrl}
                  </div>
                  <div className="action-row" style={{ gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => window.open(workerLocationPinUrl, "_blank", "noopener,noreferrer")}
                    >
                      Open Saved Pin
                    </button>
                  </div>
                </div>
              ) : null}

              {[
                ["Services Offered", workerServices.length ? workerServices.map((item) => cleanText(item)).join(", ") : "No services recorded yet.", "#93c5fd"],
                ["Home Location", `${cleanText(dashboard?.profile?.homeLocation?.county || workerApplication?.homeLocation?.county || "-")} / ${cleanText(dashboard?.profile?.homeLocation?.town || workerApplication?.homeLocation?.town || "-")} / ${cleanText(dashboard?.profile?.homeLocation?.estate || workerApplication?.homeLocation?.estate || "-")}`, "#fdba74"],
                ["Address", cleanText(dashboard?.profile?.homeLocation?.addressLine || workerApplication?.homeLocation?.addressLine || "-"), "#c4b5fd"],
                ["Personal Details", `Phone: ${cleanText(dashboard?.worker?.phone || "-")} | Email: ${cleanText(dashboard?.worker?.email || "-")} | Last Login: ${formatDateTime(dashboard?.worker?.lastLoginAt)}`, "#60a5fa"],
                ["Availability & Work Preferences", `Availability: ${cleanText(dashboard?.profile?.availability?.status || dashboard?.summary?.availabilityStatus || "-")} | Work Radius: ${cleanText(dashboard?.profile?.preferredWorkRadiusKm || workerApplication?.preferredWorkRadiusKm || "-")} KM | Can Bring Supplies: ${dashboard?.profile?.canBringOwnSupplies === true || workerApplication?.canBringOwnSupplies === true ? "Yes" : "No / Depends"}`, "#86efac"],
                ["Submitted Uploads", cleanText(workerUploadsSummary || "No uploaded assets summary available yet."), "#f9a8d4"],
                ["Audit Trail", latestProfileAudit ? `Last change by ${cleanText(latestProfileAudit?.actorName || latestProfileAudit?.actorRole || "-")} | Reason: ${cleanText(latestProfileAudit?.reason || "-")} | At: ${formatDateTime(latestProfileAudit?.at)}` : "No profile change history recorded yet.", "#22d3ee"],
                ["Next of Kin & Emergency", `Kin: ${cleanText(workerApplication?.nextOfKinName || "-")} (${cleanText(workerApplication?.nextOfKinRelationship || "-")}) | Kin Phone: ${cleanText(workerApplication?.nextOfKinPhone || "-")} | Emergency: ${cleanText(workerApplication?.emergencyContactName || "Neighbor / Friend")} / ${cleanText(workerApplication?.emergencyContactPhone || "-")}`, "#fca5a5"],
                ["Payment Details", `M-Pesa: ${cleanText(dashboard?.profile?.mpesaNumber || workerApplication?.mpesaNumber || "-")} | Registered Name: ${cleanText(workerApplication?.bankAccountName || "-")} | Bank / Account: ${cleanText(workerApplication?.bankName || workerApplication?.bankAccountNumber || "-")}`, "#fcd34d"],
                ["Experience Summary", cleanText(dashboard?.profile?.experienceSummary || workerApplication?.experienceSummary || "-"), "#c4b5fd"]
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
                  <div style={{ color, fontWeight: 800, marginBottom: "6px" }}>{label}</div>
                  <div style={{ color: "#f8fafc", lineHeight: 1.6 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card section-card" style={{ padding: "22px 22px 24px", minHeight: "250px" }}>
          <h3>Quick Availability</h3>
          <div style={{ marginTop: "6px", marginBottom: "12px", color: "#bfdbfe", fontWeight: 700 }}>Next Availability: {formatWorkerAvailabilityLine(dashboard)}</div>
          <p style={{ marginBottom: "18px", lineHeight: 1.8, color: "#dbe7f5" }}>
            Update your live readiness so admin can dispatch jobs correctly. When you are on a live assignment, the system keeps you engaged until release is fully cleared.
          </p>

          {hasLiveJob ? (
            <div style={{ marginBottom: "18px", padding: "14px 16px", borderRadius: "14px", background: "rgba(59,130,246,0.16)", border: "1px solid rgba(96,165,250,0.34)", color: "#eff6ff", fontWeight: 600 }}>
              <div style={{ marginBottom: "6px" }}>You are currently engaged on a live client task. Manual availability switching is locked.</div>
              <div style={{ color: "#bfdbfe", fontWeight: 700 }}>
                Open live jobs: {liveJobs.map((job) => cleanText(job.title || "Job")).join(" | ")}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: "18px", padding: "14px 16px", borderRadius: "14px", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(74,222,128,0.28)", color: "#dcfce7", fontWeight: 600 }}>
              No active live job is blocking you. You can choose Available or Unavailable.{scheduledAvailabilityLabel ? (<div style={{ marginTop: "8px", color: "#a7f3d0", fontWeight: 700 }}>Scheduled Availability: {scheduledAvailabilityLabel}</div>) : null}
            </div>
          )}

          <div className="action-row" style={{ gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
            <button
              className="primary-button"
              style={{ minWidth: "160px", background: "linear-gradient(135deg, rgba(74,222,128,0.95) 0%, rgba(16,185,129,0.95) 100%)", border: "1px solid rgba(74,222,128,0.55)", color: "#052e16", fontWeight: 800 }}
              onClick={() => handleAvailability("available")}
              disabled={isSaving || hasLiveJob}
            >
              {isSaving ? "Saving..." : "Set Available"}
            </button>

            <button
              className="ghost-button"
              style={{ minWidth: "145px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", color: "#e2e8f0" }}
              onClick={() => handleAvailability("unavailable")}
              disabled={isSaving || hasLiveJob}
            >
              Set Unavailable
            </button>
          </div>

          <div className="details-grid" style={{ marginTop: "16px", rowGap: "14px", columnGap: "24px", alignItems: "start" }}>
            <div><strong style={{ color: "#cbd5e1" }}>Name:</strong> <span style={{ color: "#f8fafc" }}>{cleanText(dashboard?.worker?.fullName || "-")}</span></div>
            <div><strong style={{ color: "#cbd5e1" }}>Phone:</strong> <span style={{ color: "#f8fafc" }}>{cleanText(dashboard?.worker?.phone || "-")}</span></div>
            <div><strong style={{ color: "#cbd5e1" }}>Town:</strong> <span style={{ color: "#dbe7f5" }}>{cleanText(dashboard?.profile?.homeLocation?.town || "-")}</span></div>
            <div><strong style={{ color: "#cbd5e1" }}>Estate:</strong> <span style={{ color: "#dbe7f5" }}>{cleanText(dashboard?.profile?.homeLocation?.estate || "-")}</span></div>
          </div>
        </div>

        <div className="glass-card section-card" style={{ padding: "18px 18px 20px", minHeight: "250px" }}>
          <div className="section-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "14px" }}>
            <div style={{ maxWidth: "76%" }}>
              <h3 style={{ marginBottom: "6px" }}>Assigned Jobs</h3>
              <p style={{ color: "#dbe7f5", lineHeight: 1.65 }}>
                Review tasks allocated to you and move each one through its correct work journey.
              </p>
            </div>

            <button
              className="ghost-button"
              style={{ minWidth: "118px", color: "#f8fafc" }}
              onClick={refreshAssignedJobs}
              disabled={isRefreshingJobs}
            >
              {isRefreshingJobs ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="card-stack" style={{ gap: "16px" }}>
            {assignedJobs.length === 0 ? (
              <p>No assigned jobs at the moment.</p>
            ) : (
              assignedJobs.map((job) => {
                const stage = resolveWorkerStage(job);
                const stageStyle = toneStyles(stage.tone);
                const timer = getExecutionState(job.startedAt, job.expectedDurationHours, nowTime);
                const timerStyle = toneStyles(timer.tone);
                const extraTimeStatus = String(job?.timeExtension?.status || "").toLowerCase();
                const hasPendingExtraTime = extraTimeStatus === "pending";
                const hasApprovedExtraTime = extraTimeStatus === "approved";
                const hasRejectedExtraTime = extraTimeStatus === "rejected";
                const timeline = getWorkerTimeline(job);
                const trackingOpen = ["worker_accepted", "worker_en_route", "worker_arrived", "work_in_progress", "awaiting_admin_clearance", "issue_reported", "issue_resolved"].includes(job.status) && !job.releasedAt && job.status !== "completed" && job.assignmentStatus !== "released";

                return (
                  <div className="glass-subcard" key={job._id} style={{ padding: "18px 18px 20px", borderRadius: "22px" }}>
                    <div className="job-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "14px", marginBottom: "12px" }}>
                      <div style={{ maxWidth: "74%" }}>
                        <h4 style={{ marginBottom: "6px" }}>{cleanText(job.title)}</h4>
                        <p style={{ color: "#cbd5e1" }}>
                          {`${cleanText(job.location?.estate || "-")} - `}Worker Offer: KES {getWorkerOfferAmount(job).toLocaleString()}
                          <br />
                          Accepted Amount: KES {getWorkerAcceptedAmount(job).toLocaleString()}
                        </p>
                      </div>

                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap", ...stageStyle }}>
                        {stage.label}
                      </div>
                    </div>

                    <p className="muted-copy" style={{ marginBottom: "12px", color: "#d7e3f4", lineHeight: 1.75 }}>
                      {cleanText(job.description || "")}
                    </p>

                    <div style={{ marginBottom: "14px", padding: "14px 16px", borderRadius: "14px", background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.20)" }}>
                      {stage.key === "offer_pending" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#bfdbfe" }}>Offer Awaiting Your Response</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, color: "#dbe7f5" }}>This offer is available for response for 30 minutes only.</div>
                          <div style={{ marginTop: "8px", fontWeight: 700, color: "#93c5fd" }}>{formatOfferCountdown(job.workerOfferExpiresAt, nowTime)}</div>
                        </>
                      ) : stage.key === "accepted" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#93c5fd" }}>You accepted this job</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, color: "#dbe7f5" }}>Start your journey when you leave for the client site.</div>
                        </>
                      ) : stage.key === "en_route" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#93c5fd" }}>You are on the way</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, color: "#dbe7f5" }}>Confirm immediately once you physically arrive at the site.</div>
                          <div style={{ marginTop: "10px", padding: "12px 14px", borderRadius: "12px", fontWeight: 700, ...toneStyles("info") }}>
                            Live location sync is active during valid assignment stages.
                          </div>
                        </>
                      ) : stage.key === "arrived" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#86efac" }}>You arrived at site</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, color: "#dbe7f5" }}>Clock in only when actual work begins.</div>
                          <div style={{ marginTop: "10px", padding: "12px 14px", borderRadius: "12px", fontWeight: 700, ...toneStyles("info") }}>
                            Live location sync remains active while you are still on the assignment.
                          </div>
                        </>
                      ) : stage.key === "in_progress" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#86efac" }}>You are actively engaged</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, marginBottom: "10px", color: "#dbe7f5" }}>Live execution timer is running against the allowed duration.</div>

                          <div style={{ padding: "12px 14px", borderRadius: "12px", fontWeight: 700, marginBottom: "10px", ...timerStyle }}>{timer.label}</div>

                          {timer.isNearEnd ? (
                            <div style={{ padding: "12px 14px", borderRadius: "12px", fontWeight: 700, ...toneStyles("warning") }}>
                              Alert: Your allocated time is almost up. Finish promptly or request more time with a valid reason.
                            </div>
                          ) : null}

                          {timer.isOverdue ? (
                            <div style={{ padding: "12px 14px", borderRadius: "12px", fontWeight: 700, ...toneStyles("danger") }}>
                              Alert: Your allocated time is now up. Stop and request more time with a clear reason if the task is not complete.
                            </div>
                          ) : null}

                          {hasPendingExtraTime ? (
                            <div style={{ marginTop: "10px", padding: "12px 14px", borderRadius: "12px", fontWeight: 700, ...toneStyles("warning") }}>
                              Additional time request is pending client decision. Admin is copied in this workflow.
                            </div>
                          ) : null}

                          {hasApprovedExtraTime ? (
                            <div style={{ marginTop: "10px", padding: "12px 14px", borderRadius: "12px", fontWeight: 700, ...toneStyles("success") }}>
                              Additional time approved: {Number(job?.timeExtension?.approvedMinutes || job?.timeExtension?.requestedMinutes || 0)} minutes.
                            </div>
                          ) : null}

                          {hasRejectedExtraTime ? (
                            <div style={{ marginTop: "10px", padding: "12px 14px", borderRadius: "12px", fontWeight: 700, ...toneStyles("danger") }}>
                              Additional time request was declined. Complete within the approved scope or await admin guidance.
                            </div>
                          ) : null}

                          <div style={{ marginTop: "10px", padding: "12px 14px", borderRadius: "12px", fontWeight: 700, ...toneStyles("info") }}>
                            Live location sync remains active until the job exits the active assignment period.
                          </div>
                        </>
                      ) : stage.key === "awaiting_verification" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#fcd34d" }}>You completed the job on site</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, color: "#dbe7f5" }}>
                            The client must now either submit full balance payment proof or raise an issue. Admin verifies payment, then releases you.
                          </div>
                        </>
                      ) : stage.key === "issue_reported" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#fca5a5" }}>Issue raised after job</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, color: "#dbe7f5" }}>
                            Stay locked on this assignment while admin resolves the case.
                          </div>
                        </>
                      ) : stage.key === "issue_resolved" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#fde68a" }}>Issue resolved</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, color: "#dbe7f5" }}>
                            Wait for final admin release.
                          </div>
                        </>
                      ) : stage.key === "released" ? (
                        <>
                          <div style={{ fontWeight: 700, marginBottom: "6px", color: "#86efac" }}>Released by Admin</div>
                          <div className="muted-copy" style={{ lineHeight: 1.75, color: "#dbe7f5" }}>
                            This job is closed. You may set your availability again when ready.
                          </div>
                        </>
                      ) : (
                        <div className="muted-copy" style={{ color: "#dbe7f5" }}>
                          No active engagement update for this task right now.
                        </div>
                      )}
                    </div>

                    <div className="details-grid" style={{ marginBottom: "14px", rowGap: "12px", columnGap: "18px", alignItems: "start" }}>
                      <div><strong style={{ color: "#cbd5e1" }}>Preferred Start:</strong> <span style={{ color: "#e2e8f0" }}>{formatDateTime(job.preferredStartAt)}</span></div>
                      <div><strong style={{ color: "#cbd5e1" }}>Expected Duration:</strong> <span style={{ color: "#bfdbfe" }}>{job.expectedDurationHours || 0} hrs</span></div>
                      <div><strong style={{ color: "#cbd5e1" }}>Accepted At:</strong> <span style={{ color: "#e2e8f0" }}>{formatDateTime(job.workerAcceptedAt)}</span></div>
                      <div><strong style={{ color: "#cbd5e1" }}>Clock-In Time:</strong> <span style={{ color: "#86efac" }}>{formatDateTime(job.startedAt)}</span></div>
                      <div><strong style={{ color: "#cbd5e1" }}>Expected Completion Time:</strong> <span style={{ color: "#fcd34d" }}>{getExpectedCompletionTime(job.startedAt, job.expectedDurationHours)}</span></div>
                      <div><strong style={{ color: "#cbd5e1" }}>Actual Clock-Out Time:</strong> <span style={{ color: "#fca5a5" }}>{formatDateTime(job.completedAt)}</span></div>
                    </div>

                    <div className="glass-card section-card" style={{ marginTop: "14px", padding: "14px 14px 16px" }}>
  <h4 style={{ marginBottom: "10px" }}>Job History</h4>
  <div className="card-stack" style={{ gap: "10px" }}>
    {timeline.length === 0 ? (
      <p>No job history yet.</p>
    ) : (
      timeline.map((item, index) => (
        <div
          key={`${job._id}-worker-history-${index}`}
          style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div style={{ fontWeight: 700 }}>{item.label}</div>
          <div style={{ color: "#93c5fd", marginTop: 4 }}>{formatDateTime(item.time)}</div>
          <div style={{ color: "#dbe7f5", marginTop: 6 }}>{item.note}</div>
        </div>
      ))
    )}
  </div>
</div>

<div className="action-row" style={{ gap: "12px", flexWrap: "wrap", alignItems: "center", marginTop: "10px" }}>
                      {stage.key === "offer_pending" ? (
                        <>
                          <button className="primary-button" style={{ minWidth: "165px" }} onClick={() => handleAccept(job._id)} disabled={actingJobId === job._id}>
                            {actingJobId === job._id ? "Working..." : "Accept Offer"}
                          </button>

                          <button
                            className="ghost-button danger"
                            onClick={() => {
                              setDeclineJobId(job._id);
                              setDeclinePreset("");
                              setDeclineCustomReason("");
                              setShowDeclineModal(true);
                            }}
                            disabled={actingJobId === job._id}
                          >
                            Decline Offer
                          </button>
                        </>
                      ) : null}

                      {stage.key !== "offer_pending" ? (
                        <button
                          className="ghost-button"
                          style={{ minWidth: "128px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "#f8fafc" }}
                          onClick={() => {
                            if (!trackingOpen) {
                              setError("Map access is only allowed from accepted assignment until admin release.");
                              return;
                            }
                            window.open(getMapUrl(job), "_blank", "noopener,noreferrer");
                          }}
                        >
                          {trackingOpen ? "Open Client Site Map" : "Map Locked"}
                        </button>
                      ) : null}

                      {!trackingOpen && stage.key !== "offer_pending" ? (
                        <div
                          style={{
                            marginTop: "10px",
                            marginBottom: "12px",
                            padding: "12px 14px",
                            borderRadius: "12px",
                            background: "rgba(239,68,68,0.10)",
                            border: "1px solid rgba(248,113,113,0.22)",
                            color: "#fecaca",
                            lineHeight: 1.7,
                            fontWeight: 700
                          }}
                        >
                          Map access is forbidden outside the active assignment period.
                        </div>
                      ) : null}

                      {stage.key === "accepted" ? (
                        <button className="primary-button" style={{ minWidth: "170px" }} onClick={() => handleJourneyAction(job._id, "enroute")} disabled={actingJobId === job._id}>
                          {actingJobId === job._id ? "Working..." : "Leaving for Site Now"}
                        </button>
                      ) : null}

                      {stage.key === "en_route" ? (
                        <button className="primary-button" style={{ minWidth: "165px" }} onClick={() => handleJourneyAction(job._id, "arrived")} disabled={actingJobId === job._id}>
                          {actingJobId === job._id ? "Working..." : "Arrived at Site"}
                        </button>
                      ) : null}

                      {stage.key === "arrived" ? (
                        <button className="primary-button" style={{ minWidth: "130px" }} onClick={() => handleJourneyAction(job._id, "start")} disabled={actingJobId === job._id}>
                          {actingJobId === job._id ? "Working..." : "Clock In"}
                        </button>
                      ) : null}

                      {stage.key === "in_progress" ? (
                        <>
                          <button
                            className="ghost-button"
                            style={{ minWidth: "175px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.34)", color: "#fde68a" }}
                            onClick={() => openExtraTimeModal(job)}
                            disabled={actingJobId === job._id || hasPendingExtraTime}
                          >
                            {hasPendingExtraTime ? "Extra Time Pending" : "Request More Time"}
                          </button>

                          <button
                            className="primary-button"
                            style={{ minWidth: "170px" }}
                            onClick={() => {
                              setClockOutJob(job);
                              setShowClockOutModal(true);
                            }}
                            disabled={actingJobId === job._id}
                          >
                            Clock Out
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {showAvailabilityModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="glass-card section-card" style={{ width: "100%", maxWidth: "480px", padding: "24px" }}>
            <h3 style={{ marginBottom: "12px" }}>{availabilityTarget === "available" ? "Set Availability" : "Set Unavailability"}</h3>

            <label className="field" style={{ display: "block", marginBottom: "12px" }}>
              <span>Mode</span>
              <select value={availabilityMode} onChange={(e) => setAvailabilityMode(e.target.value)}>
                <option value="immediate">Immediate</option>
                <option value="scheduled">Choose day and time</option>
              </select>
            </label>

            {availabilityMode === "scheduled" ? (
              <label className="field" style={{ display: "block", marginBottom: "12px" }}>
                <span>{availabilityTarget === "available" ? "Become available on" : "Remain unavailable until"}</span>
                <input
                  type="datetime-local"
                  value={availabilityDateTime}
                  onChange={(e) => setAvailabilityDateTime(e.target.value)}
                />
              </label>
            ) : null}

            <div className="action-row">
              <button className="primary-button" disabled={isSaving} onClick={handleConfirmAvailability}>
                {isSaving ? "Saving..." : "Save and Close"}
              </button>
              <button
                className="ghost-button"
                disabled={isSaving}
                onClick={() => {
                  setShowAvailabilityModal(false);
                  setAvailabilityMode("immediate");
                  setAvailabilityDateTime("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showClockOutModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="glass-card section-card" style={{ width: "100%", maxWidth: "560px", background: "#ffffff", color: "#111827", borderRadius: "20px", padding: "26px" }}>
            <h3 style={{ marginTop: 0, color: "#0f172a" }}>Confirm Clock Out</h3>
            <p style={{ color: "#334155", lineHeight: 1.7 }}>
              Only confirm clock out when the work is fully complete on site.
            </p>

            <div style={{ marginTop: "14px", padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #cbd5e1" }}>
              <div style={{ fontWeight: 700, marginBottom: "8px" }}>{cleanText(clockOutJob?.title || "-")}</div>
              <div style={{ color: "#334155", lineHeight: 1.7 }}>{cleanText(clockOutJob?.description || "No job description provided.")}</div>
            </div>

            <div style={{ marginTop: "14px", padding: "14px 16px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", fontWeight: 700, lineHeight: 1.65 }}>
              When you confirm, the client must either paste the M-Pesa balance payment message or raise an issue. Admin then verifies payment and releases you.
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px", flexWrap: "wrap" }}>
              <button type="button" className="primary-button" style={{ minWidth: "130px" }} onClick={handleConfirmClockOut} disabled={actingJobId === clockOutJob?._id}>
                {actingJobId === clockOutJob?._id ? "Working..." : "Yes, Clock Out"}
              </button>

              <button
                type="button"
                className="secondary-button"
                style={{ background: "#eef2f7", border: "1px solid #cbd5e1", color: "#0f172a", borderRadius: "12px", padding: "12px 18px", fontWeight: 600 }}
                onClick={() => {
                  setShowClockOutModal(false);
                  setClockOutJob(null);
                }}
              >
                No, Go Back
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeclineModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="glass-card section-card" style={{ width: "100%", maxWidth: "520px", background: "#ffffff", color: "#111827", borderRadius: "20px", padding: "26px" }}>
            <h3 style={{ marginTop: 0, color: "#ef4444" }}>Decline Job Offer</h3>
            <p style={{ color: "#475569", lineHeight: 1.6 }}>Help admin understand why you are declining this offer.</p>

            <label className="field" style={{ display: "block", marginTop: "12px" }}>
              <span style={{ display: "block", color: "#334155", fontWeight: 700, marginBottom: "8px" }}>Ready reason</span>
              <select value={declinePreset} onChange={(e) => setDeclinePreset(e.target.value)} style={{ width: "100%", background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "14px 16px" }}>
                <option value="">Select a reason</option>
                {declineReasonOptions.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </label>

            <label className="field" style={{ display: "block", marginTop: "14px" }}>
              <span style={{ display: "block", color: "#334155", fontWeight: 700, marginBottom: "8px" }}>Additional explanation</span>
              <textarea rows="4" value={declineCustomReason} onChange={(e) => setDeclineCustomReason(e.target.value)} placeholder="Add any extra explanation you want admin to know" style={{ width: "100%", background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "14px 16px", resize: "vertical" }} />
            </label>

            <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
              <button type="button" className="primary-button" style={{ minWidth: "165px", background: "linear-gradient(135deg, #ff5a5f 0%, #ef4444 100%)", border: "none", color: "#ffffff", borderRadius: "12px", padding: "12px 18px", fontWeight: 700 }} onClick={handleConfirmDecline} disabled={actingJobId === declineJobId}>
                {actingJobId === declineJobId ? "Working..." : "Confirm Decline"}
              </button>

              <button
                type="button"
                className="secondary-button"
                style={{ background: "#eef2f7", border: "1px solid #cbd5e1", color: "#0f172a", borderRadius: "12px", padding: "12px 18px", fontWeight: 600 }}
                onClick={() => {
                  setShowDeclineModal(false);
                  setDeclineJobId("");
                  setDeclinePreset("");
                  setDeclineCustomReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showExtraTimeModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="glass-card section-card" style={{ width: "100%", maxWidth: "560px", background: "#ffffff", color: "#111827", borderRadius: "20px", padding: "26px" }}>
            <h3 style={{ marginTop: 0, color: "#0f172a" }}>Request Additional Time</h3>
            <p style={{ color: "#334155", lineHeight: 1.7 }}>
              Use this only when a genuine job-site issue prevents completion within the client's allocated duration.
            </p>

            <div style={{ marginTop: "14px", padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #cbd5e1" }}>
              <div style={{ fontWeight: 700, marginBottom: "8px" }}>{cleanText(extraTimeJob?.title || "-")}</div>
              <div style={{ color: "#334155", lineHeight: 1.7 }}>
                Preferred Start: {formatDateTime(extraTimeJob?.preferredStartAt)}<br />
                Expected Duration: {Number(extraTimeJob?.expectedDurationHours || 0)} hrs<br />
                Current Expected Finish: {getExpectedCompletionTime(extraTimeJob?.startedAt, extraTimeJob?.expectedDurationHours)}
              </div>
            </div>

            <label className="field" style={{ display: "block", marginTop: "14px" }}>
              <span>Additional Minutes Needed</span>
              <select
                value={extraTimeForm.requestedMinutes}
                onChange={(e) => setExtraTimeForm((prev) => ({ ...prev, requestedMinutes: e.target.value }))}
                style={{ width: "100%", background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "14px 16px" }}
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
              </select>
            </label>

            <label className="field" style={{ display: "block", marginTop: "14px" }}>
              <span>Reason</span>
              <textarea
                rows="4"
                value={extraTimeForm.reason}
                onChange={(e) => setExtraTimeForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Example: client added ironing after laundry, power blackout delayed appliance use, water shortage slowed cleaning, access delay at site"
                style={{ width: "100%", background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "14px 16px", resize: "vertical" }}
              />
            </label>

            <div style={{ marginTop: "14px", padding: "14px 16px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", fontWeight: 700, lineHeight: 1.65 }}>
              This request goes to the client for approval or decline, with admin copied into the workflow.
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="primary-button"
                style={{ minWidth: "180px" }}
                onClick={handleSubmitExtraTimeRequest}
                disabled={actingJobId === extraTimeJob?._id}
              >
                {actingJobId === extraTimeJob?._id ? "Sending..." : "Send Request"}
              </button>

              <button
                type="button"
                className="secondary-button"
                style={{ background: "#eef2f7", border: "1px solid #cbd5e1", color: "#0f172a", borderRadius: "12px", padding: "12px 18px", fontWeight: 600 }}
                onClick={closeExtraTimeModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditProfileModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="glass-card section-card" style={{ width: "100%", maxWidth: "760px", padding: "24px", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Edit My Profile</h3>
            <p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
              Update your visible account details, work location, and payout profile details.
            </p>

            <div className="details-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
              <label className="field" style={{ display: "block" }}>
                <span>Full Name</span>
                <input name="fullName" value={profileForm.fullName} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Phone</span>
                <input name="phone" value={profileForm.phone} onChange={handleProfileFieldChange} />
              </label>

              
              <label className="field" style={{ display: "block" }}>
                <span>Next of Kin Name</span>
                <input name="nextOfKinName" value={profileForm.nextOfKinName} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Next of Kin Phone</span>
                <input name="nextOfKinPhone" value={profileForm.nextOfKinPhone} onChange={handleProfileFieldChange} />
              </label>

              <label className="field field-span-2" style={{ display: "block" }}>
                <span>Next of Kin Relationship</span>
                <input name="nextOfKinRelationship" value={profileForm.nextOfKinRelationship} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Emergency Contact Name</span>
                <input name="emergencyContactName" value={profileForm.emergencyContactName} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Emergency Contact Phone</span>
                <input name="emergencyContactPhone" value={profileForm.emergencyContactPhone} onChange={handleProfileFieldChange} />
              </label>

              <label className="field field-span-2" style={{ display: "block" }}>
                <span>Emergency Contact Relationship</span>
                <input name="emergencyContactRelationship" value={profileForm.emergencyContactRelationship} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Bank Name</span>
                <input name="bankName" value={profileForm.bankName} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Account Name</span>
                <input name="bankAccountName" value={profileForm.bankAccountName} onChange={handleProfileFieldChange} />
              </label>

              <label className="field field-span-2" style={{ display: "block" }}>
                <span>Account Number</span>
                <input name="bankAccountNumber" value={profileForm.bankAccountNumber} onChange={handleProfileFieldChange} />
              </label>
<label className="field field-span-2" style={{ display: "block" }}>
                <span>Email</span>
                <input name="email" value={profileForm.email} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>County</span>
                <input name="county" value={profileForm.county} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Town</span>
                <input name="town" value={profileForm.town} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Estate</span>
                <input name="estate" value={profileForm.estate} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>M-Pesa Number</span>
                <input name="mpesaNumber" value={profileForm.mpesaNumber} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Work Radius (KM)</span>
                <input name="preferredWorkRadiusKm" type="number" min="1" max="100" value={profileForm.preferredWorkRadiusKm} onChange={handleProfileFieldChange} />
              </label>

              <label className="field" style={{ display: "block" }}>
                <span>Years of Experience</span>
                <input name="yearsOfExperience" type="number" min="0" max="80" value={profileForm.yearsOfExperience} onChange={handleProfileFieldChange} />
              </label><label className="field field-span-2" style={{ display: "block" }}>
                <span>Address</span>
                <input name="addressLine" value={profileForm.addressLine} onChange={handleProfileFieldChange} />
              </label><label className="field field-span-2" style={{ display: "block" }}>
                <span>Location Pin URL</span>
                <input
                  name="locationPinUrl"
                  value={profileForm.locationPinUrl || ""}
                  onChange={handleProfileFieldChange}
                  placeholder="Paste saved Google Maps pin URL"
                />
              </label><label className="field field-span-2" style={{ display: "block" }}>
                <span>Can Bring Own Supplies</span>
                <select name="canBringOwnSupplies" value={profileForm.canBringOwnSupplies ? "yes" : "no"} onChange={(event) => setProfileForm((current) => ({ ...current, canBringOwnSupplies: event.target.value === "yes" }))}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label><label className="field field-span-2" style={{ display: "block" }}>
                <span>Experience Summary</span>
                <textarea rows="4" name="experienceSummary" value={profileForm.experienceSummary} onChange={handleProfileFieldChange} />
              </label>
            </div>

            
            <div
              className="glass-subcard"
              style={{
                marginTop: "16px",
                padding: "16px",
                borderRadius: "18px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(148,163,184,0.03) 100%)"
              }}
            >
              <div style={{ color: "#93c5fd", fontWeight: 900, marginBottom: "6px" }}>Profile Photo Framing</div>
              <p style={{ color: "#cbd5e1", lineHeight: 1.7, marginTop: 0, marginBottom: "14px" }}>
                Adjust how your saved profile photo sits inside the card. This only saves the framing.
              </p>

              {workerProfilePhoto ? (
                <>
                  <div
                    style={{
                      width: "220px",
                      height: "220px",
                      maxWidth: "100%",
                      borderRadius: "18px",
                      overflow: "hidden",
                      position: "relative",
                      background: "rgba(15,23,42,0.72)",
                      border: "1px solid rgba(148,163,184,0.18)",
                      marginBottom: "16px"
                    }}
                  >
                    <img
                      src={workerProfilePhoto}
                      alt="Profile framing preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        ...getProfilePhotoFrameStyle(profileForm.profilePhotoDisplay)
                      }}
                    />
                  </div>

                  <div className="details-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }}><label className="field field-span-2" style={{ display: "block" }}>
                      <span>Zoom ({Number(profileForm?.profilePhotoDisplay?.zoom || 1).toFixed(2)}x)</span>
                      <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.05"
                        value={Number(profileForm?.profilePhotoDisplay?.zoom || 1)}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            profilePhotoDisplay: {
                              ...(current.profilePhotoDisplay || {}),
                              zoom: Number(event.target.value)
                            }
                          }))
                        }
                      />
                    </label>

                    <label className="field" style={{ display: "block" }}>
                      <span>Horizontal Focus ({Math.round(Number(profileForm?.profilePhotoDisplay?.offsetX || 50))}%)</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Number(profileForm?.profilePhotoDisplay?.offsetX || 50)}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            profilePhotoDisplay: {
                              ...(current.profilePhotoDisplay || {}),
                              offsetX: Number(event.target.value)
                            }
                          }))
                        }
                      />
                    </label>

                    <label className="field" style={{ display: "block" }}>
                      <span>Vertical Focus ({Math.round(Number(profileForm?.profilePhotoDisplay?.offsetY || 50))}%)</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Number(profileForm?.profilePhotoDisplay?.offsetY || 50)}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            profilePhotoDisplay: {
                              ...(current.profilePhotoDisplay || {}),
                              offsetY: Number(event.target.value)
                            }
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="action-row" style={{ marginTop: "12px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setProfileForm((current) => ({
                          ...current,
                          profilePhotoDisplay: {
                            zoom: 1,
                            offsetX: 50,
                            offsetY: 50
                          }
                        }))
                      }
                    >
                      Reset Framing
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ color: "#cbd5e1", lineHeight: 1.7 }}>
                  No saved profile photo was found yet, so framing controls are hidden until a profile photo exists.
                </div>
              )}
            </div>

<div className="action-row" style={{ marginTop: "18px", flexWrap: "wrap" }}>
              <button className="primary-button" onClick={handleSaveWorkerProfile} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Profile"}
              </button>
              <button className="ghost-button" onClick={() => setShowEditProfileModal(false)} disabled={isSaving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProfilePhotoModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "24px"
          }}
          onClick={() => setShowProfilePhotoModal(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1100px",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="action-row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: "1.05rem" }}>Worker Profile Photo</div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowProfilePhotoModal(false)}
              >
                Close
              </button>
            </div>

            <div
              style={{
                width: "100%",
                maxHeight: "84vh",
                borderRadius: "20px",
                overflow: "hidden",
                background: "rgba(15,23,42,0.88)",
                border: "1px solid rgba(148,163,184,0.20)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "14px"
              }}
            >
              {workerProfilePhoto ? (
                <img
                  src={workerProfilePhoto}
                  alt="Worker profile full view"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "80vh",
                    objectFit: "contain",
                    display: "block",
                    borderRadius: "16px"
                  }}
                />
              ) : (
                <div style={{ color: "#cbd5e1", lineHeight: 1.7 }}>No profile photo available.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showResetPasswordModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="glass-card section-card" style={{ width: "100%", maxWidth: "480px", padding: "24px" }}>
            <h3 style={{ marginTop: 0 }}>Reset Password</h3>
            <p style={{ color: "#cbd5e1", lineHeight: 1.7 }}>Replace the temporary password with your own secure password.</p>

            <label className="field" style={{ display: "block", marginTop: "12px" }}>
              <span>Current Password</span>
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))} />
            </label>

            <label className="field" style={{ display: "block", marginTop: "12px" }}>
              <span>New Password</span>
              <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} />
            </label>

            <label className="field" style={{ display: "block", marginTop: "12px" }}>
              <span>Confirm New Password</span>
              <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} />
            </label>

            <div className="action-row" style={{ marginTop: "18px", flexWrap: "wrap" }}>
              <button className="primary-button" onClick={handleResetPassword} disabled={isSaving}>{isSaving ? "Saving..." : "Save New Password"}</button>
              <button className="ghost-button" onClick={() => setShowResetPasswordModal(false)} disabled={isSaving}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {showProfilePhotoModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
            zIndex: 9999
          }}
          onClick={() => setShowProfilePhotoModal(false)}
        >
          <div
            className="glass-card section-card"
            style={{ width: "100%", maxWidth: "980px", padding: "18px", borderRadius: "24px" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, color: "#f8fafc" }}>Worker Image Viewer</h3>
              <div className="action-row" style={{ gap: "10px", flexWrap: "wrap" }}>
                <button className="ghost-button" type="button" onClick={() => setProfileViewerZoom((current) => Math.max(0.7, Number((current - 0.2).toFixed(2))))}>Zoom Out</button>
                <button className="ghost-button" type="button" onClick={() => setProfileViewerZoom(1)}>Reset Zoom</button>
                <button className="ghost-button" type="button" onClick={() => setProfileViewerZoom((current) => Math.min(3, Number((current + 0.2).toFixed(2))))}>Zoom In</button>
                <button className="ghost-button" type="button" onClick={() => setShowProfilePhotoModal(false)}>Close</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "88px minmax(0, 1fr) 88px", gap: "12px", alignItems: "center" }}>
              <button
                type="button"
                className="ghost-button"
                disabled={profileGalleryItems.length <= 1}
                onClick={() => setProfileGalleryIndex((current) => (current - 1 + profileGalleryItems.length) % profileGalleryItems.length)}
              >
                Prev
              </button>

              <div
                style={{
                  minHeight: "62vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderRadius: "18px",
                  background: "rgba(15,23,42,0.82)",
                  border: "1px solid rgba(148,163,184,0.18)"
                }}
              >
                <img
                  src={profileGalleryItems[profileGalleryIndex] || workerProfilePhoto}
                  alt="Worker upload preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "62vh",
                    objectFit: "contain",
                    transform: `scale(${profileViewerZoom})`,
                    transformOrigin: "center center",
                    display: "block"
                  }}
                />
              </div>

              <button
                type="button"
                className="ghost-button"
                disabled={profileGalleryItems.length <= 1}
                onClick={() => setProfileGalleryIndex((current) => (current + 1) % profileGalleryItems.length)}
              >
                Next
              </button>
            </div>

            <div style={{ marginTop: "12px", color: "#cbd5e1", fontWeight: 700 }}>
              Image {profileGalleryItems.length ? profileGalleryIndex + 1 : 1} of {profileGalleryItems.length || 1}
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteModal ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ width: "100%", maxWidth: "460px", background: "#ffffff", padding: "28px", borderRadius: "20px" }}>
            <h3 style={{ color: "#ef4444" }}>Confirm Account Deactivation</h3>

            <span style={{ color: "#334155", fontWeight: 600 }}>Password</span>
            <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} style={{ width: "100%", marginTop: "8px" }} />

            <span style={{ color: "#334155", fontWeight: 600, marginTop: "12px", display: "block" }}>Reason</span>
            <textarea rows="3" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} style={{ width: "100%", marginTop: "8px" }} />

            <div style={{ display: "flex", gap: "12px", marginTop: "18px" }}>
              <button
                style={{ background: "#ef4444", color: "#fff", padding: "10px 16px", borderRadius: "10px" }}
                onClick={async () => {
                  if (!deletePassword || !deleteReason) {
                    alert("All fields required");
                    return;
                  }

                  try {
                    setIsDeletingAccount(true);
                    await handleAccountDeletion(deletePassword, deleteReason);
                  } finally {
                    setIsDeletingAccount(false);
                  }
                }}
              >
                {isDeletingAccount ? "Deactivating..." : "Confirm Delete"}
              </button>

              <button onClick={() => setShowDeleteModal(false)} disabled={isDeletingAccount}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}














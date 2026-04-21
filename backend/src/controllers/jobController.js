import Job from "../models/Job.js";
import ClientProfile from "../models/ClientProfile.js";
import WorkerProfile from "../models/WorkerProfile.js";
import User from "../models/User.js";
import { USER_ROLES } from "../constants/roles.js";
import {
  JOB_STATUSES,
  JOB_ASSIGNMENT_STATUSES,
  JOB_PAYMENT_STATUSES
} from "../constants/jobs.js";
import { SERVICE_CATEGORIES } from "../constants/services.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { sendSuccess } from "../utils/apiResponse.js";

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const extractMpesaTransactionCode = (message = "") => {
  const normalized = String(message || "").toUpperCase();
  const match = normalized.match(/([A-Z0-9]{8,12})/);
  return match ? match[1] : "";
};

const hasMeaningfulText = (value) => String(value ?? "").trim().length > 0;
const hasMeaningfulNumber = (value) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "" &&
  !Number.isNaN(Number(value));

const mergeClientLocation = (existing = {}, incoming = {}) => ({
  county: hasMeaningfulText(incoming?.county) ? String(incoming.county).trim() : String(existing?.county || "").trim(),
  town: hasMeaningfulText(incoming?.town) ? String(incoming.town).trim() : String(existing?.town || "").trim(),
  estate: hasMeaningfulText(incoming?.estate) ? String(incoming.estate).trim() : String(existing?.estate || "").trim(),
  addressLine: hasMeaningfulText(incoming?.addressLine) ? String(incoming.addressLine).trim() : String(existing?.addressLine || "").trim(),
  houseDetails: hasMeaningfulText(incoming?.houseDetails) ? String(incoming.houseDetails).trim() : String(existing?.houseDetails || "").trim(),
  latitude: hasMeaningfulNumber(incoming?.latitude)
    ? Number(incoming.latitude)
    : (hasMeaningfulNumber(existing?.latitude) ? Number(existing.latitude) : null),
  longitude: hasMeaningfulNumber(incoming?.longitude)
    ? Number(incoming.longitude)
    : (hasMeaningfulNumber(existing?.longitude) ? Number(existing.longitude) : null),
  googlePlaceId: hasMeaningfulText(incoming?.googlePlaceId)
    ? String(incoming.googlePlaceId).trim()
    : String(existing?.googlePlaceId || "").trim(),
  googlePinUrl: hasMeaningfulText(incoming?.googlePinUrl)
    ? String(incoming.googlePinUrl).trim()
    : String(existing?.googlePinUrl || "").trim()
});

const LIVE_JOB_STATUSES = [
  JOB_STATUSES.WORKER_ACCEPTED,
  JOB_STATUSES.WORKER_EN_ROUTE,
  JOB_STATUSES.WORKER_ARRIVED,
  JOB_STATUSES.WORK_IN_PROGRESS,
  JOB_STATUSES.AWAITING_ADMIN_CLEARANCE,
  JOB_STATUSES.ISSUE_REPORTED,
  JOB_STATUSES.ISSUE_RESOLVED
];

const appendJobEvent = (job, { type, title, note = "", actorRole = "", actorId = null }) => {
  job.activityLog = Array.isArray(job.activityLog) ? job.activityLog : [];
  job.activityLog.push({
    type,
    title,
    note,
    actorRole,
    actorId,
    createdAt: new Date()
  });
};

const syncWorkerAvailability = async (workerUserId, status, reason) => {
  if (!workerUserId) return;

  await WorkerProfile.findOneAndUpdate(
    { userId: workerUserId },
    {
      $set: {
        "availability.status": status,
        "availability.reason": reason,
        "availability.updatedAt": new Date(),
        lastSeenAt: new Date()
      }
    }
  );
};

const resetAssignmentToQueue = (job, reason, actorRole = USER_ROLES.ADMIN, actorId = null) => {
  job.workerOfferStatus = "expired";
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.REASSIGN_REQUIRED;
  job.status = JOB_STATUSES.QUOTE_ACCEPTED_READY_FOR_DISPATCH;
  job.workerDeclinedAt = null;
  job.workerAcceptedAt = null;
  job.workerOfferSentAt = null;
  job.workerOfferExpiresAt = null;
  job.enRouteAt = null;
  job.arrivedAt = null;
  job.startedAt = null;
  job.completedAt = null;
  job.assignedWorker = {
    workerUserId: null,
    workerProfileId: null,
    fullName: "",
    phone: ""
  };
  job.assignedByAdminId = null;
  job.assignedAt = null;
  job.declineReason = reason;

  appendJobEvent(job, {
    type: "worker_offer_expired",
    title: "Worker offer expired",
    note: reason,
    actorRole,
    actorId
  });
};

const expirePendingWorkerOffers = async () => {
  const now = new Date();
  const staleJobs = await Job.find({
    workerOfferStatus: "pending",
    workerOfferExpiresAt: { $ne: null, $lte: now }
  });

  for (const staleJob of staleJobs) {
    resetAssignmentToQueue(
      staleJob,
      "Worker did not respond within 30 minutes. Job returned to admin queue.",
      USER_ROLES.ADMIN,
      null
    );
    await staleJob.save({ validateModifiedOnly: true });
  }
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const diffMinutes = (later, earlier) => {
  const laterDate = toValidDate(later);
  const earlierDate = toValidDate(earlier);
  if (!laterDate || !earlierDate) return null;
  return Math.round((laterDate.getTime() - earlierDate.getTime()) / MINUTE_MS);
};

const formatMinutesHuman = (minutes) => {
  const total = Math.abs(Number(minutes || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

const describeAgainstPlan = (actualAt, plannedAt, onTimeLabel = "On time") => {
  const delta = diffMinutes(actualAt, plannedAt);
  if (delta === null) return "";
  if (delta == 0) return onTimeLabel;
  if (delta < 0) return `Early by ${formatMinutesHuman(delta)}`;
  return `Late by ${formatMinutesHuman(delta)}`;
};

const getExpectedFinishAt = (job, startedAt = null) => {
  const start = toValidDate(startedAt || job?.startedAt || job?.arrivedAt || job?.preferredStartAt);
  if (!start) return null;

  const expectedHours = Number(job?.expectedDurationHours || 0);
  const byDuration = expectedHours > 0 ? new Date(start.getTime() + (expectedHours * HOUR_MS)) : null;
  const mustFinishBy = toValidDate(job?.mustBeCompletedBy);

  if (mustFinishBy && byDuration) {
    return byDuration.getTime() <= mustFinishBy.getTime() ? byDuration : mustFinishBy;
  }

  return mustFinishBy || byDuration;
};

const buildAssignmentTimingNote = (job, workerName, adminQuoteNotes = "") => {
  const preferredStart = toValidDate(job?.preferredStartAt);
  const assignedAt = new Date();
  const pieces = [`${workerName}`, `Worker amount KES ${Number(job?.pricing?.workerOfferedAmount || 0)}`];


  const assignDelta = diffMinutes(assignedAt, preferredStart);
  if (assignDelta !== null) {
    if (assignDelta <= 0) {
      pieces.push(`Assigned before preferred time by ${formatMinutesHuman(assignDelta)}`);
    } else {
      pieces.push(`Assigned after preferred time by ${formatMinutesHuman(assignDelta)}`);
    }
  }

  if (String(adminQuoteNotes || "").trim()) {
    pieces.push(String(adminQuoteNotes).trim());
  }

  return pieces.join(" | ");
};

const buildCompletionTimingNote = (job, completedAt) => {
  const pieces = ["Client payment confirmation or issue action is required"];

  const preferredStart = toValidDate(job?.preferredStartAt);
  const mustFinishBy = toValidDate(job?.mustBeCompletedBy);
  const startedAt = toValidDate(job?.startedAt);
  const expectedFinishAt = getExpectedFinishAt(job, startedAt);

  const startVsPlan = describeAgainstPlan(startedAt, preferredStart, "Started on preferred time");
  if (startVsPlan) pieces.push(startVsPlan);

  const finishVsExpected = describeAgainstPlan(completedAt, expectedFinishAt, "Finished within allocated time");
  if (finishVsExpected) {
    if (String(finishVsExpected).startsWith("Late by")) {
      pieces.push(`Finished late by ${formatMinutesHuman(diffMinutes(completedAt, expectedFinishAt))}`);
    } else if (String(finishVsExpected).startsWith("Early by")) {
      pieces.push(`Finished early by ${formatMinutesHuman(diffMinutes(completedAt, expectedFinishAt))}`);
    } else {
      pieces.push("Finished within allocated time");
    }
  }

  if (mustFinishBy) {
    const strictFinishDelta = diffMinutes(completedAt, mustFinishBy);
    if (strictFinishDelta !== null) {
      if (strictFinishDelta > 0) {
        pieces.push(`Exceeded client finish deadline by ${formatMinutesHuman(strictFinishDelta)}`);
      } else {
        pieces.push("Within client finish deadline");
      }
    }
  }

  if (startedAt) {
    const actualDurationMinutes = diffMinutes(completedAt, startedAt);
    if (actualDurationMinutes !== null && actualDurationMinutes >= 0) {
      pieces.push(`Actual duration ${formatMinutesHuman(actualDurationMinutes)}`);
    }
  }

  return pieces.join(" | ");
};

export const createClientJob = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Only clients can create jobs.", 403);
  }

  const {
    serviceCategory,
    title,
    description = "",
    photoUrls = [],
    instructions = "",
    avoidNotes = "",
    budgetAmount = 0,
    isBudgetNegotiable = true,
    expectedDurationHours = 1,
    preferredStartAt,
    mustBeCompletedBy = null,
    county = "",
    town = "",
    estate = "",
    addressLine = "",
    houseDetails = "",
    latitude = null,
    longitude = null,
    googlePlaceId = "",
    googlePinUrl = ""
  } = req.body;

  if (!SERVICE_CATEGORIES.includes(serviceCategory)) {
    throw new AppError("Invalid service category.", 400);
  }

  if (!title || !preferredStartAt) {
    throw new AppError("Title and preferred start time are required.", 400);
  }

  const clientProfile = await ClientProfile.findOne({ userId: req.user._id });

  const locationPayload = mergeClientLocation({}, {
    county,
    town,
    estate,
    addressLine,
    houseDetails,
    latitude,
    longitude,
    googlePlaceId,
    googlePinUrl
  });

  const job = await Job.create({
    clientUserId: req.user._id,
    clientProfileId: clientProfile?._id || null,
    serviceCategory,
    title,
    description,
    photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
    instructions,
    avoidNotes,
    budgetAmount,
    isBudgetNegotiable,
    expectedDurationHours,
    preferredStartAt,
    mustBeCompletedBy,
    status: JOB_STATUSES.PENDING_REVIEW,
    assignmentStatus: JOB_ASSIGNMENT_STATUSES.UNASSIGNED,
    location: locationPayload
  });

  appendJobEvent(job, {
    type: "job_created",
    title: "Job created",
    note: description || serviceCategory,
    actorRole: USER_ROLES.CLIENT,
    actorId: req.user._id
  });

  if (clientProfile) {
    clientProfile.defaultLocation = mergeClientLocation(clientProfile.defaultLocation || {}, locationPayload);
    await clientProfile.save({ validateModifiedOnly: true });
  }

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    statusCode: 201,
    message: "Job request created successfully.",
    data: job
  });
});

export const listMyClientJobs = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Only clients can view their jobs.", 403);
  }

  const jobs = await Job.find({ clientUserId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, {
    message: "Client jobs fetched successfully.",
    data: jobs
  });
});

export const listAdminJobs = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can view all jobs.", 403);
  }

  await expirePendingWorkerOffers();

  const { status = "", assignmentStatus = "" } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (assignmentStatus) filter.assignmentStatus = assignmentStatus;

  const jobs = await Job.find(filter)
    .populate("clientUserId", "fullName phone email")
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, {
    message: "Admin jobs fetched successfully.",
    data: jobs
  });
});

export const sendAdminQuote = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can send quotes.", 403);
  }

  const { id } = req.params;
  const {
    finalClientChargeAmount,
    depositPercentage = 30,
    adminQuoteNotes = ""
  } = req.body;

  const finalCharge = Number(finalClientChargeAmount);
  const depositPct = Number(depositPercentage);

  if (!Number.isFinite(finalCharge) || finalCharge <= 0) {
    throw new AppError("A valid final client charge amount is required.", 400);
  }

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  const depositAmount = roundMoney(finalCharge * (depositPct / 100));
  const balanceAmount = roundMoney(finalCharge - depositAmount);

  job.pricing.finalClientChargeAmount = finalCharge;
  job.pricing.clientQuoteNotes = adminQuoteNotes;
  job.pricing.clientQuoteAcceptedAt = null;
  job.pricing.clientQuoteDeclinedAt = null;

  job.payment.depositPercentage = depositPct;
  job.payment.depositAmount = depositAmount;
  job.payment.balanceAmount = balanceAmount;
  job.payment.paymentStatus = depositAmount > 0 ? JOB_PAYMENT_STATUSES.DEPOSIT_PENDING : JOB_PAYMENT_STATUSES.UNPAID;
  job.payment.depositPaidAt = null;
  job.payment.clientReportedBalancePaidAt = null;
  job.payment.balancePaidAt = null;
  job.payment.clientPaymentProofText = "";
  job.payment.adminPaymentVerifiedBy = null;
  job.payment.adminPaymentVerifiedAt = null;

  job.status = JOB_STATUSES.QUOTE_PENDING_CLIENT;

  appendJobEvent(job, {
    type: "admin_sent_final_quote",
    title: "Admin sent final quote",
    note: `KES ${finalCharge} | Deposit KES ${depositAmount} | ${adminQuoteNotes || "Final quote prepared"}`,
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Admin quote sent successfully.",
    data: job
  });
});

export const clientAcceptQuote = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Only clients can accept quotes.", 403);
  }

  const { id } = req.params;
  const job = await Job.findById(id);

  if (!job) throw new AppError("Job not found.", 404);
  if (String(job.clientUserId) !== String(req.user._id)) {
    throw new AppError("This job does not belong to you.", 403);
  }
  if (job.status !== JOB_STATUSES.QUOTE_PENDING_CLIENT) {
    throw new AppError("This job is not awaiting client quote acceptance.", 400);
  }

  job.pricing.clientQuoteAcceptedAt = new Date();
  job.status = JOB_STATUSES.QUOTE_ACCEPTED_READY_FOR_DISPATCH;

  appendJobEvent(job, {
    type: "client_accepted_quote",
    title: "You accepted the quote",
    note: "Admin can now assign a worker",
    actorRole: USER_ROLES.CLIENT,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Quote accepted successfully. Job is ready for dispatch.",
    data: job
  });
});


export const clientDeferQuote = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Only clients can defer quotes.", 403);
  }

  const { id } = req.params;
  const { reason = "" } = req.body;

  if (!String(reason).trim()) {
    throw new AppError("Please provide a reason for deferring this quote.", 400);
  }

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.clientUserId) !== String(req.user._id)) {
    throw new AppError("This job does not belong to you.", 403);
  }

  if (job.status !== JOB_STATUSES.QUOTE_PENDING_CLIENT) {
    throw new AppError("Only quotes awaiting your response can be deferred.", 400);
  }

  job.pricing.clientQuoteAcceptedAt = null;
  job.pricing.clientQuoteDeclinedAt = new Date();
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.UNASSIGNED;
  job.status = JOB_STATUSES.PENDING_REVIEW;
  job.workerOfferStatus = "none";
  job.workerOfferSentAt = null;
  job.workerOfferExpiresAt = null;
  job.workerAcceptedAt = null;
  job.workerDeclinedAt = null;
  job.enRouteAt = null;
  job.arrivedAt = null;
  job.startedAt = null;
  job.completedAt = null;
  job.assignedWorker = {
    workerUserId: null,
    workerProfileId: null,
    fullName: "",
    phone: ""
  };
  job.assignedByAdminId = null;
  job.assignedAt = null;
  job.declineReason = String(reason).trim();

  appendJobEvent(job, {
    type: "client_deferred_quote",
    title: "Client deferred the quote",
    note: String(reason).trim(),
    actorRole: USER_ROLES.CLIENT,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Quote deferred successfully. Admin can review and resend an updated quote.",
    data: job
  });
});
export const markDepositPaid = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can record deposit payment.", 403);
  }

  const { id } = req.params;
  const job = await Job.findById(id);

  if (!job) throw new AppError("Job not found.", 404);

  job.payment.paymentStatus = JOB_PAYMENT_STATUSES.DEPOSIT_PAID;
  job.payment.depositPaidAt = new Date();

  appendJobEvent(job, {
    type: "deposit_paid",
    title: "Deposit recorded",
    note: `Deposit KES ${job.payment.depositAmount || 0} confirmed`,
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Deposit marked as paid.",
    data: job
  });
});

export const clientReportBalancePaid = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Only clients can confirm balance payment.", 403);
  }

  const { id } = req.params;
  const { paymentProofText = "", rating = 0, comment = "" } = req.body;

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.clientUserId) !== String(req.user._id)) {
    throw new AppError("This job does not belong to you.", 403);
  }

  if (![JOB_STATUSES.AWAITING_ADMIN_CLEARANCE, JOB_STATUSES.ISSUE_RESOLVED].includes(job.status)) {
    throw new AppError("Balance can only be confirmed after worker clocks out or issue resolution.", 400);
  }

  if (!String(paymentProofText).trim()) {
    throw new AppError("Please paste the M-Pesa payment confirmation message.", 400);
  }

  job.payment.paymentStatus = JOB_PAYMENT_STATUSES.CLIENT_REPORTED_BALANCE_PAYMENT;
  job.payment.clientReportedBalancePaidAt = new Date();
  job.payment.clientPaymentProofText = String(paymentProofText).trim();

  if (Number(rating) > 0) {
    job.adminClearance.clientRating = Math.max(1, Math.min(5, Number(rating)));
  }

  if (String(comment).trim()) {
    job.adminClearance.clientComment = String(comment).trim();
  }

  appendJobEvent(job, {
    type: "client_submitted_payment_proof",
    title: "Client submitted payment proof",
    note: String(paymentProofText).trim(),
    actorRole: USER_ROLES.CLIENT,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Balance payment submitted for admin verification.",
    data: job
  });
});

export const clientRaiseIssueAfterJob = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Only clients can raise job issues.", 403);
  }

  const { id } = req.params;
  const { issueNotes = "", rating = 0, comment = "" } = req.body;

  if (!String(issueNotes).trim()) {
    throw new AppError("Issue details are required.", 400);
  }

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.clientUserId) !== String(req.user._id)) {
    throw new AppError("This job does not belong to you.", 403);
  }

  if (job.status !== JOB_STATUSES.AWAITING_ADMIN_CLEARANCE) {
    throw new AppError("Issues can only be raised after the worker finishes the job.", 400);
  }

  job.status = JOB_STATUSES.ISSUE_REPORTED;
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.AWAITING_RELEASE;
  job.adminClearance.status = "issue_raised";
  job.adminClearance.clientIssueNotes = String(issueNotes).trim();
  job.adminClearance.issueRaisedByClientAt = new Date();
  job.adminClearance.clientRating = Number(rating) > 0 ? Math.max(1, Math.min(5, Number(rating))) : 0;
  job.adminClearance.clientComment = String(comment).trim();

  appendJobEvent(job, {
    type: "client_raised_issue",
    title: "Client raised issue",
    note: String(issueNotes).trim(),
    actorRole: USER_ROLES.CLIENT,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  await syncWorkerAvailability(
    job.assignedWorker?.workerUserId,
    "busy",
    "Client raised an issue after completion. Awaiting admin resolution."
  );

  return sendSuccess(res, {
    message: "Issue raised successfully. Admin will review before worker release.",
    data: job
  });
});

export const adminVerifyBalancePayment = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can verify client balance payments.", 403);
  }

  const { id } = req.params;
  const job = await Job.findById(id);

  if (!job) throw new AppError("Job not found.", 404);

  if (job.payment?.paymentStatus !== JOB_PAYMENT_STATUSES.CLIENT_REPORTED_BALANCE_PAYMENT) {
    throw new AppError("Client payment proof is not yet awaiting verification.", 400);
  }

  job.payment.paymentStatus = JOB_PAYMENT_STATUSES.PAID_IN_FULL;
  job.payment.balancePaidAt = new Date();
  job.payment.adminPaymentVerifiedBy = req.user._id;
  job.payment.adminPaymentVerifiedAt = new Date();

  appendJobEvent(job, {
    type: "admin_verified_payment",
    title: "Admin verified payment",
    note: "Balance receipt confirmed",
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Payment received and verified successfully.",
    data: job
  });
});

export const assignWorkerToJob = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can assign workers.", 403);
  }

  const { id } = req.params;
  const {
    workerUserId,
    workerOfferedAmount,
    platformRetentionRate = 20,
    adminQuoteNotes = ""
  } = req.body;

  if (!workerUserId) {
    throw new AppError("workerUserId is required.", 400);
  }

  const workerOffer = Number(workerOfferedAmount);
  const retentionRate = Number(platformRetentionRate);

  if (!Number.isFinite(workerOffer) || workerOffer <= 0) {
    throw new AppError("A valid worker offered amount is required.", 400);
  }

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (job.status !== JOB_STATUSES.QUOTE_ACCEPTED_READY_FOR_DISPATCH) {
    throw new AppError("Job cannot be assigned until client accepts the final quote.", 400);
  }

  const existingLiveJob = await Job.findOne({
    "assignedWorker.workerUserId": workerUserId,
    status: { $in: LIVE_JOB_STATUSES },
    _id: { $ne: job._id }
  }).lean();

  if (existingLiveJob) {
    throw new AppError("This worker already has another live job and cannot receive a second open allocation.", 409);
  }

  const finalCharge = Number(job.pricing?.finalClientChargeAmount || 0);
  if (workerOffer > finalCharge) {
    throw new AppError("Worker offered amount cannot exceed final client charge.", 400);
  }

  const workerUser = await User.findById(workerUserId).lean();
  if (!workerUser || workerUser.role !== USER_ROLES.WORKER) {
    throw new AppError("Worker user not found.", 404);
  }

  const workerProfile = await WorkerProfile.findOne({ userId: workerUserId }).lean();
  if (!workerProfile) {
    throw new AppError("Worker profile not found.", 404);
  }

  const platformRetentionAmount = roundMoney(workerOffer * (retentionRate / 100));
  const adminGrossMarginAmount = roundMoney(finalCharge - workerOffer);

  job.assignedWorker = {
    workerUserId: workerUser._id,
    workerProfileId: workerProfile._id,
    fullName: workerUser.fullName,
    phone: workerUser.phone
  };

  job.pricing.workerOfferedAmount = workerOffer;
  job.pricing.platformRetentionRate = retentionRate;
  job.pricing.platformRetentionAmount = platformRetentionAmount;
  job.pricing.adminGrossMarginAmount = adminGrossMarginAmount;
  job.pricing.workerAssignmentNotes = adminQuoteNotes || "";

  job.assignedByAdminId = req.user._id;
  job.assignedAt = new Date();
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.ASSIGNED;
  job.workerOfferStatus = "pending";
  job.workerOfferSentAt = new Date();
  job.workerOfferExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  job.workerAcceptedAt = null;
  job.enRouteAt = null;
  job.arrivedAt = null;
  job.startedAt = null;
  job.completedAt = null;
  job.releasedAt = null;
  job.workerDeclinedAt = null;
  job.declineReason = "";

  appendJobEvent(job, {
    type: "admin_assigned_worker",
    title: "Worker assigned",
    note: buildAssignmentTimingNote(job, workerUser.fullName, adminQuoteNotes),
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Worker assigned to job successfully.",
    data: job
  });
});

export const listAssignedWorkerJobs = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can view assigned jobs.", 403);
  }

  await expirePendingWorkerOffers();

  const jobs = await Job.find({
    "assignedWorker.workerUserId": req.user._id
  })
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, {
    message: "Assigned worker jobs fetched successfully.",
    data: jobs
  });
});

export const workerAcceptJob = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can accept jobs.", 403);
  }

  const { id } = req.params;
  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (
    job.workerOfferStatus === "pending" &&
    job.workerOfferExpiresAt &&
    new Date(job.workerOfferExpiresAt).getTime() <= Date.now()
  ) {
    resetAssignmentToQueue(
      job,
      "Worker did not respond within 30 minutes. Job returned to admin queue.",
      USER_ROLES.ADMIN,
      null
    );
    await job.save({ validateModifiedOnly: true });
    throw new AppError("This assignment offer expired after 30 minutes and has been returned to admin queue.", 409);
  }

  if (String(job.assignedWorker?.workerUserId) !== String(req.user._id)) {
    throw new AppError("You are not assigned to this job.", 403);
  }

  const existingLiveJob = await Job.findOne({
    "assignedWorker.workerUserId": req.user._id,
    status: { $in: LIVE_JOB_STATUSES },
    _id: { $ne: job._id }
  }).lean();

  if (existingLiveJob) {
    throw new AppError("You already have another live job. Finish or get released first.", 409);
  }

  job.workerOfferStatus = "accepted";
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.ACCEPTED;
  job.status = JOB_STATUSES.WORKER_ACCEPTED;
  job.workerAcceptedAt = new Date();

  const acceptTimingNote = (() => {
    const pieces = ["Worker is now committed to your job"];
    const preferredDelta = diffMinutes(new Date(), job?.preferredStartAt);
    if (preferredDelta !== null) {
      if (preferredDelta <= 0) {
        pieces.push(`Accepted before preferred time by ${formatMinutesHuman(preferredDelta)}`);
      } else {
        pieces.push(`Accepted after preferred time by ${formatMinutesHuman(preferredDelta)}`);
      }
    }
    return pieces.join(" | ");
  })();

  appendJobEvent(job, {
    type: "worker_accepted_job",
    title: "Worker accepted the assignment",
    note: acceptTimingNote,
    actorRole: USER_ROLES.WORKER,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Job accepted successfully.",
    data: job
  });
});

export const workerDeclineJob = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can decline jobs.", 403);
  }

  const { id } = req.params;
  const { reason = "No reason provided" } = req.body;

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.assignedWorker?.workerUserId) !== String(req.user._id)) {
    throw new AppError("You are not assigned to this job.", 403);
  }

  job.workerOfferStatus = "declined";
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.REASSIGN_REQUIRED;
  job.status = JOB_STATUSES.QUOTE_ACCEPTED_READY_FOR_DISPATCH;
  job.workerDeclinedAt = new Date();
  job.workerAcceptedAt = null;
  job.workerOfferSentAt = null;
  job.workerOfferExpiresAt = null;
  job.enRouteAt = null;
  job.arrivedAt = null;
  job.startedAt = null;
  job.completedAt = null;
  job.assignedWorker = {
    workerUserId: null,
    workerProfileId: null,
    fullName: "",
    phone: ""
  };
  job.assignedByAdminId = null;
  job.assignedAt = null;
  job.declineReason = reason;

  appendJobEvent(job, {
    type: "worker_declined_job",
    title: "Worker deferred offer",
    note: reason,
    actorRole: USER_ROLES.WORKER,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Job declined. Admin must reassign.",
    data: {
      job,
      declineReason: reason
    }
  });
});

export const workerStartJourney = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can start journey.", 403);
  }

  const job = await Job.findById(req.params.id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.assignedWorker?.workerUserId) !== String(req.user._id)) {
    throw new AppError("You are not assigned to this job.", 403);
  }

  if (job.assignmentStatus !== JOB_ASSIGNMENT_STATUSES.ACCEPTED) {
    throw new AppError("Job must be accepted first.", 400);
  }

  if (job.status !== JOB_STATUSES.WORKER_ACCEPTED) {
    throw new AppError("Journey can only start after accepting the job.", 400);
  }

  job.status = JOB_STATUSES.WORKER_EN_ROUTE;
  job.enRouteAt = new Date();

  const journeyTimingNote = (() => {
    const pieces = ["Journey to your location started"];
    const preferredDelta = diffMinutes(new Date(), job?.preferredStartAt);
    if (preferredDelta !== null) {
      if (preferredDelta <= 0) {
        pieces.push(`Journey started before preferred time by ${formatMinutesHuman(preferredDelta)}`);
      } else {
        pieces.push(`Journey started after preferred time by ${formatMinutesHuman(preferredDelta)}`);
      }
    }
    return pieces.join(" | ");
  })();

  appendJobEvent(job, {
    type: "worker_left_for_site",
    title: "Worker left for site",
    note: journeyTimingNote,
    actorRole: USER_ROLES.WORKER,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Worker is now on the way.",
    data: job
  });
});

export const workerMarkArrived = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can mark arrival.", 403);
  }

  const job = await Job.findById(req.params.id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.assignedWorker?.workerUserId) !== String(req.user._id)) {
    throw new AppError("You are not assigned to this job.", 403);
  }

  if (job.assignmentStatus !== JOB_ASSIGNMENT_STATUSES.ACCEPTED) {
    throw new AppError("Job must be accepted before arrival.", 400);
  }

  if (![JOB_STATUSES.WORKER_ACCEPTED, JOB_STATUSES.WORKER_EN_ROUTE].includes(job.status)) {
    throw new AppError("Arrival can only be marked after acceptance or while en route.", 400);
  }

  job.status = JOB_STATUSES.WORKER_ARRIVED;
  job.arrivedAt = new Date();

  const arrivalTimingNote = (() => {
    const pieces = ["Worker reached your site"];
    const preferredDelta = diffMinutes(new Date(), job?.preferredStartAt);
    if (preferredDelta !== null) {
      if (preferredDelta <= 0) {
        pieces.push(`Reported before preferred time by ${formatMinutesHuman(preferredDelta)}`);
      } else {
        pieces.push(`Reported late by ${formatMinutesHuman(preferredDelta)}`);
      }
    }
    return pieces.join(" | ");
  })();

  appendJobEvent(job, {
    type: "worker_arrived",
    title: "Worker arrived",
    note: arrivalTimingNote,
    actorRole: USER_ROLES.WORKER,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Worker marked as arrived.",
    data: job
  });
});

export const workerClockIn = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can start work.", 403);
  }

  const job = await Job.findById(req.params.id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.assignedWorker?.workerUserId) !== String(req.user._id)) {
    throw new AppError("You are not assigned to this job.", 403);
  }

  if (job.status !== JOB_STATUSES.WORKER_ARRIVED) {
    throw new AppError("Must arrive before starting work.", 400);
  }

  job.status = JOB_STATUSES.WORK_IN_PROGRESS;
  job.startedAt = new Date();

  const startedAtNow = new Date();
  const clockInTimingNote = (() => {
    const pieces = ["Worker clocked in"];
    const preferredDelta = diffMinutes(startedAtNow, job?.preferredStartAt);
    if (preferredDelta !== null) {
      if (preferredDelta <= 0) {
        pieces.push(`Started before preferred time by ${formatMinutesHuman(preferredDelta)}`);
      } else {
        pieces.push(`Started late by ${formatMinutesHuman(preferredDelta)}`);
      }
    }

    const expectedFinishAt = getExpectedFinishAt(job, startedAtNow);
    if (expectedFinishAt) {
      pieces.push(`Expected finish ${expectedFinishAt.toLocaleString()}`);
    }

    return pieces.join(" | ");
  })();

  appendJobEvent(job, {
    type: "worker_clocked_in",
    title: "Work started",
    note: clockInTimingNote,
    actorRole: USER_ROLES.WORKER,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Work started successfully.",
    data: job
  });
});


export const workerUpdateCurrentLocation = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can update current location.", 403);
  }

  const { id } = req.params;
  const { lat, lng } = req.body;

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.assignedWorker?.workerUserId) !== String(req.user._id)) {
    throw new AppError("You are not assigned to this job.", 403);
  }

  if (![JOB_STATUSES.WORKER_ACCEPTED, JOB_STATUSES.WORKER_EN_ROUTE, JOB_STATUSES.WORKER_ARRIVED, JOB_STATUSES.WORK_IN_PROGRESS, JOB_STATUSES.AWAITING_ADMIN_CLEARANCE, JOB_STATUSES.ISSUE_REPORTED, JOB_STATUSES.ISSUE_RESOLVED].includes(job.status)) {
    throw new AppError("Location updates are only allowed during the active assignment period.", 400);
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new AppError("Valid latitude and longitude are required.", 400);
  }

  const now = new Date();
  const snapshot = {
    lat: latitude,
    lng: longitude,
    updatedAt: now,
    capturedDuringStatus: String(job.status || "").trim()
  };

  job.currentLocation = snapshot;
  job.currentLocationHistory = Array.isArray(job.currentLocationHistory) ? job.currentLocationHistory : [];
  job.currentLocationHistory.push(snapshot);
  if (job.currentLocationHistory.length > 30) {
    job.currentLocationHistory = job.currentLocationHistory.slice(-30);
  }

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Worker location updated successfully.",
    data: {
      currentLocation: job.currentLocation,
      totalPoints: job.currentLocationHistory.length
    }
  });
});

export const workerCompleteJob = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can complete jobs.", 403);
  }

  const job = await Job.findById(req.params.id);
  if (!job) throw new AppError("Job not found.", 404);

  if (String(job.assignedWorker?.workerUserId) !== String(req.user._id)) {
    throw new AppError("You are not assigned to this job.", 403);
  }

  if (!job.startedAt) {
    throw new AppError("You must clock in before clocking out.", 400);
  }

  const completedAtNow = new Date();
  job.status = JOB_STATUSES.AWAITING_ADMIN_CLEARANCE;
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.AWAITING_RELEASE;
  job.completedAt = completedAtNow;
  job.adminClearance.status = "awaiting_clearance";
  job.adminClearance.clearedByAdminId = null;
  job.adminClearance.clearedAt = null;
  job.adminClearance.issueRaisedByAdminId = null;
  job.adminClearance.issueRaisedAt = null;
  job.adminClearance.resolvedByAdminId = null;
  job.adminClearance.resolvedAt = null;
  job.adminClearance.clientIssueNotes = "";
  job.adminClearance.workerExplanation = "";
  job.adminClearance.adminActionNotes = "";
  job.payment.clientReportedBalancePaidAt = null;
  job.payment.clientPaymentProofText = "";
  job.payment.adminPaymentVerifiedBy = null;
  job.payment.adminPaymentVerifiedAt = null;

  appendJobEvent(job, {
    type: "worker_clocked_out",
    title: "Work completed on site",
    note: buildCompletionTimingNote(job, completedAtNow),
    actorRole: USER_ROLES.WORKER,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  await syncWorkerAvailability(
    req.user._id,
    "busy",
    "Job finished on site. Waiting for client payment confirmation and admin release."
  );

  return sendSuccess(res, {
    message: "Job marked complete. Client must confirm payment or raise issue before admin release.",
    data: job
  });
});

export const adminRaiseJobIssue = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can raise issues.", 403);
  }

  const { id } = req.params;
  const {
    clientIssueNotes = "",
    workerExplanation = "",
    adminActionNotes = ""
  } = req.body;

  if (!String(clientIssueNotes).trim()) {
    throw new AppError("Client issue notes are required.", 400);
  }

  if (!String(adminActionNotes).trim()) {
    throw new AppError("Admin action notes are required.", 400);
  }

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (![JOB_STATUSES.AWAITING_ADMIN_CLEARANCE, JOB_STATUSES.ISSUE_RESOLVED].includes(job.status)) {
    throw new AppError("This job is not ready for issue escalation.", 400);
  }

  job.status = JOB_STATUSES.ISSUE_REPORTED;
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.AWAITING_RELEASE;
  job.adminClearance.status = "issue_raised";
  job.adminClearance.issueRaisedByAdminId = req.user._id;
  job.adminClearance.issueRaisedAt = new Date();
  job.adminClearance.clientIssueNotes = String(clientIssueNotes).trim();
  job.adminClearance.workerExplanation = String(workerExplanation).trim();
  job.adminClearance.adminActionNotes = String(adminActionNotes).trim();

  appendJobEvent(job, {
    type: "admin_raised_issue",
    title: "Issue recorded",
    note: `${clientIssueNotes}${workerExplanation ? ` | Worker: ${workerExplanation}` : ""}${adminActionNotes ? ` | Action: ${adminActionNotes}` : ""}`,
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  await syncWorkerAvailability(
    job.assignedWorker?.workerUserId,
    "busy",
    "Issue recorded after completion. Awaiting admin resolution."
  );

  return sendSuccess(res, {
    message: "Issue raised successfully.",
    data: job
  });
});

export const adminResolveJobIssue = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can resolve issues.", 403);
  }

  const { id } = req.params;
  const { adminActionNotes = "" } = req.body;

  if (!String(adminActionNotes).trim()) {
    throw new AppError("Resolution notes are required.", 400);
  }

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (job.status !== JOB_STATUSES.ISSUE_REPORTED) {
    throw new AppError("Only reported issues can be resolved.", 400);
  }

  job.status = JOB_STATUSES.ISSUE_RESOLVED;
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.AWAITING_RELEASE;
  job.adminClearance.status = "resolved";
  job.adminClearance.resolvedByAdminId = req.user._id;
  job.adminClearance.resolvedAt = new Date();
  job.adminClearance.adminActionNotes = String(adminActionNotes).trim();

  appendJobEvent(job, {
    type: "admin_resolved_issue",
    title: "Admin resolved issue",
    note: String(adminActionNotes).trim(),
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Issue resolved. Waiting for final worker release.",
    data: job
  });
});

export const adminReleaseWorker = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can release workers.", 403);
  }

  const { id } = req.params;
  const { adminActionNotes = "" } = req.body;

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (![JOB_STATUSES.AWAITING_ADMIN_CLEARANCE, JOB_STATUSES.ISSUE_RESOLVED].includes(job.status)) {
    throw new AppError("This job is not awaiting worker release.", 400);
  }

  if (job.payment?.paymentStatus !== JOB_PAYMENT_STATUSES.PAID_IN_FULL) {
    throw new AppError("Admin must verify full balance payment before releasing worker.", 400);
  }

  job.status = JOB_STATUSES.COMPLETED;
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.RELEASED;
  job.releasedAt = new Date();
  job.clientVerifiedAt = new Date();
  job.adminClearance.status = "cleared";
  job.adminClearance.clearedByAdminId = req.user._id;
  job.adminClearance.clearedAt = new Date();
  job.adminClearance.adminActionNotes = String(adminActionNotes).trim();

  appendJobEvent(job, {
    type: "worker_released",
    title: "Worker released",
    note: "Job closed successfully",
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  const workerLiveJobs = await Job.countDocuments({
    "assignedWorker.workerUserId": job.assignedWorker?.workerUserId,
    status: { $in: LIVE_JOB_STATUSES },
    _id: { $ne: job._id }
  });

  if (workerLiveJobs > 0) {
    await syncWorkerAvailability(
      job.assignedWorker?.workerUserId,
      "busy",
      "Another live job is still open under this worker account."
    );
  } else {
    await WorkerProfile.findOneAndUpdate(
      { userId: job.assignedWorker?.workerUserId },
      {
        $inc: { "metrics.totalJobsCompleted": 1 },
        $set: {
          "availability.status": "unavailable",
          "availability.reason": "Released from site. Choose Available when ready for the next job.",
          "availability.updatedAt": new Date(),
          lastSeenAt: new Date()
        }
      }
    );
  }

  return sendSuccess(res, {
    message: "Payment received. Worker released successfully.",
    data: job
  });
});

export const adminFinalizeWorkerRelease = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can finalize worker release.", 403);
  }

  const { id } = req.params;
  const { adminActionNotes = "" } = req.body;

  const job = await Job.findById(id);
  if (!job) throw new AppError("Job not found.", 404);

  if (![JOB_STATUSES.AWAITING_ADMIN_CLEARANCE, JOB_STATUSES.ISSUE_RESOLVED].includes(job.status)) {
    throw new AppError("This job is not awaiting worker release.", 400);
  }

  if (![JOB_PAYMENT_STATUSES.CLIENT_REPORTED_BALANCE_PAYMENT, JOB_PAYMENT_STATUSES.PAID_IN_FULL].includes(job.payment?.paymentStatus)) {
    throw new AppError("Client payment proof or full payment confirmation is required before release.", 400);
  }

  if (job.payment?.paymentStatus === JOB_PAYMENT_STATUSES.CLIENT_REPORTED_BALANCE_PAYMENT) {
    job.payment.paymentStatus = JOB_PAYMENT_STATUSES.PAID_IN_FULL;
    job.payment.balancePaidAt = new Date();
    job.payment.adminPaymentVerifiedBy = req.user._id;
    job.payment.adminPaymentVerifiedAt = new Date();

    appendJobEvent(job, {
      type: "admin_verified_payment",
      title: "Admin verified payment",
      note: "Balance receipt confirmed",
      actorRole: USER_ROLES.ADMIN,
      actorId: req.user._id
    });
  }

  job.status = JOB_STATUSES.COMPLETED;
  job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.RELEASED;
  job.releasedAt = new Date();
  job.clientVerifiedAt = new Date();
  job.adminClearance.status = "cleared";
  job.adminClearance.clearedByAdminId = req.user._id;
  job.adminClearance.clearedAt = new Date();
  job.adminClearance.adminActionNotes = String(adminActionNotes).trim();

  appendJobEvent(job, {
    type: "worker_released",
    title: "Worker released",
    note: "Job closed successfully",
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  const workerLiveJobs = await Job.countDocuments({
    "assignedWorker.workerUserId": job.assignedWorker?.workerUserId,
    status: { $in: LIVE_JOB_STATUSES },
    _id: { $ne: job._id }
  });

  if (workerLiveJobs > 0) {
    await syncWorkerAvailability(
      job.assignedWorker?.workerUserId,
      "busy",
      "Another live job is still open under this worker account."
    );
  } else {
    await WorkerProfile.findOneAndUpdate(
      { userId: job.assignedWorker?.workerUserId },
      {
        $inc: { "metrics.totalJobsCompleted": 1 },
        $set: {
          "availability.status": "unavailable",
          "availability.reason": "Released from site. Choose Available when ready for the next job.",
          "availability.updatedAt": new Date(),
          lastSeenAt: new Date()
        }
      }
    );
  }

  return sendSuccess(res, {
    message: "Payment verified and worker released successfully.",
    data: job
  });
});


export const payWorker = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can record worker payouts.", 403);
  }

  const { jobId } = req.params;
  const { amount, mpesaMessage = "", note = "" } = req.body;

  const payoutAmount = roundMoney(amount);

  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    throw new AppError("A valid payout amount is required.", 400);
  }

  if (!String(mpesaMessage).trim()) {
    throw new AppError("M-Pesa transaction message is required.", 400);
  }

  const job = await Job.findById(jobId);
  if (!job) throw new AppError("Job not found.", 404);

  const released =
    job.status === JOB_STATUSES.COMPLETED ||
    job.assignmentStatus === JOB_ASSIGNMENT_STATUSES.RELEASED ||
    Boolean(job.releasedAt);

  if (!released) {
    throw new AppError("Worker can only be paid after the worker has been released from the job.", 400);
  }

  if (job.payout?.isPaid) {
    throw new AppError("Worker payout has already been recorded for this job.", 409);
  }

  const expectedAmount = roundMoney(
    job.pricing?.workerOfferedAmount ||
    job.pricing?.workerPayoutAmount ||
    0
  );

  if (expectedAmount > 0 && payoutAmount > expectedAmount) {
    throw new AppError("Payout amount cannot exceed the agreed worker amount for this job.", 400);
  }

  const workerUserId = job.assignedWorker?.workerUserId;
  if (!workerUserId) {
    throw new AppError("This job has no assigned worker to pay.", 400);
  }

  const workerProfile = await WorkerProfile.findOne({ userId: workerUserId });
  const mpesaNumber = String(workerProfile?.mpesaNumber || job.assignedWorker?.phone || "").trim();
  const mpesaName = String(job.assignedWorker?.fullName || "").trim();
  const transactionCode = extractMpesaTransactionCode(String(mpesaMessage).trim());

  job.payout = {
    isPaid: true,
    amount: payoutAmount,
    mpesaNumber,
    mpesaName,
    mpesaMessage: String(mpesaMessage).trim(),
    mpesaTransactionCode: transactionCode,
    note: String(note).trim(),
    workerSnapshotName: String(job.assignedWorker?.fullName || "").trim(),
    workerSnapshotPhone: String(job.assignedWorker?.phone || "").trim(),
    paidAt: new Date(),
    paidByAdminId: req.user._id
  };

  appendJobEvent(job, {
    type: "worker_paid",
    title: "Worker payout recorded",
    note: `KES ${payoutAmount} | ${transactionCode || "NO_TX_CODE"} | ${String(mpesaMessage).trim()}${String(note).trim() ? ` | ${String(note).trim()}` : ""}`,
    actorRole: USER_ROLES.ADMIN,
    actorId: req.user._id
  });

  await job.save({ validateModifiedOnly: true });

  if (workerProfile) {
    workerProfile.payoutHistory = Array.isArray(workerProfile.payoutHistory)
      ? workerProfile.payoutHistory
      : [];

    workerProfile.payoutHistory.push({
      jobId: job._id,
      amount: payoutAmount,
      mpesaMessage: String(mpesaMessage).trim(),
      paidAt: job.payout.paidAt
    });

    await workerProfile.save({ validateModifiedOnly: true });
  }

  return sendSuccess(res, {
    message: "Worker payout recorded successfully.",
    data: job
  });
});

export const workerRequestExtraTime = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can request extra time.", 403);
  }

  const { id } = req.params;
  const { requestedMinutes, reason = "" } = req.body || {};

  const extraMinutes = Number(requestedMinutes);
  if (!Number.isFinite(extraMinutes) || extraMinutes <= 0) {
    throw new AppError("A valid extra time request in minutes is required.", 400);
  }

  if (!String(reason || "").trim()) {
    throw new AppError("A clear reason is required for extra time request.", 400);
  }

  const job = await Job.findById(id);
  if (!job) {
    throw new AppError("Job not found.", 404);
  }

  if (String(job?.assignedWorker?.workerUserId || "") !== String(req.user._id)) {
    throw new AppError("You are not assigned to this job.", 403);
  }

  if (String(job?.status || "").toLowerCase() !== "work_in_progress") {
    throw new AppError("Extra time can only be requested while work is in progress.", 400);
  }

  if (String(job?.timeExtension?.status || "") === "requested" && String(job?.timeExtension?.clientResponseStatus || "") === "pending") {
    throw new AppError("There is already a pending extra time request awaiting client response.", 409);
  }

  const now = new Date();
  const startedAt = job?.startedAt ? new Date(job.startedAt) : null;
  const expectedDurationHours = Number(job?.expectedDurationHours || 0);
  const baseExpectedFinishAt =
    startedAt && Number.isFinite(expectedDurationHours) && expectedDurationHours > 0
      ? new Date(startedAt.getTime() + expectedDurationHours * 60 * 60 * 1000)
      : null;

  job.timeExtension = {
    ...(job.timeExtension?.toObject ? job.timeExtension.toObject() : job.timeExtension || {}),
    status: "requested",
    requestedByWorkerAt: now,
    requestedMinutes: extraMinutes,
    reason: String(reason).trim(),
    clientResponseStatus: "pending",
    clientRespondedAt: null,
    clientResponseNote: "",
    approvedAdditionalMinutes: 0,
    approvedByClientAt: null,
    lastRequestedExpectedFinishAt: baseExpectedFinishAt,
    newApprovedFinishAt: null,
    adminFollowUpStatus: "monitoring",
    adminFollowUpNote: "Awaiting client response on worker extra-time request.",
    adminResolvedAt: null,
    adminResolvedById: null
  };

  appendJobEvent(job, {
    type: "worker_requested_extra_time",
    title: "Worker requested extra time",
    note: `Requested ${extraMinutes} minutes | Reason: ${String(reason).trim()} | Waiting for client response and admin visibility`,
    actorRole: USER_ROLES.WORKER,
    actorId: req.user._id
  });

  await job.save();

  return sendSuccess(res, {
    message: "Extra time request submitted successfully.",
    data: job
  });
});

export const clientRespondExtraTime = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Only clients can respond to extra time requests.", 403);
  }

  const { id } = req.params;
  const { decision, responseNote = "" } = req.body || {};
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  const normalizedDecisionSafe = normalizedDecision === "declined" ? "deferred" : normalizedDecision;

  if (!["approved", "deferred", "declined"].includes(normalizedDecision)) {
    throw new AppError("Decision must be approved, deferred, or declined.", 400);
  }

  const job = await Job.findById(id);
  if (!job) {
    throw new AppError("Job not found.", 404);
  }

  if (String(job?.clientUserId || "") !== String(req.user._id)) {
    throw new AppError("This job does not belong to you.", 403);
  }

  if (String(job?.status || "").toLowerCase() !== "work_in_progress") {
    throw new AppError("Extra time response is only allowed while work is in progress.", 400);
  }

  if (String(job?.timeExtension?.status || "") !== "requested" || String(job?.timeExtension?.clientResponseStatus || "") !== "pending") {
    throw new AppError("There is no pending worker extra time request on this job.", 400);
  }

  if (normalizedDecisionSafe === "deferred" && !String(responseNote || "").trim()) {
    throw new AppError("A response note is required when extra time is deferred.", 400);
  }

  const now = new Date();
  job.timeExtension.clientRespondedAt = now;
  job.timeExtension.clientResponseStatus = normalizedDecisionSafe;
  job.timeExtension.clientResponseNote = String(responseNote || "").trim();

  if (normalizedDecisionSafe === "approved") {
    const approvedMinutes = Number(job?.timeExtension?.requestedMinutes || 0);
    const baseFinish = job?.timeExtension?.lastRequestedExpectedFinishAt
      ? new Date(job.timeExtension.lastRequestedExpectedFinishAt)
      : null;

    job.timeExtension.status = "approved";
    job.timeExtension.approvedAdditionalMinutes = approvedMinutes;
    job.timeExtension.approvedByClientAt = now;
    job.timeExtension.newApprovedFinishAt = baseFinish
      ? new Date(baseFinish.getTime() + approvedMinutes * 60 * 1000)
      : null;
    job.timeExtension.adminFollowUpStatus = "resolved";
    job.timeExtension.adminFollowUpNote = "Client approved extra time. Admin visibility updated.";
    job.timeExtension.adminResolvedAt = now;
    job.timeExtension.adminResolvedById = req.user._id;

    appendJobEvent(job, {
      type: "client_approved_extra_time",
      title: "Client approved extra time",
      note: `Approved ${approvedMinutes} extra minutes${String(responseNote || "").trim() ? ` | ${String(responseNote).trim()}` : ""} | Admin copied in workflow`,
      actorRole: USER_ROLES.CLIENT,
      actorId: req.user._id
    });
  } else {
    job.timeExtension.status = "deferred";
    job.timeExtension.approvedAdditionalMinutes = 0;
    job.timeExtension.approvedByClientAt = null;
    job.timeExtension.newApprovedFinishAt = null;
    job.timeExtension.adminFollowUpStatus = "monitoring";
    job.timeExtension.adminFollowUpNote = String(responseNote || "").trim() || "Client did not approve more time.";
    job.timeExtension.adminResolvedAt = null;
    job.timeExtension.adminResolvedById = null;

    appendJobEvent(job, {
      type: "client_deferred_extra_time",
      title: "Client deferred extra time",
      note: `${String(responseNote || "").trim() || "Client did not approve more time"} | Admin copied in workflow`,
      actorRole: USER_ROLES.CLIENT,
      actorId: req.user._id
    });
  }

  await job.save();

  return sendSuccess(res, {
    message: normalizedDecisionSafe === "approved"
      ? "Extra time approved successfully."
      : "Extra time request deferred successfully.",
    data: job
  });
});



import mongoose from "mongoose";
import { SERVICE_CATEGORIES } from "../constants/services.js";
import {
  JOB_STATUS_VALUES,
  JOB_STATUSES,
  JOB_ASSIGNMENT_STATUS_VALUES,
  JOB_ASSIGNMENT_STATUSES,
  JOB_PAYMENT_STATUS_VALUES,
  JOB_PAYMENT_STATUSES
} from "../constants/jobs.js";

const jobLocationSchema = new mongoose.Schema(
  {
    county: { type: String, trim: true, default: "" },
    town: { type: String, trim: true, default: "" },
    estate: { type: String, trim: true, default: "" },
    addressLine: { type: String, trim: true, default: "" },
    houseDetails: { type: String, trim: true, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    googlePlaceId: { type: String, trim: true, default: "" },
    googlePinUrl: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const jobWorkerSnapshotSchema = new mongoose.Schema(
  {
    workerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    workerProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkerProfile", default: null },
    fullName: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const pricingSchema = new mongoose.Schema(
  {
    finalClientChargeAmount: { type: Number, default: 0, min: 0 },
    workerOfferedAmount: { type: Number, default: 0, min: 0 },
    platformRetentionRate: { type: Number, default: 20, min: 0, max: 100 },
    platformRetentionAmount: { type: Number, default: 0, min: 0 },
    adminGrossMarginAmount: { type: Number, default: 0 },
    clientQuoteNotes: { type: String, trim: true, default: "" },
    workerAssignmentNotes: { type: String, trim: true, default: "" },
    clientQuoteAcceptedAt: { type: Date, default: null },
    clientQuoteDeclinedAt: { type: Date, default: null },
    clientQuoteDeferredAt: { type: Date, default: null },
    clientQuoteDeferredReason: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    paymentStatus: {
      type: String,
      enum: JOB_PAYMENT_STATUS_VALUES,
      default: JOB_PAYMENT_STATUSES.UNPAID
    },
    depositPercentage: {
      type: Number,
      default: 30,
      min: 0,
      max: 100
    },
    depositAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    balanceAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    depositPaidAt: { type: Date, default: null },
    clientReportedBalancePaidAt: { type: Date, default: null },
    balancePaidAt: { type: Date, default: null },
    clientPaymentProofText: { type: String, trim: true, default: "" },
    adminPaymentVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    adminPaymentVerifiedAt: { type: Date, default: null }
  },
  { _id: false }
);

const adminClearanceSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["not_required", "awaiting_clearance", "issue_raised", "resolved", "cleared"],
      default: "not_required"
    },
    clearedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    clearedAt: { type: Date, default: null },
    issueRaisedByClientAt: { type: Date, default: null },
    issueRaisedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    issueRaisedAt: { type: Date, default: null },
    resolvedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    clientIssueNotes: { type: String, trim: true, default: "" },
    workerExplanation: { type: String, trim: true, default: "" },
    adminActionNotes: { type: String, trim: true, default: "" },
    clientRating: { type: Number, default: 0, min: 0, max: 5 },
    clientComment: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const activityLogSchema = new mongoose.Schema(
  {
    type: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    note: { type: String, trim: true, default: "" },
    actorRole: { type: String, trim: true, default: "" },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);


const timeExtensionSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["none", "requested", "approved", "deferred"],
      default: "none"
    },
    requestedByWorkerAt: { type: Date, default: null },
    requestedMinutes: { type: Number, default: 0, min: 0, max: 480 },
    reason: { type: String, trim: true, default: "" },

    clientResponseStatus: {
      type: String,
      enum: ["pending", "approved", "deferred"],
      default: "pending"
    },
    clientRespondedAt: { type: Date, default: null },
    clientResponseNote: { type: String, trim: true, default: "" },

    approvedAdditionalMinutes: { type: Number, default: 0, min: 0, max: 480 },
    approvedByClientAt: { type: Date, default: null },

    lastRequestedExpectedFinishAt: { type: Date, default: null },
    newApprovedFinishAt: { type: Date, default: null },

    adminFollowUpStatus: {
      type: String,
      enum: ["none", "monitoring", "resolved"],
      default: "none"
    },
    adminFollowUpNote: { type: String, trim: true, default: "" },
    adminResolvedAt: { type: Date, default: null },
    adminResolvedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    clientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    clientProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientProfile",
      default: null
    },
    serviceCategory: {
      type: String,
      required: true,
      enum: SERVICE_CATEGORIES
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 160
    },
    description: { type: String, trim: true, default: "" },
    photoUrls: { type: [String], default: [] },
    instructions: { type: String, trim: true, default: "" },
    avoidNotes: { type: String, trim: true, default: "" },
    budgetAmount: { type: Number, default: 0, min: 0 },
    isBudgetNegotiable: { type: Boolean, default: true },
    expectedDurationHours: { type: Number, default: 1, min: 0.5, max: 24 },
    preferredStartAt: { type: Date, required: true },
    mustBeCompletedBy: { type: Date, default: null },
    status: {
      type: String,
      enum: JOB_STATUS_VALUES,
      default: JOB_STATUSES.PENDING_REVIEW,
      index: true
    },
    assignmentStatus: {
      type: String,
      enum: JOB_ASSIGNMENT_STATUS_VALUES,
      default: JOB_ASSIGNMENT_STATUSES.UNASSIGNED,
      index: true
    },
    location: {
      type: jobLocationSchema,
      required: true
    },
    pricing: {
      type: pricingSchema,
      default: () => ({})
    },
    payment: {
      type: paymentSchema,
      default: () => ({})
    },
    adminClearance: {

      type: adminClearanceSchema,
      default: () => ({})
    },
    activityLog: {
      type: [activityLogSchema],
      default: []
    },
    timeExtension: {
      type: timeExtensionSchema,
      default: () => ({})
    },
    assignedWorker: {
      type: jobWorkerSnapshotSchema,
      default: () => ({})
    },
    currentLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
      capturedDuringStatus: { type: String, trim: true, default: "" }
    },
    currentLocationHistory: {
      type: [
        {
          lat: { type: Number, default: null },
          lng: { type: Number, default: null },
          updatedAt: { type: Date, default: null },
          capturedDuringStatus: { type: String, trim: true, default: "" }
        }
      ],
      default: []
    },
    assignedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    assignedAt: { type: Date, default: null },
    workerOfferStatus: {
      type: String,
      enum: ["none", "pending", "accepted", "declined", "expired"],
      default: "none"
    },
    workerOfferSentAt: { type: Date, default: null },
    workerOfferExpiresAt: { type: Date, default: null },
    workerAcceptedAt: { type: Date, default: null },
    enRouteAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    clientVerifiedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    workerDeclinedAt: { type: Date, default: null },
    declineReason: { type: String, trim: true, default: "" },
    completionNotes: { type: String, trim: true, default: "" },
    cancellationReason: { type: String, trim: true, default: "" },
    disputeReason: { type: String, trim: true, default: "" },
    payout: {
      isPaid: { type: Boolean, default: false },
      amount: { type: Number, default: 0 },
      mpesaNumber: { type: String, trim: true, default: "" },
      mpesaName: { type: String, trim: true, default: "" },
      mpesaMessage: { type: String, trim: true, default: "" },
      mpesaTransactionCode: { type: String, trim: true, default: "" },
      note: { type: String, trim: true, default: "" },
      workerSnapshotName: { type: String, trim: true, default: "" },
      workerSnapshotPhone: { type: String, trim: true, default: "" },
      paidAt: { type: Date, default: null },
      paidByAdminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      }
    }
  },
  {
    timestamps: true
  }
);

jobSchema.index({ clientUserId: 1, createdAt: -1 });
jobSchema.index({ status: 1, assignmentStatus: 1, preferredStartAt: 1 });
jobSchema.index({ "assignedWorker.workerUserId": 1, status: 1 });
jobSchema.index({ serviceCategory: 1, "location.town": 1, "location.estate": 1 });

const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

export default Job;







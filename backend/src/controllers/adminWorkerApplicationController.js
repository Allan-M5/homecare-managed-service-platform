import crypto from "crypto";
import WorkerApplication from "../models/WorkerApplication.js";
import WorkerProfile from "../models/WorkerProfile.js";
import User from "../models/User.js";
import { USER_ROLES } from "../constants/roles.js";
import {
  WORKER_APPLICATION_STATUSES
} from "../constants/worker.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { generateTempPassword } from "../utils/generateTempPassword.js";

export const listWorkerApplications = asyncHandler(async (req, res) => {
  const { status = "", page = 1, limit = 20, search = "" } = req.query;

  const numericPage = Math.max(Number(page) || 1, 1);
  const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const filter = {};
  if (status) {
    filter.status = status;
  }

  const [applications, total] = await Promise.all([
    WorkerApplication.find(filter)
      .populate("reviewedBy", "fullName phone role")
      .sort({ createdAt: -1 })
      .skip((numericPage - 1) * numericLimit)
      .limit(numericLimit)
      .lean(),
    WorkerApplication.countDocuments(filter)
  ]);

  return sendSuccess(res, {
    message: "Worker applications fetched successfully.",
    data: applications,
    meta: {
      page: numericPage,
      limit: numericLimit,
      total,
      totalPages: Math.ceil(total / numericLimit)
    }
  });
});

export const reviewWorkerApplication = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    decision,
    adminReviewNotes = "",
    rejectionReason = ""
  } = req.body;

  const allowedDecisions = [
    WORKER_APPLICATION_STATUSES.APPROVED,
    WORKER_APPLICATION_STATUSES.REJECTED,
    WORKER_APPLICATION_STATUSES.NEEDS_MORE_INFO
  ];

  if (!allowedDecisions.includes(decision)) {
    throw new AppError("Invalid review decision.", 400);
  }

  const application = await WorkerApplication.findById(id);

  if (!application) {
    throw new AppError("Worker application not found.", 404);
  }

  if (application.status === WORKER_APPLICATION_STATUSES.APPROVED) {
    throw new AppError("This application has already been approved.", 409);
  }

  application.status = decision;
  application.adminReviewNotes = adminReviewNotes;
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();

  if (decision === WORKER_APPLICATION_STATUSES.REJECTED) {
    application.rejectionReason = rejectionReason || "Application rejected by admin.";
    await application.save();

    return sendSuccess(res, {
      message: "Worker application rejected successfully.",
      data: application
    });
  }

  if (decision === WORKER_APPLICATION_STATUSES.NEEDS_MORE_INFO) {
    application.rejectionReason = "";
    await application.save();

    return sendSuccess(res, {
      message: "Worker application marked as needing more information.",
      data: application
    });
  }

  const existingUser = await User.findOne({ phone: application.phone });

  if (existingUser) {
    throw new AppError(
      "Cannot approve application because a user with this phone already exists.",
      409
    );
  }

  const tempPassword = generateTempPassword();
  const recoveryKey = crypto.randomBytes(16).toString("hex").toUpperCase();
  const recoveryKeyHash = crypto.createHash("sha256").update(recoveryKey).digest("hex");

  const workerUser = await User.create({
    fullName: application.fullName,
    email: application.email || null,
    phone: application.phone,
    password: tempPassword,
    role: USER_ROLES.WORKER,
    accountStatus: "active",
    mustChangePassword: true,
    recoveryKeyHash
  });

  await WorkerProfile.create({
    userId: workerUser._id,
    applicationId: application._id,
    homeLocation: application.homeLocation,
    serviceCategories: application.serviceCategories,
    accountStatus: "active",
    preferredWorkRadiusKm: application.preferredWorkRadiusKm,
    canBringOwnSupplies: application.canBringOwnSupplies,
    mpesaNumber: application.mpesaNumber,
    yearsOfExperience: application.yearsOfExperience,
    experienceSummary: application.experienceSummary,
    adminNotes: adminReviewNotes
  });

  application.rejectionReason = "";
  await application.save();

  return sendSuccess(res, {
    message: "Worker application approved and worker account created successfully.",
    data: {
      application,
      workerUser: {
        id: workerUser._id,
        fullName: workerUser.fullName,
        phone: workerUser.phone,
        email: workerUser.email,
        role: workerUser.role,
        mustChangePassword: workerUser.mustChangePassword
      },
      tempPassword,
      recoveryKey
    }
  });
});

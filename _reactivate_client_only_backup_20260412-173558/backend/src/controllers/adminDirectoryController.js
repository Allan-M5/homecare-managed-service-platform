import User from "../models/User.js";
import ClientProfile from "../models/ClientProfile.js";
import WorkerProfile from "../models/WorkerProfile.js";
import Job from "../models/Job.js";
import { USER_ROLES } from "../constants/roles.js";
import { WORKER_ACCOUNT_STATUSES } from "../constants/worker.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { sendSuccess } from "../utils/apiResponse.js";

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listClientDirectory = asyncHandler(async (req, res) => {
  const { search = "", status = "" } = req.query;

  const baseFilter = { role: USER_ROLES.CLIENT };
  if (status) {
    baseFilter.accountStatus = status;
  } else {
    baseFilter.accountStatus = { $nin: ["deleted", "DELETED_BY_ADMIN", "DEACTIVATED_BY_USER"] };
  }

  let users = await User.find(baseFilter)
    .select("fullName phone email role accountStatus deletionReason deletedAt createdAt lastLoginAt")
    .sort({ createdAt: -1 })
    .lean();

  const clientIds = users.map((user) => user._id);
  const profiles = await ClientProfile.find({ userId: { $in: clientIds } }).lean();
  const latestJobs = await Job.find({ clientUserId: { $in: clientIds } })
    .select("clientUserId location createdAt updatedAt")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const profileMap = new Map(profiles.map((profile) => [String(profile.userId), profile]));
  const latestJobMap = new Map();
  latestJobs.forEach((job) => {
    const key = String(job.clientUserId);
    if (!latestJobMap.has(key)) latestJobMap.set(key, job);
  });

  const hasLocationValue = (location = {}) => Boolean(
    String(location?.county || "").trim() ||
    String(location?.town || "").trim() ||
    String(location?.estate || "").trim() ||
    String(location?.addressLine || "").trim() ||
    String(location?.houseDetails || "").trim()
  );

  let results = users.map((user) => {
    const profile = profileMap.get(String(user._id)) || null;
    const latestJob = latestJobMap.get(String(user._id)) || null;
    const profileLocation = profile?.defaultLocation || {};
    const fallbackLocation = latestJob?.location || {};
    const resolvedLocation = hasLocationValue(profileLocation) ? profileLocation : fallbackLocation;
    return {
      ...user,
      profile: profile
        ? {
            ...profile,
            defaultLocation: resolvedLocation
          }
        : {
            defaultLocation: resolvedLocation
          },
      latestJobLocation: fallbackLocation,
      registrationDate: user.createdAt,
      currentAccountState: user.accountStatus
    };
  });

  if (search.trim()) {
    const pattern = new RegExp(escapeRegex(search.trim()), "i");
    results = results.filter((item) => {
      const profile = item.profile || {};
      const location = profile.defaultLocation || {};
      return (
        pattern.test(item.fullName || "") ||
        pattern.test(item.phone || "") ||
        pattern.test(item.email || "") ||
        pattern.test(location.county || "") ||
        pattern.test(location.town || "") ||
        pattern.test(location.estate || "") ||
        pattern.test(location.addressLine || "")
      );
    });
  }

  return sendSuccess(res, {
    message: "Client directory fetched successfully.",
    data: results
  });
});

export const listWorkerDirectory = asyncHandler(async (req, res) => {
  const { search = "", status = "" } = req.query;

  const userFilter = { role: USER_ROLES.WORKER };
  if (status) {
    userFilter.accountStatus = status;
  } else {
    userFilter.accountStatus = { $ne: "deleted" };
  }

  const users = await User.find(userFilter)
    .select("fullName phone email role accountStatus suspendedReason suspendedAt reactivatedAt reactivationNote createdAt lastLoginAt deletedAt deletionReason")
    .sort({ createdAt: -1 })
    .lean();

  const workerIds = users.map((user) => user._id);
  const profiles = await WorkerProfile.find({ userId: { $in: workerIds } })
    .populate("applicationId")
    .lean();

  const profileMap = new Map(profiles.map((profile) => [String(profile.userId), profile]));

  let results = users.map((user) => {
    const profile = profileMap.get(String(user._id)) || null;
    const application = profile?.applicationId || null;

    return {
      ...user,
      profile,
      applicationSummary: application
        ? {
            submittedAt: application.createdAt || null,
            approvedAt: application.reviewedAt || null,
            applicationStatus: application.status || ""
          }
        : null,
      applicationRecord: application || null,
      currentAccountState: profile?.accountStatus || user.accountStatus
    };
  });

  if (search.trim()) {
    const pattern = new RegExp(escapeRegex(search.trim()), "i");
    results = results.filter((item) => {
      const profile = item.profile || {};
      const home = profile.homeLocation || {};
      const services = Array.isArray(profile.serviceCategories) ? profile.serviceCategories.join(" ") : "";
      return (
        pattern.test(item.fullName || "") ||
        pattern.test(item.phone || "") ||
        pattern.test(item.email || "") ||
        pattern.test(home.county || "") ||
        pattern.test(home.town || "") ||
        pattern.test(home.estate || "") ||
        pattern.test(services)
      );
    });
  }

  return sendSuccess(res, {
    message: "Worker directory fetched successfully.",
    data: results
  });
});

export const suspendWorkerAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason = "" } = req.body;

  if (!reason.trim()) {
    throw new AppError("Suspension reason is required.", 400);
  }

  const user = await User.findOne({ _id: id, role: USER_ROLES.WORKER });
  if (!user) {
    throw new AppError("Worker account not found.", 404);
  }

  const profile = await WorkerProfile.findOne({ userId: user._id });
  if (!profile) {
    throw new AppError("Worker profile not found.", 404);
  }

  user.accountStatus = "suspended";
  user.suspendedReason = reason.trim();
  user.suspendedAt = new Date();
  user.reactivatedAt = null;
  user.reactivationNote = "";
  await user.save();

  profile.accountStatus = WORKER_ACCOUNT_STATUSES.SUSPENDED;
  profile.suspensionReason = reason.trim();
  profile.availability = {
    ...profile.availability,
    status: "suspended",
    reason: reason.trim(),
    updatedAt: new Date()
  };
  await profile.save();

  return sendSuccess(res, {
    message: "Worker suspended successfully.",
    data: {
      userId: user._id,
      accountStatus: user.accountStatus,
      reason: user.suspendedReason
    }
  });
});

export const reactivateWorkerAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolutionNote = "" } = req.body;

  const user = await User.findOne({ _id: id, role: USER_ROLES.WORKER });
  if (!user) {
    throw new AppError("Worker account not found.", 404);
  }

  const profile = await WorkerProfile.findOne({ userId: user._id });
  if (!profile) {
    throw new AppError("Worker profile not found.", 404);
  }

  user.accountStatus = "active";
  user.suspendedReason = "";
  user.reactivatedAt = new Date();
  user.reactivationNote = resolutionNote.trim();
  await user.save();

  profile.accountStatus = WORKER_ACCOUNT_STATUSES.ACTIVE;
  profile.suspensionReason = resolutionNote.trim();
  profile.availability = {
    ...profile.availability,
    status: "offline",
    reason: resolutionNote.trim(),
    updatedAt: new Date()
  };
  await profile.save();

  return sendSuccess(res, {
    message: "Worker reactivated successfully.",
    data: {
      userId: user._id,
      accountStatus: user.accountStatus,
      resolutionNote: resolutionNote.trim()
    }
  });
});

export const deleteWorkerAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason = "" } = req.body;

  if (!reason.trim()) {
    throw new AppError("Deletion reason is required.", 400);
  }

  const user = await User.findOne({ _id: id, role: USER_ROLES.WORKER });
  if (!user) {
    throw new AppError("Worker account not found.", 404);
  }

  const profile = await WorkerProfile.findOne({ userId: user._id });
  if (!profile) {
    throw new AppError("Worker profile not found.", 404);
  }

  user.accountStatus = "deleted";
  user.deletedAt = new Date();
  user.deletionReason = reason.trim();
  user.suspendedReason = "";
  user.suspendedAt = null;
  user.reactivatedAt = null;
  user.reactivationNote = "";
  await user.save();

  profile.accountStatus = "deleted";
  profile.suspensionReason = "";
  profile.availability = {
    ...profile.availability,
    status: "deleted",
    reason: reason.trim(),
    updatedAt: new Date()
  };
  await profile.save();

  return sendSuccess(res, {
    message: "Worker account deleted successfully.",
    data: {
      userId: user._id,
      accountStatus: user.accountStatus,
      deletedAt: user.deletedAt,
      deletionReason: user.deletionReason
    }
  });
});


export const deleteClientAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || "").trim();

  if (!reason) {
    throw new AppError("Deletion reason is required.", 400);
  }

  const user = await User.findOne({ _id: id, role: USER_ROLES.CLIENT });
  if (!user) {
    throw new AppError("Client account not found.", 404);
  }

  const deletedAt = new Date();

  await User.updateOne(
    { _id: user._id, role: USER_ROLES.CLIENT },
    {
      $set: {
        accountStatus: "deleted",
        deletedAt,
        deletionReason: reason,
        suspendedReason: ""
      }
    }
  );

  await ClientProfile.updateOne(
    { userId: user._id },
    {
      $set: {
        accountStatus: "deleted",
        updatedAt: deletedAt
      }
    }
  );

  return sendSuccess(res, {
    message: "Client account deleted successfully.",
    data: {
      userId: user._id,
      accountStatus: "deleted",
      deletedAt,
      deletionReason: reason
    }
  });
});

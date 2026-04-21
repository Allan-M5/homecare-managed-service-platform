import WorkerProfile from "../models/WorkerProfile.js";
import WorkerApplication from "../models/WorkerApplication.js";
import { USER_ROLES } from "../constants/roles.js";
import {
  WORKER_AVAILABILITY_STATUS_VALUES
} from "../constants/worker.js";
import Job from "../models/Job.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { sendSuccess } from "../utils/apiResponse.js";

const getWorkerProfileOrThrow = async (userId) => {
  const profile = await WorkerProfile.findOne({ userId }).lean();
  if (!profile) {
    throw new AppError("Worker profile not found.", 404);
  }
  return profile;
};

const refreshScheduledAvailabilityIfDue = async (userId) => {
  const profile = await WorkerProfile.findOne({ userId });
  if (!profile) {
    throw new AppError("Worker profile not found.", 404);
  }

  const dueAt = profile.availability?.availableAt ? new Date(profile.availability.availableAt).getTime() : null;
  const shouldAutoSwitch =
    profile.availability?.autoSwitch &&
    dueAt &&
    dueAt <= Date.now();

  if (shouldAutoSwitch) {
    profile.availability.status = "available";
    profile.availability.reason = "Auto-restored to available at scheduled time.";
    profile.availability.updatedAt = new Date();
    profile.availability.availableAt = null;
    profile.availability.autoSwitch = false;
    profile.lastSeenAt = new Date();
    await profile.save({ validateModifiedOnly: true });
  }

  return profile.toObject();
};

const refreshAllDueWorkerAvailability = async () => {
  const dueWorkers = await WorkerProfile.find({
    "availability.autoSwitch": true,
    "availability.availableAt": { $lte: new Date() }
  });

  for (const worker of dueWorkers) {
    worker.availability.status = "available";
    worker.availability.reason = "Auto-restored to available at scheduled time.";
    worker.availability.updatedAt = new Date();
    worker.availability.availableAt = null;
    worker.availability.autoSwitch = false;
    worker.lastSeenAt = new Date();
    await worker.save({ validateModifiedOnly: true });
  }
};

const scoreWorkerAgainstJob = (workerProfile, job) => {
  const jobEstate = String(job?.location?.estate || "").trim().toLowerCase();
  const jobTown = String(job?.location?.town || "").trim().toLowerCase();
  const jobCounty = String(job?.location?.county || "").trim().toLowerCase();

  const currentEstate = String(workerProfile?.currentLocation?.estate || "").trim().toLowerCase();
  const currentTown = String(workerProfile?.currentLocation?.town || "").trim().toLowerCase();
  const currentCounty = String(workerProfile?.currentLocation?.county || "").trim().toLowerCase();

  const homeEstate = String(workerProfile?.homeLocation?.estate || "").trim().toLowerCase();
  const homeTown = String(workerProfile?.homeLocation?.town || "").trim().toLowerCase();
  const homeCounty = String(workerProfile?.homeLocation?.county || "").trim().toLowerCase();

  let score = 0;
  let priorityLabel = "other_region";

  if (jobEstate && (currentEstate === jobEstate || homeEstate === jobEstate)) {
    score += 100;
    priorityLabel = "same_estate";
  } else if (jobTown && (currentTown === jobTown || homeTown === jobTown)) {
    score += 70;
    priorityLabel = "same_town";
  } else if (jobCounty && (currentCounty === jobCounty || homeCounty === jobCounty)) {
    score += 40;
    priorityLabel = "same_county";
  }

  if (workerProfile.availability?.status === "available") {
    score += 20;
  }

  score += Math.max(0, 10 - (workerProfile.metrics?.complaintCount || 0));
  score += Math.min(10, Math.floor((workerProfile.metrics?.totalJobsCompleted || 0) / 5));

  return { score, priorityLabel };
};

export const getWorkerDashboard = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can access this dashboard.", 403);
  }

  const profile = await refreshScheduledAvailabilityIfDue(req.user._id);
  const applicationRecord = profile?.applicationId
    ? await WorkerApplication.findById(profile.applicationId).lean()
    : null;

  return sendSuccess(res, {
    message: "Worker dashboard fetched successfully.",
    data: {
      worker: {
        id: req.user._id,
        fullName: req.user.fullName,
        phone: req.user.phone,
        email: req.user.email,
        role: req.user.role,
        mustChangePassword: req.user.mustChangePassword,
        accountStatus: req.user.accountStatus,
        lastLoginAt: req.user.lastLoginAt
      },
      profile,
      applicationRecord,
      summary: {
        availabilityStatus: profile.availability?.status || "offline",
        totalJobsCompleted: profile.metrics?.totalJobsCompleted || 0,
        averageRating: profile.metrics?.averageRating || 0,
        complaintCount: profile.metrics?.complaintCount || 0
      }
    }
  });
});

export const updateWorkerAvailability = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can update availability.", 403);
  }

  const { status, reason = "", availableAt = null } = req.body;

  if (!status || !WORKER_AVAILABILITY_STATUS_VALUES.includes(status)) {
    throw new AppError("Invalid worker availability status.", 400);
  }

  const futureTime = availableAt ? new Date(availableAt) : null;
  const hasFutureTime = futureTime && !Number.isNaN(futureTime.getTime()) && futureTime.getTime() > Date.now();

  let effectiveStatus = status;
  let effectiveReason = reason || "";

  if (status === "available" && hasFutureTime) {
    effectiveStatus = "unavailable";
    effectiveReason = reason || "Worker scheduled future availability.";
  }

  if (status === "unavailable" && hasFutureTime) {
    effectiveReason = reason || "Worker temporarily unavailable until scheduled return time.";
  }

  const updatedProfile = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id },
    {
      $set: {
        availability: {
          status: effectiveStatus,
          reason: effectiveReason,
          updatedAt: new Date(),
          availableAt: hasFutureTime ? futureTime : null,
          autoSwitch: !!hasFutureTime
        },
        lastSeenAt: new Date()
      }
    },
    {
      new: true
    }
  ).lean();

  if (!updatedProfile) {
    throw new AppError("Worker profile not found.", 404);
  }

  return sendSuccess(res, {
    message: "Worker availability updated successfully.",
    data: updatedProfile
  });
});

export const updateWorkerCurrentLocation = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can update location.", 403);
  }

  const {
    county = "",
    town = "",
    estate = "",
    addressLine = "",
    latitude = null,
    longitude = null,
    googlePlaceId = ""
  } = req.body;

  const updatedProfile = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id },
    {
      $set: {
        currentLocation: {
          county,
          town,
          estate,
          addressLine,
          latitude,
          longitude,
          googlePlaceId
        },
        lastSeenAt: new Date()
      }
    },
    {
      new: true
    }
  ).lean();

  if (!updatedProfile) {
    throw new AppError("Worker profile not found.", 404);
  }

  return sendSuccess(res, {
    message: "Worker current location updated successfully.",
    data: updatedProfile
  });
});

export const getAvailableWorkers = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can view available workers.", 403);
  }

  await refreshAllDueWorkerAvailability();

  const { jobId = "" } = req.query;

  const workers = await WorkerProfile.find({
    accountStatus: "active",
    "availability.status": "available"
  })
    .populate("userId", "fullName phone email")
    .lean();

  let rankedWorkers = workers.map((worker) => ({
    ...worker,
    rankingScore: 0,
    priorityLabel: "available"
  }));

  if (jobId) {
    const job = await Job.findById(jobId).lean();

    if (job) {
      rankedWorkers = workers
        .map((worker) => {
          const ranking = scoreWorkerAgainstJob(worker, job);
          return {
            ...worker,
            rankingScore: ranking.score,
            priorityLabel: ranking.priorityLabel
          };
        })
        .sort((a, b) => b.rankingScore - a.rankingScore);
    }
  }

  return sendSuccess(res, {
    message: "Available workers fetched successfully.",
    data: rankedWorkers
  });
});
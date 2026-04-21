import bcrypt from "bcryptjs";
import User from "../models/User.js";
import ClientProfile from "../models/ClientProfile.js";
import WorkerProfile from "../models/WorkerProfile.js";
import { USER_ROLES } from "../constants/roles.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { sendSuccess } from "../utils/apiResponse.js";

const trimText = (value = "") => String(value ?? "").trim();
const getRequestUserId = (reqUser = {}) => reqUser?._id || reqUser?.userId || null;

const normalizeProfilePhotoDisplay = (value = {}) => {
  const rawZoom = Number(value?.zoom);
  const rawOffsetX = Number(value?.offsetX);
  const rawOffsetY = Number(value?.offsetY);

  const clamp = (num, min, max, fallback) => {
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };

  return {
    zoom: clamp(rawZoom, 0.5, 3, 1),
    offsetX: clamp(rawOffsetX, 0, 100, 50),
    offsetY: clamp(rawOffsetY, 0, 100, 50)
  };
};

const diffAndAssign = (target = {}, incoming = {}, keys = []) => {
  const changes = [];

  keys.forEach((key) => {
    if (!(key in incoming)) return;
    const nextValue = trimText(incoming[key]);
    const prevValue = trimText(target[key] ?? "");
    if (nextValue !== prevValue) {
      target[key] = nextValue;
      changes.push(`${key}: "${prevValue || "-"}" -> "${nextValue || "-"}"`);
    }
  });

  return changes;
};

const appendAudit = (profile, reqUser, actorRole, actorName, reason, changes) => {
  profile.profileAuditTrail = Array.isArray(profile.profileAuditTrail) ? profile.profileAuditTrail : [];
  profile.profileAuditTrail.push({
    actorRole,
    actorId: getRequestUserId(reqUser),
    actorName: actorName || "",
    reason: trimText(reason || ""),
    changes,
    at: new Date()
  });
};

export const updateMyClientProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Only clients can update this profile.", 403);
  }

  const requestUserId = getRequestUserId(req.user);
  const user = await User.findById(requestUserId);
  const profile = await ClientProfile.findOne({ userId: requestUserId });

  if (!user || !profile) {
    throw new AppError("Client profile not found.", 404);
  }

  const incoming = {
    ...req.body,
    notesForAdmin: req.body?.notesForAdmin ?? req.body?.adminNotes ?? ""
  };
  const changes = [];
  changes.push(...diffAndAssign(user, incoming, ["fullName", "phone", "email"]));
  profile.defaultLocation = profile.defaultLocation || {};
  changes.push(...diffAndAssign(profile.defaultLocation, incoming, ["county", "town", "estate", "addressLine", "houseDetails"]));
  changes.push(...diffAndAssign(profile, incoming, ["notesForAdmin"]));

  if (changes.length) {
    appendAudit(profile, req.user, "client", user.fullName, "Self-service profile edit", changes);
    await user.save({ validateModifiedOnly: true });
    await profile.save({ validateModifiedOnly: true });
  }

  return sendSuccess(res, {
    message: changes.length ? "Client profile updated successfully." : "No profile changes were submitted.",
    data: { user, profile }
  });
});

export const updateMyWorkerProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.WORKER) {
    throw new AppError("Only workers can update this profile.", 403);
  }

  const requestUserId = getRequestUserId(req.user);
  const user = await User.findById(requestUserId);
  const profile = await WorkerProfile.findOne({ userId: requestUserId });

  if (!user || !profile) {
    throw new AppError("Worker profile not found.", 404);
  }

  const incoming = {
    ...req.body,
    adminNotes: req.body?.adminNotes ?? req.body?.reason ?? ""
  };
  const changes = [];
  changes.push(...diffAndAssign(user, incoming, ["fullName", "phone", "email"]));
  profile.homeLocation = profile.homeLocation || {};
  changes.push(...diffAndAssign(profile.homeLocation, incoming, ["county", "town", "estate", "addressLine", "googlePinUrl"]));
  changes.push(...diffAndAssign(profile, incoming, ["mpesaNumber", "experienceSummary", "preferredWorkRadiusKm", "canBringOwnSupplies", "yearsOfExperience", "adminNotes", "serviceCategories", "nextOfKinName", "nextOfKinPhone", "nextOfKinRelationship", "emergencyContactName", "emergencyContactPhone", "emergencyContactRelationship", "bankName", "bankAccountName", "bankAccountNumber"]));

  if ("profilePhotoDisplay" in incoming) {
    const currentPhotoDisplay = normalizeProfilePhotoDisplay(profile.profilePhotoDisplay || {});
    const nextPhotoDisplay = normalizeProfilePhotoDisplay(incoming.profilePhotoDisplay || {});
    if (
      currentPhotoDisplay.zoom !== nextPhotoDisplay.zoom ||
      currentPhotoDisplay.offsetX !== nextPhotoDisplay.offsetX ||
      currentPhotoDisplay.offsetY !== nextPhotoDisplay.offsetY
    ) {
      profile.profilePhotoDisplay = nextPhotoDisplay;
      changes.push(
        `profilePhotoDisplay: "${currentPhotoDisplay.zoom}/${currentPhotoDisplay.offsetX}/${currentPhotoDisplay.offsetY}" -> "${nextPhotoDisplay.zoom}/${nextPhotoDisplay.offsetX}/${nextPhotoDisplay.offsetY}"`
      );
    }
  }

  if (changes.length) {
    appendAudit(profile, req.user, "worker", user.fullName, "Self-service profile edit", changes);
    await user.save({ validateModifiedOnly: true });
    await profile.save({ validateModifiedOnly: true });
  }

  return sendSuccess(res, {
    message: changes.length ? "Worker profile updated successfully." : "No profile changes were submitted.",
    data: { user, profile }
  });
});

export const adminOverrideClientProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admin can perform this action.", 403);
  }

  const adminUserId = getRequestUserId(req.user);
  const admin = await User.findById(adminUserId);
  const user = await User.findById(req.params.userId);
  const profile = await ClientProfile.findOne({ userId: req.params.userId });

  if (!admin || !user || !profile || user.role !== USER_ROLES.CLIENT) {
    throw new AppError("Client profile not found.", 404);
  }

  const incoming = {
    ...req.body,
    notesForAdmin: req.body?.notesForAdmin ?? req.body?.adminNotes ?? "",
    reason: req.body?.reason ?? req.body?.adminNotes ?? ""
  };
  const changes = [];
  changes.push(...diffAndAssign(user, incoming, ["fullName", "phone", "email"]));
  profile.defaultLocation = profile.defaultLocation || {};
  changes.push(...diffAndAssign(profile.defaultLocation, incoming, ["county", "town", "estate", "addressLine", "houseDetails"]));
  changes.push(...diffAndAssign(profile, incoming, ["notesForAdmin"]));

  if (changes.length) {
    appendAudit(profile, req.user, "admin", admin.fullName, incoming.reason || "Admin override profile edit", changes);
    await user.save({ validateModifiedOnly: true });
    await profile.save({ validateModifiedOnly: true });
  }

  return sendSuccess(res, {
    message: changes.length ? "Client profile overridden successfully." : "No profile changes were submitted.",
    data: { user, profile }
  });
});

export const adminOverrideWorkerProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admin can perform this action.", 403);
  }

  const adminUserId = getRequestUserId(req.user);
  const admin = await User.findById(adminUserId);
  const user = await User.findById(req.params.userId);
  const profile = await WorkerProfile.findOne({ userId: req.params.userId });

  if (!admin || !user || !profile || user.role !== USER_ROLES.WORKER) {
    throw new AppError("Worker profile not found.", 404);
  }

  const incoming = {
    ...req.body,
    adminNotes: req.body?.adminNotes ?? req.body?.reason ?? "",
    reason: req.body?.reason ?? req.body?.adminNotes ?? ""
  };
  const changes = [];
  changes.push(...diffAndAssign(user, incoming, ["fullName", "phone", "email"]));
  profile.homeLocation = profile.homeLocation || {};
  changes.push(...diffAndAssign(profile.homeLocation, incoming, ["county", "town", "estate", "addressLine", "googlePinUrl"]));
  changes.push(...diffAndAssign(profile, incoming, ["mpesaNumber", "experienceSummary", "preferredWorkRadiusKm", "canBringOwnSupplies", "yearsOfExperience", "adminNotes", "serviceCategories", "nextOfKinName", "nextOfKinPhone", "nextOfKinRelationship", "emergencyContactName", "emergencyContactPhone", "emergencyContactRelationship", "bankName", "bankAccountName", "bankAccountNumber"]));

  if (changes.length) {
    appendAudit(profile, req.user, "admin", admin.fullName, incoming.reason || "Admin override profile edit", changes);
    await user.save({ validateModifiedOnly: true });
    await profile.save({ validateModifiedOnly: true });
  }

  return sendSuccess(res, {
    message: changes.length ? "Worker profile overridden successfully." : "No profile changes were submitted.",
    data: { user, profile }
  });
});





/* ================= ADMIN RESET WORKER PASSWORD ================= */
export const adminResetWorkerPassword = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admin can perform this action.", 403);
  }

  const { workerId } = req.params;
  const adminPassword = String(req.body?.adminPassword || "").trim();

  if (!adminPassword) {
    throw new AppError("Admin password confirmation is required.", 400);
  }

  const adminUserId = getRequestUserId(req.user);
  const admin = await User.findById(adminUserId).select("+password");
  if (!admin) {
    throw new AppError("Admin account not found.", 404);
  }

  const isPasswordValid = await bcrypt.compare(adminPassword, String(admin.password || ""));
  if (!isPasswordValid) {
    throw new AppError("Invalid admin password.", 401);
  }

  const worker = await User.findById(workerId).select("+password");
  if (!worker || worker.role !== USER_ROLES.WORKER) {
    throw new AppError("Worker not found.", 404);
  }

  const temporaryPassword = Math.random().toString(36).slice(-8);
  worker.password = temporaryPassword;
  worker.mustChangePassword = true;
  worker.lastPasswordResetAt = new Date();
  await worker.save();

  const workerProfile = await WorkerProfile.findOne({ userId: worker._id });

  if (workerProfile) {
    appendAudit(
      workerProfile,
      req.user,
      "admin",
      admin.fullName,
      "Admin reset worker password",
      ['password: "hidden" -> "temporary password regenerated"']
    );
    await workerProfile.save({ validateModifiedOnly: true });
  }

  return sendSuccess(res, {
    message: "Worker password reset successfully.",
    data: {
      fullName: worker.fullName || "",
      phone: worker.phone || "",
      email: worker.email || "",
      temporaryPassword
    }
  });
});export const adminSuspendClientAccount = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admin can perform this action.", 403);
  }

  const { clientId } = req.params;
  const reason = String(req.body?.reason || "").trim();

  if (!reason) {
    throw new AppError("Suspension reason is required.", 400);
  }

  const client = await User.findById(clientId);
  if (!client || client.role !== USER_ROLES.CLIENT) {
    throw new AppError("Client not found.", 404);
  }

  const profile = await ClientProfile.findOne({ userId: client._id });
  const suspendedAt = new Date();

  client.accountStatus = "suspended";
  client.currentAccountState = "suspended";
  client.suspendedAt = suspendedAt;
  client.suspendedReason = reason;
  client.reactivatedAt = null;
  client.reactivationNote = "";
  await client.save();

  if (profile) {
    profile.accountStatus = "suspended";
    appendAudit(
      profile,
      req.user,
      "admin",
      req.user?.fullName || "Admin",
      "Admin suspended client account",
      [
        `accountStatus: "${client.accountStatus || "-"}"`,
        `suspendedReason: "${reason}"`,
        `suspendedAt: "${suspendedAt.toISOString()}"`
      ]
    );
    await profile.save({ validateModifiedOnly: true });
  }

  return sendSuccess(res, {
    message: "Client suspended successfully.",
    data: {
      clientId: String(client._id),
      fullName: client.fullName || "",
      phone: client.phone || "",
      email: client.email || "",
      suspendedAt: client.suspendedAt,
      suspendedReason: client.suspendedReason || ""
    }
  });
});

export const adminResetClientPassword = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admin can perform this action.", 403);
  }

  const { clientId } = req.params;
  const adminPassword = String(req.body?.adminPassword || "").trim();

  if (!adminPassword) {
    throw new AppError("Admin password confirmation is required.", 400);
  }

  const adminUserId = getRequestUserId(req.user);
  const admin = await User.findById(adminUserId).select("+password");
  if (!admin) {
    throw new AppError("Admin account not found.", 404);
  }

  const isPasswordValid = await bcrypt.compare(adminPassword, String(admin.password || ""));
  if (!isPasswordValid) {
    throw new AppError("Invalid admin password.", 401);
  }

  const client = await User.findById(clientId).select("+password");
  if (!client || client.role !== USER_ROLES.CLIENT) {
    throw new AppError("Client not found.", 404);
  }

  const temporaryPassword = Math.random().toString(36).slice(-8);
  client.password = temporaryPassword;
  client.mustChangePassword = true;
  client.lastPasswordResetAt = new Date();
  await client.save();

  return sendSuccess(res, {
    message: "Client password reset successfully.",
    data: {
      fullName: client.fullName || "",
      phone: client.phone || "",
      email: client.email || "",
      temporaryPassword
    }
  });
});

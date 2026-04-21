import crypto from "crypto";
import User from "../models/User.js";
import { USER_ROLES } from "../constants/roles.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { sendSuccess } from "../utils/apiResponse.js";


const isAdminActor = (actor = {}) => {
  const role = String(actor?.role || actor?.accountType || "").trim().toLowerCase();
  return Boolean(
    actor?._id &&
    (
      actor?.isAdmin === true ||
      actor?.isSuperAdmin === true ||
      role === "admin" ||
      role === "super_admin" ||
      role === "superadmin"
    )
  );
};

const isSuperAdminActor = (actor = {}) => {
  const role = String(actor?.role || actor?.accountType || "").trim().toLowerCase();
  return Boolean(
    actor?._id &&
    (
      actor?.isSuperAdmin === true ||
      role === "super_admin" ||
      role === "superadmin"
    )
  );
};

const ensureAdminActor = (actor) => {
  if (!isAdminActor(actor)) {
    throw new AppError("Only admin users can manage admin accounts.", 403);
  }
};

const ensureSuperAdminActor = (actor) => {
  if (!isSuperAdminActor(actor)) {
    throw new AppError("Only the super admin can perform this action.", 403);
  }
};

const getLatestAuditEntry = (entries = []) => {
  if (!Array.isArray(entries) || !entries.length) return null;
  return [...entries].sort((a, b) => new Date(b?.at || 0) - new Date(a?.at || 0))[0];
};

const buildAuditEntry = (actor = {}, action = "", target = {}, metadata = {}) => ({
  actorId: actor?._id || null,
  actorName: actor?.fullName || actor?.name || "",
  action,
  targetId: target?._id || null,
  targetLabel: target?.fullName || target?.name || metadata?.targetPhone || "",
  metadata,
  at: new Date()
});

const generateTemporaryPassword = () => {
  return `Adm${crypto.randomBytes(4).toString("hex")}#${Math.floor(100 + Math.random() * 900)}`;
};

const generateRecoveryKey = () => crypto.randomBytes(24).toString("hex");

const verifySuperAdminPassword = async (actor, password = "") => {
  if (!actor) {
    throw new AppError("Admin account not found.", 404);
  }

  const normalized = String(password || "").trim();
  if (!normalized) {
    throw new AppError("Super admin password confirmation is required.", 400);
  }

  if (typeof actor.comparePassword !== "function") {
    throw new AppError("Password verification is not available on this account.", 500);
  }

  const ok = await actor.comparePassword(normalized);
  if (!ok) {
    throw new AppError("Super admin password confirmation is incorrect.", 401);
  }
};

const resolveAdminActor = async (req) => {
  const actorId = req?.user?.userId || req?.user?._id;
  if (!actorId) {
    throw new AppError("Authenticated admin identity is missing.", 401);
  }

  const actor = await User.findById(actorId).select("+password");
  if (!actor) {
    throw new AppError("Admin account not found.", 404);
  }

  ensureAdminActor(actor);
  return actor;
};

const resolveSuperAdminActor = async (req) => {
  const actor = await resolveAdminActor(req);

  if (!actor.isSuperAdmin) {
    const existingSuperAdmin = await User.findOne({
      role: USER_ROLES.ADMIN,
      isSuperAdmin: true,
      accountStatus: { $ne: "deleted" }
    }).select("_id");

    if (!existingSuperAdmin) {
      actor.isSuperAdmin = true;
      actor.isAdmin = true;
      actor.adminActionAudit = Array.isArray(actor.adminActionAudit) ? actor.adminActionAudit : [];
      actor.adminActionAudit.push(
        buildAuditEntry(actor, "bootstrap_super_admin_promoted", actor, {
          reason: "No existing super admin was found. Current admin was promoted automatically."
        })
      );
      await actor.save({ validateModifiedOnly: true });
    }
  }

  ensureSuperAdminActor(actor);
  return actor;
};

export const listAdminAccounts = asyncHandler(async (req, res) => {
  const actor = await resolveSuperAdminActor(req);
  const adminsRaw = await User.find({ role: USER_ROLES.ADMIN, accountStatus: { $ne: "deleted" } })
    .select("fullName phone email accountStatus isSuperAdmin createdAt lastLoginAt adminCreatedBy adminActionAudit suspendedReason reactivatedAt reactivationNote mustChangePassword")
    .sort({ createdAt: -1 })
    .lean();

  const creatorIds = [...new Set(adminsRaw.map((item) => String(item?.adminCreatedBy || "")).filter(Boolean))];
  const creators = creatorIds.length
    ? await User.find({ _id: { $in: creatorIds } }).select("fullName phone email").lean()
    : [];
  const creatorMap = new Map(creators.map((item) => [String(item._id), item]));

  const admins = adminsRaw.map((admin) => {
    const latestAudit = getLatestAuditEntry(admin?.adminActionAudit || []);
    const createdBy = creatorMap.get(String(admin?.adminCreatedBy || "")) || null;

    return {
      ...admin,
      createdBy: createdBy ? {
        _id: createdBy._id,
        fullName: createdBy.fullName,
        phone: createdBy.phone,
        email: createdBy.email
      } : null,
      latestAudit: latestAudit ? {
        actorId: latestAudit.actorId || null,
        actorName: latestAudit.actorName || "",
        action: latestAudit.action || "",
        targetId: latestAudit.targetId || null,
        targetLabel: latestAudit.targetLabel || "",
        metadata: latestAudit.metadata || {},
        at: latestAudit.at || null
      } : null
    };
  });

  return sendSuccess(res, {
    data: {
      actor: {
        _id: actor._id,
        fullName: actor.fullName,
        isSuperAdmin: actor.isSuperAdmin
      },
      admins
    }
  });
});

export const createAdminOperator = asyncHandler(async (req, res) => {
  const actor = await resolveSuperAdminActor(req);
  const { fullName = "", phone = "", email = "", adminPassword = "" } = req.body;
  await verifySuperAdminPassword(actor, adminPassword);

  if (!String(fullName).trim() || !String(phone).trim() || !String(email).trim()) {
    throw new AppError("Full name, phone, and email are required.", 400);
  }

  const existingByPhone = await User.findOne({ phone: String(phone).trim() });
  if (existingByPhone) {
    throw new AppError("An account with that phone already exists.", 409);
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingByEmail = await User.findOne({ email: normalizedEmail });
  if (existingByEmail) {
    throw new AppError("An account with that email already exists.", 409);
  }

  const temporaryPassword = generateTemporaryPassword();
  const recoveryKey = generateRecoveryKey();

  const admin = await User.create({
    fullName: String(fullName).trim(),
    phone: String(phone).trim(),
    email: normalizedEmail,
    password: temporaryPassword,
    role: USER_ROLES.ADMIN,
    accountStatus: "active",
    mustChangePassword: true,
    isSuperAdmin: false,
    adminCreatedBy: actor._id,
    recoveryKeyHash: crypto.createHash("sha256").update(recoveryKey).digest("hex"),
    adminActionAudit: [buildAuditEntry(actor, "admin_operator_created", { fullName, _id: null }, {
      phone: String(phone).trim(),
      email: normalizedEmail,
      createdBySuperAdminId: actor._id,
      createdBySuperAdminName: actor.fullName
    })]
  });

  actor.adminActionAudit = Array.isArray(actor.adminActionAudit) ? actor.adminActionAudit : [];
  actor.adminActionAudit.push(buildAuditEntry(actor, "created_admin_operator", admin, {
    email: normalizedEmail,
    targetPhone: admin.phone,
    targetEmail: admin.email
  }));
  await actor.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    statusCode: 201,
    message: "Admin operator created successfully.",
    data: {
      admin: {
        _id: admin._id,
        fullName: admin.fullName,
        phone: admin.phone,
        email: admin.email,
        accountStatus: admin.accountStatus,
        isSuperAdmin: admin.isSuperAdmin
      },
      temporaryPassword,
      recoveryKey
    }
  });
});

export const resetAdminOperatorPassword = asyncHandler(async (req, res) => {
  const actor = await resolveSuperAdminActor(req);
  const { adminPassword = "" } = req.body;
  await verifySuperAdminPassword(actor, adminPassword);

  const target = await User.findById(req.params.id).select("+password");
  if (!target || target.role !== USER_ROLES.ADMIN) {
    throw new AppError("Admin account not found.", 404);
  }

  const temporaryPassword = generateTemporaryPassword();
  const recoveryKey = generateRecoveryKey();
  target.password = temporaryPassword;
  target.mustChangePassword = true;
  target.accountStatus = "active";
  target.lastPasswordResetAt = new Date();
  target.recoveryKeyHash = crypto.createHash("sha256").update(recoveryKey).digest("hex");
  target.adminActionAudit = Array.isArray(target.adminActionAudit) ? target.adminActionAudit : [];
  target.adminActionAudit.push(buildAuditEntry(actor, "admin_operator_password_reset", target, {
    resetBySuperAdminId: actor._id,
    resetBySuperAdminName: actor.fullName
  }));
  await target.save();

  actor.adminActionAudit = Array.isArray(actor.adminActionAudit) ? actor.adminActionAudit : [];
  actor.adminActionAudit.push(buildAuditEntry(actor, "reset_admin_operator_password", target, {
    targetPhone: target.phone,
    targetEmail: target.email
  }));
  await actor.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Admin password reset successfully.",
    data: {
      adminId: target._id,
      fullName: target.fullName,
      phone: target.phone,
      email: target.email,
      temporaryPassword,
      recoveryKey
    }
  });
});
export const deactivateAdminOperator = asyncHandler(async (req, res) => {
  const actor = await resolveSuperAdminActor(req);
  const { reason = "", adminPassword = "" } = req.body;
  await verifySuperAdminPassword(actor, adminPassword);

  const target = await User.findById(req.params.id);

  if (!target || target.role !== USER_ROLES.ADMIN) {
    throw new AppError("Admin account not found.", 404);
  }

  if (String(target._id) === String(actor._id)) {
    throw new AppError("Super admin cannot deactivate the current signed-in admin through this endpoint.", 400);
  }

  target.accountStatus = "inactive";
  target.reactivationNote = "";
  target.suspendedReason = String(reason || "").trim();
  target.adminActionAudit = Array.isArray(target.adminActionAudit) ? target.adminActionAudit : [];
  target.adminActionAudit.push(buildAuditEntry(actor, "admin_operator_deactivated", target, {
    reason: String(reason || "").trim(),
    deactivatedBySuperAdminId: actor._id,
    deactivatedBySuperAdminName: actor.fullName
  }));
  await target.save();

  actor.adminActionAudit = Array.isArray(actor.adminActionAudit) ? actor.adminActionAudit : [];
  actor.adminActionAudit.push(buildAuditEntry(actor, "deactivated_admin_operator", target, { reason: String(reason || "").trim() }));
  await actor.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Admin account deactivated successfully.",
    data: {
      adminId: target._id,
      accountStatus: target.accountStatus
    }
  });
});

export const reactivateAdminOperator = asyncHandler(async (req, res) => {
  const actor = await resolveSuperAdminActor(req);
  const { note = "", adminPassword = "" } = req.body;
  await verifySuperAdminPassword(actor, adminPassword);

  const target = await User.findById(req.params.id);

  if (!target || target.role !== USER_ROLES.ADMIN) {
    throw new AppError("Admin account not found.", 404);
  }

  target.accountStatus = "active";
  target.reactivatedAt = new Date();
  target.reactivationNote = String(note || "").trim();
  target.adminActionAudit = Array.isArray(target.adminActionAudit) ? target.adminActionAudit : [];
  target.adminActionAudit.push(buildAuditEntry(actor, "admin_operator_reactivated", target, {
    note: String(note || "").trim(),
    reactivatedBySuperAdminId: actor._id,
    reactivatedBySuperAdminName: actor.fullName
  }));
  await target.save();

  actor.adminActionAudit = Array.isArray(actor.adminActionAudit) ? actor.adminActionAudit : [];
  actor.adminActionAudit.push(buildAuditEntry(actor, "reactivated_admin_operator", target, { note: String(note || "").trim() }));
  await actor.save({ validateModifiedOnly: true });

  return sendSuccess(res, {
    message: "Admin account reactivated successfully.",
    data: {
      adminId: target._id,
      accountStatus: target.accountStatus
    }
  });
});


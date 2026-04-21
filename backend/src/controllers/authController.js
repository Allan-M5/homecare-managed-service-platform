import crypto from "crypto";
import User from "../models/User.js";
import ClientProfile from "../models/ClientProfile.js";
import WorkerProfile from "../models/WorkerProfile.js";
import { USER_ROLES } from "../constants/roles.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { generateToken } from "../utils/token.js";
import { generateBase32Secret, generateTotpOtpauthUrl, verifyTotp } from "../utils/totp.js";
import { sendTemporaryPasswordEmail } from "../utils/email.js";

const buildAuthResponse = async (user) => {
  const safeUser = await User.findById(user._id).select("-password -totpSecret").lean();

  let profile = null;

  if (safeUser.role === USER_ROLES.CLIENT) {
    profile = await ClientProfile.findOne({ userId: safeUser._id }).lean();
  }

  if (safeUser.role === USER_ROLES.WORKER) {
    profile = await WorkerProfile.findOne({ userId: safeUser._id }).lean();
  }

  return {
    user: safeUser,
    profile,
    token: generateToken({
      userId: safeUser._id,
      role: safeUser.role
    })
  };
};

export const registerClient = asyncHandler(async (req, res) => {
  const {
    fullName,
    phone,
    password,
    email = "",
    county = "",
    town = "",
    estate = "",
    addressLine = "",
    houseDetails = "",
    latitude = null,
    longitude = null,
    googlePlaceId = "",
    emergencyContactName = "",
    emergencyContactPhone = "",
    emergencyContactRelationship = ""
  } = req.body;

  if (!fullName || !phone || !password) {
    throw new AppError("Full name, phone, and password are required.", 400);
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();

  const existingUser = await User.findOne({ phone });
  if (existingUser) {
    throw new AppError("An account with that phone number already exists.", 409);
  }

  if (normalizedEmail) {
    const existingEmailUser = await User.findOne({ email: normalizedEmail });
    if (existingEmailUser) {
      throw new AppError("An account with that email already exists.", 409);
    }
  }

  const userPayload = {
    fullName,
    phone,
    password,
    role: USER_ROLES.CLIENT,
    accountStatus: "active"
  };

  if (normalizedEmail) {
    userPayload.email = normalizedEmail;
  }

  const user = await User.create(userPayload);

  await ClientProfile.create({
    userId: user._id,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship,
    homeLocation: {
      county,
      town,
      estate,
      addressLine,
      houseDetails,
      latitude,
      longitude,
      googlePlaceId
    }
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: "Client account created successfully.",
    data: await buildAuthResponse(user)
  });
});

export const registerAdmin = asyncHandler(async (req, res) => {
  const { fullName, phone, password, email = "" } = req.body;

  if (!fullName || !phone || !password) {
    throw new AppError("Full name, phone, and password are required.", 400);
  }

  const existingUser = await User.findOne({ phone });
  if (existingUser) {
    throw new AppError("An account with that phone number already exists.", 409);
  }

  const existingAdminCount = await User.countDocuments({ role: USER_ROLES.ADMIN });
  const isFirstAdmin = existingAdminCount === 0;
  const recoveryKey = isFirstAdmin
    ? `HC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    : "";

  const user = await User.create({
    fullName,
    phone,
    password,
    email: email || null,
    role: USER_ROLES.ADMIN,
    accountStatus: "active",
    isSuperAdmin: isFirstAdmin,
    recoveryKeyHash: recoveryKey ? crypto.createHash("sha256").update(recoveryKey).digest("hex") : ""
  });

  const authData = await buildAuthResponse(user);

  return sendSuccess(res, {
    statusCode: 201,
    message: isFirstAdmin
      ? "Super admin account created successfully. Save the recovery key securely now."
      : "Admin account created successfully.",
    data: {
      ...authData,
      recoveryKey: recoveryKey || undefined,
      isSuperAdmin: isFirstAdmin
    }
  });
});

export const loginUser = asyncHandler(async (req, res) => {
  const { phone = "", identifier = "", password, totpCode = "", role = "" } = req.body;

  const loginIdentifier = String(identifier || phone || "").trim();

  if (!loginIdentifier || !password) {
    throw new AppError("Phone/email and password are required.", 400);
  }

  const normalizedIdentifier = loginIdentifier.toLowerCase();
  const user = await User.findOne({
    $or: [
      { phone: loginIdentifier },
      { email: normalizedIdentifier }
    ]
  })
    .select("+password +totpSecret")
    .lean(false);

  if (!user) {
    throw new AppError("Invalid phone/email or password.", 401);
  }

  if (role && user.role !== role) {
    throw new AppError(`This account is registered as ${user.role}, not ${role}.`, 403);
  }

  if (user.accountStatus !== "active") {
    throw new AppError("This account is not active. Contact admin support.", 403);
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new AppError("Invalid phone/email or password.", 401);
  }

  user.lastLoginAt = new Date();
  await user.save();

  return sendSuccess(res, {
    message: "Sign in successful.",
    data: await buildAuthResponse(user)
  });
});

export const forgotPasswordByEmail = asyncHandler(async (req, res) => {
  const { email = "" } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!normalizedEmail) {
    throw new AppError("Email is required.", 400);
  }

  const user = await User.findOne({ email: normalizedEmail }).select("+password");

  if (!user) {
    return sendSuccess(res, {
      message: "If an account exists for that email, a reset message has been prepared.",
      data: {
        emailDispatched: true
      }
    });
  }

  const temporaryPassword = Math.random().toString(36).slice(-10) + "A1!";
  user.password = temporaryPassword;
  user.mustChangePassword = true;
  user.lastPasswordResetAt = new Date();
  await user.save();

  const emailResult = await sendTemporaryPasswordEmail({
    to: normalizedEmail,
    fullName: user.fullName,
    temporaryPassword
  });

  return sendSuccess(res, {
    message: emailResult.sent
      ? "A temporary password has been sent to the registered email."
      : "SMTP is not configured yet. A development email preview has been logged on the backend console.",
    data: {
      emailDispatched: emailResult.sent,
      developmentPreviewLogged: !emailResult.sent
    }
  });
});

export const recoverAdminAccess = asyncHandler(async (req, res) => {
  const { email = "", recoveryKey = "" } = req.body;

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedKey = String(recoveryKey || "").trim();

  if (!normalizedEmail || !normalizedKey) {
    throw new AppError("Email and recovery key are required.", 400);
  }

  const admin = await User.findOne({
    email: normalizedEmail,
    role: USER_ROLES.ADMIN,
    accountStatus: { $ne: "deleted" }
  }).select("+password +recoveryKeyHash");

  if (!admin || !admin.recoveryKeyHash) {
    throw new AppError("Recovery details are invalid.", 401);
  }

  const submittedHash = crypto.createHash("sha256").update(normalizedKey).digest("hex");
  if (submittedHash !== admin.recoveryKeyHash) {
    throw new AppError("Recovery details are invalid.", 401);
  }

  const temporaryPassword = Math.random().toString(36).slice(-10) + "A1!";
  admin.password = temporaryPassword;
  admin.mustChangePassword = true;
  admin.lastPasswordResetAt = new Date();
  admin.accountStatus = "active";
  admin.adminActionAudit = Array.isArray(admin.adminActionAudit) ? admin.adminActionAudit : [];
  admin.adminActionAudit.push({
    actorId: admin._id,
    actorName: admin.fullName,
    action: "admin_recovery_password_reset",
    targetId: admin._id,
    targetLabel: admin.fullName,
    metadata: {
      via: "recovery_key",
      recoveryChannel: "email",
      recoveryEmail: normalizedEmail
    },
    at: new Date()
  });
  await admin.save();

  const emailResult = await sendTemporaryPasswordEmail({
    to: normalizedEmail,
    fullName: admin.fullName,
    temporaryPassword
  });

  return sendSuccess(res, {
    message: emailResult.sent
      ? "Recovery details were verified. A temporary password has been sent to the registered email."
      : "Recovery details were verified. SMTP is not configured yet, so a development email preview has been prepared below for local testing.",
    data: {
      emailDispatched: emailResult.sent,
      developmentPreviewLogged: !emailResult.sent,
      mustChangePassword: true,
      developmentRecoveryPreview: !emailResult.sent
        ? {
            fullName: admin.fullName,
            email: normalizedEmail,
            phone: admin.phone || "",
            temporaryPassword
          }
        : null
    }
  });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -totpSecret").lean();

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  let profile = null;

  if (user.role === USER_ROLES.CLIENT) {
    profile = await ClientProfile.findOne({ userId: user._id }).lean();
  }

  if (user.role === USER_ROLES.WORKER) {
    profile = await WorkerProfile.findOne({ userId: user._id }).lean();
  }

  return sendSuccess(res, {
    message: "Current user fetched successfully.",
    data: {
      user,
      profile
    }
  });
});

export const changeMyPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required.", 400);
  }

  if (String(newPassword).length < 6) {
    throw new AppError("New password must be at least 6 characters long.", 400);
  }

  const user = await User.findById(req.user._id).select("+password");

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  const isCurrentPasswordValid = await user.comparePassword(currentPassword);

  if (!isCurrentPasswordValid) {
    throw new AppError("Current password is incorrect.", 401);
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();

  return sendSuccess(res, {
    message: "Password changed successfully.",
    data: await buildAuthResponse(user)
  });
});

export const deleteMyAccount = asyncHandler(async (req, res) => {
  const { password, reason } = req.body;

  if (!password || !reason) {
    throw new AppError("Password and reason are required.", 400);
  }

  const user = await User.findById(req.user._id).select("+password");

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  if (user.accountStatus !== "active") {
    throw new AppError("Account is already deactivated or restricted.", 403);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AppError("Incorrect password.", 401);
  }

  user.accountStatus = "DEACTIVATED_BY_USER";
  user.deletionReason = reason;
  user.deletedAt = new Date();
  await user.save();

  return sendSuccess(res, {
    message: "Account successfully deactivated."
  });
});

export const listDeletedUsersForAdmin = asyncHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AppError("Only admins can view deleted users.", 403);
  }

  const { status = "" } = req.query;
  const filter = {};

  if (status === "deleted") {
    filter.accountStatus = { $in: ["DEACTIVATED_BY_USER", "DELETED_BY_ADMIN", "deleted"] };
  }

  const users = await User.find(filter)
    .select("fullName phone email role accountStatus deletionReason deletedAt createdAt")
    .sort({ deletedAt: -1, createdAt: -1 })
    .lean();

  return sendSuccess(res, {
    message: "Deleted users fetched successfully.",
    data: users
  });
});




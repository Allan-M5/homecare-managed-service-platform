import User from "../models/User.js";
import { verifyToken } from "../utils/token.js";

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || "";

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  if (req.cookies?.token) {
    return req.cookies.token;
  }

  return null;
};

export const protect = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. Token missing."
      });
    }

    const decoded = verifyToken(token);

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. User not found."
      });
    }

    if (["suspended", "blacklisted"].includes(user.accountStatus)) {
      return res.status(403).json({
        success: false,
        message: user.suspendedReason ? `Account access restricted. Reason: ${user.suspendedReason}` : "Account access restricted."
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Invalid token."
    });
  }
};

export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized."
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Insufficient permissions."
      });
    }

    next();
  };
};
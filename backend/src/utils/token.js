import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const generateToken = (payload) => {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  });
};

export const verifyToken = (token) => {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.verify(token, env.JWT_SECRET);
};
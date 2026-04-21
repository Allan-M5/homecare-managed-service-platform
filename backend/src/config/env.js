import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  MONGODB_URI: process.env.MONGODB_URI || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "",
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "",
  R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL || "",
  R2_ENDPOINT: process.env.R2_ENDPOINT || "",
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || ""
};

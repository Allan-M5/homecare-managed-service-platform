import crypto from "crypto";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";

import { S3Client } from "@aws-sdk/client-s3";

const requiredVars = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL"
];

const assertR2Configured = () => {
  const missing = requiredVars.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new AppError("R2 storage is not configured correctly.", 500, { missing });
  }
};

const r2Client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  }
});

const safeBaseName = (value = "") =>
  String(value)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "file";

const getExtension = (fileName = "", mimeType = "") => {
  const fromName = path.extname(fileName || "").toLowerCase();
  if (fromName) return fromName;

  const mimeMap = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf"
  };

  return mimeMap[mimeType] || "";
};

export const uploadWorkerApplicationAsset = async ({ file, folder = "worker-applications", label = "document" }) => {
  assertR2Configured();

  if (!file?.buffer || !file?.originalname) {
    throw new AppError("Uploaded file payload is incomplete.", 400);
  }

  const extension = getExtension(file.originalname, file.mimetype);
  const originalBase = safeBaseName(path.basename(file.originalname, path.extname(file.originalname)));
  const unique = crypto.randomBytes(8).toString("hex");
  const storageKey = `${folder}/${label}-${Date.now()}-${unique}-${originalBase}${extension}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: storageKey,
      Body: file.buffer,
      ContentType: file.mimetype || "application/octet-stream"
    })
  );

  const baseUrl = String(env.R2_PUBLIC_BASE_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/${storageKey}`;

  return {
    url,
    storageKey,
    fileName: file.originalname || "",
    mimeType: file.mimetype || "",
    uploadedAt: new Date()
  };
};

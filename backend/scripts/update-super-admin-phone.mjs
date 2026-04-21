import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User.js";

const REAL_PHONE = "0702444552".trim();
const REAL_EMAIL = "allanmujera91@gmail.com".trim().toLowerCase();
const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.DATABASE_URL ||
  "";

if (!MONGO_URI) {
  throw new Error("Missing Mongo connection string.");
}

try {
  await mongoose.connect(MONGO_URI);

  const conflicting = await User.findOne({
    phone: REAL_PHONE,
    isSuperAdmin: { $ne: true }
  }).lean();

  if (conflicting) {
    throw new Error(`Phone ${REAL_PHONE} already belongs to another account. Stop and inspect that account first.`);
  }

  const superAdmin = await User.findOne({
    isSuperAdmin: true,
    email: REAL_EMAIL
  });

  if (!superAdmin) {
    throw new Error("Super admin with the expected email was not found.");
  }

  const oldPhone = String(superAdmin.phone || "").trim() || "(none)";
  superAdmin.phone = REAL_PHONE;
  await superAdmin.save();

  console.log("");
  console.log("=== SUPER ADMIN PHONE UPDATED ===");
  console.log(`Admin name : ${superAdmin.fullName || "-"}`);
  console.log(`Email      : ${superAdmin.email || "-"}`);
  console.log(`Old phone  : ${oldPhone}`);
  console.log(`New phone  : ${REAL_PHONE}`);
  console.log("");
} finally {
  await mongoose.disconnect();
}

import "dotenv/config";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../src/models/User.js";

const REAL_EMAIL = "allanmujera91@gmail.com".trim().toLowerCase();
const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.DATABASE_URL ||
  "";

if (!MONGO_URI) {
  throw new Error("Missing Mongo connection string. Expected MONGODB_URI, MONGO_URI, or DATABASE_URL.");
}

const generateRecoveryKey = () => {
  const chunk = crypto.randomBytes(6).toString("hex").toUpperCase();
  const chunk2 = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `HC-SA-${chunk}-${chunk2}`;
};

try {
  await mongoose.connect(MONGO_URI);

  const emailOwnedByAnotherUser = await User.findOne({
    email: REAL_EMAIL,
    isSuperAdmin: { $ne: true }
  }).lean();

  if (emailOwnedByAnotherUser) {
    throw new Error(`The email ${REAL_EMAIL} already belongs to another account. Stop and resolve that first.`);
  }

  const superAdmin = await User.findOne({ isSuperAdmin: true }).select("+recoveryKeyHash");

  if (!superAdmin) {
    throw new Error("No super admin account found.");
  }

  const oldEmail = String(superAdmin.email || "").trim().toLowerCase() || "(none)";
  const recoveryKey = generateRecoveryKey();
  const recoveryKeyHash = crypto.createHash("sha256").update(recoveryKey).digest("hex");

  superAdmin.email = REAL_EMAIL;
  superAdmin.isEmailVerified = true;
  superAdmin.recoveryKeyHash = recoveryKeyHash;

  await superAdmin.save();

  console.log("");
  console.log("=== SUPER ADMIN RECOVERY BOOTSTRAP SUCCESS ===");
  console.log(`Admin name   : ${superAdmin.fullName || "-"}`);
  console.log(`Phone        : ${superAdmin.phone || "-"}`);
  console.log(`Old email    : ${oldEmail}`);
  console.log(`New email    : ${REAL_EMAIL}`);
  console.log(`Recovery Key : ${recoveryKey}`);
  console.log("");
  console.log("Save that recovery key securely right now.");
  console.log("This raw key is not stored in readable form in the database.");
  console.log("");
} finally {
  await mongoose.disconnect();
}

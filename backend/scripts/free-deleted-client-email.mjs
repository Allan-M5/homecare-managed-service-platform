import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User.js";

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

  const user = await User.findOne({
    email: REAL_EMAIL,
    role: "client",
    accountStatus: "deleted",
    isSuperAdmin: { $ne: true }
  });

  if (!user) {
    console.log("No deleted client found holding that email. Nothing to change.");
  } else {
    const archivedEmail = `archived+${user._id}@deleted.local`;
    user.email = archivedEmail;
    user.isEmailVerified = false;
    await user.save();

    console.log("");
    console.log("=== DELETED CLIENT EMAIL FREED ===");
    console.log(`Name         : ${user.fullName || "-"}`);
    console.log(`Old email    : ${REAL_EMAIL}`);
    console.log(`Archived to  : ${archivedEmail}`);
    console.log("");
  }
} finally {
  await mongoose.disconnect();
}

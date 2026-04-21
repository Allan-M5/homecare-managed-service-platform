import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User.js";

const EMAIL = "allanmujera91@gmail.com".trim().toLowerCase();
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

  const users = await User.find({ email: EMAIL })
    .select("fullName phone email role isSuperAdmin accountStatus createdAt deletedAt")
    .lean();

  console.log("");
  console.log("=== EMAIL OWNER INSPECTION ===");
  console.log(`Email searched: ${EMAIL}`);
  console.log(`Matches found : ${users.length}`);
  console.log("");

  for (const user of users) {
    console.log(JSON.stringify(user, null, 2));
    console.log("");
  }
} finally {
  await mongoose.disconnect();
}

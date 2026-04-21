import mongoose from "mongoose";
import { env } from "./env.js";
import User from "../models/User.js";

export const connectDatabase = async () => {
  if (!env.MONGODB_URI) {
    console.warn("MONGODB_URI is not set yet. Skipping DB connection for now.");
    return;
  }

  await mongoose.connect(env.MONGODB_URI);
  try {
    await User.syncIndexes();
  } catch (error) {
    console.warn("User index sync warning:", error.message);
  }
  console.log("MongoDB connected");
};

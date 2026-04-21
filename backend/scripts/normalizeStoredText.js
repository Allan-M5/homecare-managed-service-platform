import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Job from "../src/models/Job.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });

function cleanText(value = "") {
  let text = String(value ?? "").trim();
  if (!text) return "";

  const decodeOnce = (input) => {
    try {
      const bytes = Uint8Array.from(Array.from(input).map((char) => char.charCodeAt(0) & 0xff));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return input;
    }
  };

  for (let i = 0; i < 3; i += 1) {
    const decoded = decodeOnce(text);
    if (!decoded || decoded === text) break;
    text = decoded;
  }

  return text
    .replace(/\uFFFD/g, "")
    .replace(/\s*ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢\s*/g, " ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  if (!(process.env.MONGO_URI || process.env.MONGODB_URI)) {
    throw new Error("MONGO_URI / MONGODB_URI is missing. Put it in backend/.env or run this script from the backend folder.");
  }

  await mongoose.connect((process.env.MONGO_URI || process.env.MONGODB_URI));

  const users = await User.find({});
  for (const user of users) {
    user.fullName = cleanText(user.fullName || "");
    await user.save({ validateModifiedOnly: true });
  }

  const jobs = await Job.find({});
  for (const job of jobs) {
    job.title = cleanText(job.title || "");
    job.description = cleanText(job.description || "");

    if (job.location) {
      job.location.county = cleanText(job.location.county || "");
      job.location.town = cleanText(job.location.town || "");
      job.location.estate = cleanText(job.location.estate || "");
      job.location.addressLine = cleanText(job.location.addressLine || "");
      job.location.houseDetails = cleanText(job.location.houseDetails || "");
    }

    if (job.assignedWorker) {
      job.assignedWorker.fullName = cleanText(job.assignedWorker.fullName || "");
      job.assignedWorker.phone = cleanText(job.assignedWorker.phone || "");
    }

    if (job.pricing) {
      if (typeof job.pricing.clientQuoteNotes === "string") {
        job.pricing.clientQuoteNotes = cleanText(job.pricing.clientQuoteNotes);
      }
      if (typeof job.pricing.workerAssignmentNotes === "string") {
        job.pricing.workerAssignmentNotes = cleanText(job.pricing.workerAssignmentNotes);
      }
    }

    if (job.payment && typeof job.payment.clientPaymentProofText === "string") {
      job.payment.clientPaymentProofText = cleanText(job.payment.clientPaymentProofText);
    }

    if (Array.isArray(job.activityLog)) {
      job.activityLog = job.activityLog.map((item) => ({
        ...item.toObject?.() || item,
        title: cleanText(item.title || ""),
        note: cleanText(item.note || "")
      }));
    }

    await job.save({ validateModifiedOnly: true });
  }

  console.log(`Normalized ${users.length} users and ${jobs.length} jobs.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
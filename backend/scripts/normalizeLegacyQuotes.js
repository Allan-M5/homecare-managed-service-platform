import mongoose from "mongoose";
import dotenv from "dotenv";
import Job from "../src/models/Job.js";

dotenv.config();

function normalizeMojibake(value = "") {
  return String(value || "")
    .replace(/Ã¢â‚¬Â¢|â€¢/g, "•")
    .replace(/Ã¢â‚¬â€œ|â€“/g, "–")
    .replace(/Ã¢â‚¬â„¢|â€™/g, "’")
    .replace(/Ã¢â‚¬Å"|â€”/g, "—")
    .trim();
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const jobs = await Job.find({});
  for (const job of jobs) {
    if (!job.pricing) job.pricing = {};
    if (!job.activityLog) job.activityLog = [];

    if (!job.pricing.clientQuoteNotes && job.pricing.adminQuoteNotes) {
      job.pricing.clientQuoteNotes = job.pricing.adminQuoteNotes;
    }

    if (job.activityLog.length > 0) {
      const acceptedAt = job.pricing?.clientQuoteAcceptedAt ? new Date(job.pricing.clientQuoteAcceptedAt).getTime() : null;
      const releasedAt = job.releasedAt ? new Date(job.releasedAt).getTime() : null;

      job.activityLog = job.activityLog
        .filter((item) => {
          const ts = item?.createdAt ? new Date(item.createdAt).getTime() : 0;
          const type = String(item?.type || "");
          const note = String(item?.note || "");

          if (
            type === "admin_sent_final_quote" &&
            (
              (acceptedAt && ts >= acceptedAt) ||
              (releasedAt && ts >= releasedAt) ||
              /accept job,\s*client is waiting/i.test(note)
            )
          ) {
            return false;
          }

          return true;
        })
        .map((item) => ({
          ...item.toObject ? item.toObject() : item,
          note: normalizeMojibake(item.note || ""),
          title: normalizeMojibake(item.title || "")
        }))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    if (job.location?.estate) job.location.estate = normalizeMojibake(job.location.estate);
    if (job.location?.town) job.location.town = normalizeMojibake(job.location.town);
    if (job.title) job.title = normalizeMojibake(job.title);
    if (job.description) job.description = normalizeMojibake(job.description);

    await job.save({ validateModifiedOnly: true });
  }

  console.log(`Normalized ${jobs.length} jobs`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
import mongoose from "mongoose";
import dotenv from "dotenv";
import Job from "../src/models/Job.js";
import User from "../src/models/User.js";

dotenv.config();

function clean(value = "") {
  return String(value || "")
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢/g, "•")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢/g, "•")
    .replace(/Ã¢â‚¬Â¢|â€¢/g, "•")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢|Ã¢â‚¬â„¢|â€™/g, "’")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|Ã¢â‚¬Å“|â€œ/g, '"')
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã‚?|\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({});
  for (const user of users) {
    if (user.fullName) user.fullName = clean(user.fullName);
    await user.save({ validateModifiedOnly: true });
  }

  const jobs = await Job.find({});
  for (const job of jobs) {
    if (job.title) job.title = clean(job.title);
    if (job.description) job.description = clean(job.description);

    if (job.location) {
      if (job.location.estate) job.location.estate = clean(job.location.estate);
      if (job.location.town) job.location.town = clean(job.location.town);
      if (job.location.addressLine) job.location.addressLine = clean(job.location.addressLine);
      if (job.location.county) job.location.county = clean(job.location.county);
    }

    if (job.pricing) {
      if (!job.pricing.clientQuoteNotes && job.pricing.adminQuoteNotes) {
        job.pricing.clientQuoteNotes = clean(job.pricing.adminQuoteNotes);
      }
      if (job.pricing.clientQuoteNotes) job.pricing.clientQuoteNotes = clean(job.pricing.clientQuoteNotes);
      if (job.pricing.workerAssignmentNotes) job.pricing.workerAssignmentNotes = clean(job.pricing.workerAssignmentNotes);
    }

    if (job.payment?.clientPaymentProofText) {
      job.payment.clientPaymentProofText = clean(job.payment.clientPaymentProofText);
    }

    await job.save({ validateModifiedOnly: true });
  }

  console.log(`Normalized ${users.length} users and ${jobs.length} jobs`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
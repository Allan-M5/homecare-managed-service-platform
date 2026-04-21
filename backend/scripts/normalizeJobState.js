import mongoose from "mongoose";
import dotenv from "dotenv";
import Job from "../src/models/Job.js";
import WorkerProfile from "../src/models/WorkerProfile.js";
import {
  JOB_STATUSES,
  JOB_ASSIGNMENT_STATUSES,
  JOB_PAYMENT_STATUSES
} from "../src/constants/jobs.js";

dotenv.config();

const LIVE_JOB_STATUSES = [
  JOB_STATUSES.WORKER_ACCEPTED,
  JOB_STATUSES.WORKER_EN_ROUTE,
  JOB_STATUSES.WORKER_ARRIVED,
  JOB_STATUSES.WORK_IN_PROGRESS,
  JOB_STATUSES.AWAITING_ADMIN_CLEARANCE,
  JOB_STATUSES.ISSUE_REPORTED,
  JOB_STATUSES.ISSUE_RESOLVED
];

function pushEvent(bucket, time, type, title, note = "") {
  if (!time) return;
  const when = new Date(time);
  if (Number.isNaN(when.getTime())) return;
  bucket.push({
    type,
    title,
    note,
    createdAt: when
  });
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected for normalization");

  const jobs = await Job.find({});

  for (const job of jobs) {
    const events = [];

    pushEvent(events, job.createdAt, "job_created", "Job created", job.description || job.serviceCategory || "Job created");

    if (job.pricing?.finalClientChargeAmount > 0) {
      const quoteTime =
        job.pricing?.clientQuoteAcceptedAt
          ? new Date(new Date(job.pricing.clientQuoteAcceptedAt).getTime() - 1000)
          : job.updatedAt || job.createdAt;

      pushEvent(
        events,
        quoteTime,
        "admin_sent_final_quote",
        "Admin sent final quote",
        `Final quote KES ${job.pricing.finalClientChargeAmount} | Deposit KES ${job.payment?.depositAmount || 0} | ${job.pricing?.clientQuoteNotes || "Final quote prepared"}`
      );
    }

    pushEvent(events, job.pricing?.clientQuoteAcceptedAt, "client_accepted_quote", "Client accepted final quote", "Job moved to ready for dispatch");
    pushEvent(events, job.assignedAt, "admin_assigned_worker", "Admin assigned worker", `${job.assignedWorker?.fullName || "Worker"} | Worker amount KES ${job.pricing?.workerOfferedAmount || 0}${job.pricing?.workerAssignmentNotes ? ` | ${job.pricing.workerAssignmentNotes}` : ""}`);
    pushEvent(events, job.workerAcceptedAt, "worker_accepted_job", "Worker accepted job", "Worker committed to the assignment");
    pushEvent(events, job.enRouteAt, "worker_left_for_site", "Worker left for site", "Journey to client location started");
    pushEvent(events, job.arrivedAt, "worker_arrived", "Worker arrived at site", "Worker reached client location");
    pushEvent(events, job.startedAt, "worker_clocked_in", "Worker clocked in", "Live work started");
    pushEvent(events, job.completedAt, "worker_clocked_out", "Worker clocked out", "Client must pay or raise issue");

    pushEvent(events, job.payment?.clientReportedBalancePaidAt, "client_submitted_payment_proof", "Client submitted payment proof", job.payment?.clientPaymentProofText || "Payment proof submitted");
    pushEvent(events, job.payment?.adminPaymentVerifiedAt, "admin_verified_payment", "Admin verified payment", "Balance receipt confirmed");

    pushEvent(
      events,
      job.adminClearance?.issueRaisedByClientAt || job.adminClearance?.issueRaisedAt,
      "issue_recorded",
      "Issue recorded",
      job.adminClearance?.clientIssueNotes || "Issue recorded"
    );

    pushEvent(events, job.adminClearance?.resolvedAt, "admin_resolved_issue", "Admin resolved issue", job.adminClearance?.adminActionNotes || "Issue resolved");
    pushEvent(events, job.releasedAt, "worker_released", "Worker released", "Job closed successfully");

    events.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    job.activityLog = events.map((item) => ({
      type: item.type,
      title: item.title,
      note: item.note,
      actorRole: "",
      actorId: null,
      createdAt: item.createdAt
    }));

    if (job.releasedAt || job.status === JOB_STATUSES.COMPLETED) {
      job.status = JOB_STATUSES.COMPLETED;
      job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.RELEASED;
    } else if (job.completedAt) {
      if (job.adminClearance?.status === "resolved") {
        job.status = JOB_STATUSES.ISSUE_RESOLVED;
      } else if (job.adminClearance?.status === "issue_raised") {
        job.status = JOB_STATUSES.ISSUE_REPORTED;
      } else {
        job.status = JOB_STATUSES.AWAITING_ADMIN_CLEARANCE;
      }
      job.assignmentStatus = JOB_ASSIGNMENT_STATUSES.AWAITING_RELEASE;
    }

    if (
      job.payment?.paymentStatus === JOB_PAYMENT_STATUSES.CLIENT_REPORTED_BALANCE_PAYMENT &&
      job.payment?.adminPaymentVerifiedAt
    ) {
      job.payment.paymentStatus = JOB_PAYMENT_STATUSES.PAID_IN_FULL;
    }

    await job.save({ validateModifiedOnly: true });
  }

  const workerProfiles = await WorkerProfile.find({});
  for (const profile of workerProfiles) {
    const liveJobsCount = await Job.countDocuments({
      "assignedWorker.workerUserId": profile.userId,
      status: { $in: LIVE_JOB_STATUSES }
    });

    if (liveJobsCount > 0) {
      profile.availability.status = "busy";
      profile.availability.reason = "Live job still open under this worker account.";
    } else if (profile.availability?.status === "busy") {
      profile.availability.status = "unavailable";
      profile.availability.reason = "No live job open. Worker may choose Available when ready.";
    }

    profile.availability.updatedAt = new Date();
    profile.lastSeenAt = new Date();
    await profile.save({ validateModifiedOnly: true });
  }

  console.log(`Normalized ${jobs.length} jobs and ${workerProfiles.length} worker profiles.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
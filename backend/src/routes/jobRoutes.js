import express from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { USER_ROLES } from "../constants/roles.js";
import {
  createClientJob,
  listMyClientJobs,
  listAdminJobs,
  clientAcceptQuote,
  clientDeferQuote,
  sendAdminQuote,
  markDepositPaid,
  clientReportBalancePaid,
  clientRaiseIssueAfterJob,
  adminVerifyBalancePayment,
  assignWorkerToJob,
  listAssignedWorkerJobs,
  workerAcceptJob,
  workerDeclineJob,
  workerStartJourney,
  workerMarkArrived,
  workerClockIn,
  workerUpdateCurrentLocation,
  workerCompleteJob,
  workerRequestExtraTime,
  clientRespondExtraTime,
  adminRaiseJobIssue,
  adminResolveJobIssue,
  adminReleaseWorker,
  adminFinalizeWorkerRelease,
  payWorker
} from "../controllers/jobController.js";

const router = express.Router();

router.post("/", protect, authorize(USER_ROLES.CLIENT), createClientJob);
router.get("/my", protect, authorize(USER_ROLES.CLIENT), listMyClientJobs);
router.get("/admin", protect, authorize(USER_ROLES.ADMIN), listAdminJobs);

router.patch("/:id/accept-quote", protect, authorize(USER_ROLES.CLIENT), clientAcceptQuote);
router.patch("/:id/defer-quote", protect, authorize(USER_ROLES.CLIENT), clientDeferQuote);
router.patch("/:id/report-balance-paid", protect, authorize(USER_ROLES.CLIENT), clientReportBalancePaid);
router.patch("/:id/raise-issue", protect, authorize(USER_ROLES.CLIENT), clientRaiseIssueAfterJob);
router.patch("/:id/respond-extra-time", protect, authorize(USER_ROLES.CLIENT), clientRespondExtraTime);
router.patch("/client/:id/respond-extra-time", protect, authorize(USER_ROLES.CLIENT), clientRespondExtraTime);

router.patch("/admin/:id/send-quote", protect, authorize(USER_ROLES.ADMIN), sendAdminQuote);
router.patch("/admin/:id/mark-deposit-paid", protect, authorize(USER_ROLES.ADMIN), markDepositPaid);
router.patch("/admin/:id/verify-balance-payment", protect, authorize(USER_ROLES.ADMIN), adminVerifyBalancePayment);
router.patch("/admin/:id/assign-worker", protect, authorize(USER_ROLES.ADMIN), assignWorkerToJob);
router.patch("/admin/:id/raise-issue", protect, authorize(USER_ROLES.ADMIN), adminRaiseJobIssue);
router.patch("/admin/:id/resolve-issue", protect, authorize(USER_ROLES.ADMIN), adminResolveJobIssue);
router.patch("/admin/:id/release-worker", protect, authorize(USER_ROLES.ADMIN), adminReleaseWorker);
router.patch("/admin/:id/finalize-release", protect, authorize(USER_ROLES.ADMIN), adminFinalizeWorkerRelease);
router.post("/admin/pay-worker/:jobId", protect, authorize(USER_ROLES.ADMIN), payWorker);

router.get("/worker/assigned", protect, authorize(USER_ROLES.WORKER), listAssignedWorkerJobs);
router.patch("/worker/:id/accept", protect, authorize(USER_ROLES.WORKER), workerAcceptJob);
router.patch("/worker/:id/decline", protect, authorize(USER_ROLES.WORKER), workerDeclineJob);
router.patch("/worker/:id/enroute", protect, authorize(USER_ROLES.WORKER), workerStartJourney);
router.patch("/worker/:id/arrived", protect, authorize(USER_ROLES.WORKER), workerMarkArrived);
router.patch("/worker/:id/start", protect, authorize(USER_ROLES.WORKER), workerClockIn);
router.patch("/worker/:id/location", protect, authorize(USER_ROLES.WORKER), workerUpdateCurrentLocation);
router.patch("/worker/:id/request-extra-time", protect, authorize(USER_ROLES.WORKER), workerRequestExtraTime);
router.patch("/worker/:id/complete", protect, authorize(USER_ROLES.WORKER), workerCompleteJob);

export default router;


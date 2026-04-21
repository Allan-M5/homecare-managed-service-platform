export const JOB_STATUSES = {
  PENDING_REVIEW: "pending_review",
  QUOTE_PENDING_CLIENT: "quote_pending_client",
  QUOTE_ACCEPTED_READY_FOR_DISPATCH: "quote_accepted_ready_for_dispatch",
  WORKER_ACCEPTED: "worker_accepted",
  WORKER_EN_ROUTE: "worker_en_route",
  WORKER_ARRIVED: "worker_arrived",
  WORK_IN_PROGRESS: "work_in_progress",
  AWAITING_ADMIN_CLEARANCE: "awaiting_admin_clearance",
  ISSUE_REPORTED: "issue_reported",
  ISSUE_RESOLVED: "issue_resolved",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  DISPUTED: "disputed"
};

export const JOB_STATUS_VALUES = Object.values(JOB_STATUSES);

export const JOB_ASSIGNMENT_STATUSES = {
  UNASSIGNED: "unassigned",
  ASSIGNED: "assigned",
  ACCEPTED: "accepted",
  REASSIGN_REQUIRED: "reassign_required",
  AWAITING_RELEASE: "awaiting_release",
  RELEASED: "released"
};

export const JOB_ASSIGNMENT_STATUS_VALUES = Object.values(JOB_ASSIGNMENT_STATUSES);

export const JOB_PAYMENT_STATUSES = {
  UNPAID: "unpaid",
  DEPOSIT_PENDING: "deposit_pending",
  DEPOSIT_PAID: "deposit_paid",
  CLIENT_REPORTED_BALANCE_PAYMENT: "client_reported_balance_payment",
  PAID_IN_FULL: "paid_in_full"
};

export const JOB_PAYMENT_STATUS_VALUES = Object.values(JOB_PAYMENT_STATUSES);

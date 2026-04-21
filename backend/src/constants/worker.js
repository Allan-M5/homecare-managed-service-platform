export const WORKER_APPLICATION_STATUSES = Object.freeze({
  PENDING: "pending",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  NEEDS_MORE_INFO: "needs_more_info",
  SUSPENDED: "suspended",
  DELETED: "deleted"
});

export const WORKER_APPLICATION_STATUS_VALUES = Object.freeze(
  Object.values(WORKER_APPLICATION_STATUSES)
);

export const WORKER_AVAILABILITY_STATUSES = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  BUSY: "busy",
  OFFLINE: "offline",
  SUSPENDED: "suspended",
  DELETED: "deleted"
});

export const WORKER_AVAILABILITY_STATUS_VALUES = Object.freeze(
  Object.values(WORKER_AVAILABILITY_STATUSES)
);

export const WORKER_ACCOUNT_STATUSES = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
  BLACKLISTED: "blacklisted",
  DELETED: "deleted"
});

export const WORKER_ACCOUNT_STATUS_VALUES = Object.freeze(
  Object.values(WORKER_ACCOUNT_STATUSES)
);
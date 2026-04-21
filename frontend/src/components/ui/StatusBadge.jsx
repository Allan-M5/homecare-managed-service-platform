function prettyLabel(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "Unknown";

  const special = {
    awaiting_admin_clearance: "Awaiting Admin Clearance",
    awaiting_release: "Awaiting Release",
    client_reported_balance_payment: "Client Reported Payment",
    paid_in_full: "Paid in Full",
    work_in_progress: "Work In Progress",
    worker_accepted: "Worker Accepted",
    worker_en_route: "Worker En Route",
    worker_arrived: "Worker Arrived",
    quote_pending_client: "Quote Pending Client",
    quote_accepted_ready_for_dispatch: "Ready For Dispatch",
    reassign_required: "Reassign Required",
    issue_reported: "Issue Reported",
    issue_resolved: "Issue Resolved",
    deposit_pending: "Deposit Pending",
    deposit_paid: "Deposit Paid",
    completed: "Completed",
    released: "Released"
  };

  if (special[normalized]) return special[normalized];

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function StatusBadge({ value = "" }) {
  const normalized = String(value).toLowerCase().replace(/\s+/g, "_");

  return (
    <span className={`status-badge status-${normalized.replace(/_/g, "-")}`}>
      {prettyLabel(value)}
    </span>
  );
}
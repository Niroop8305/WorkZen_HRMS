// Shared display formatting and constants for the payroll UI (M5).
// These helpers only FORMAT values the backend already returned. Nothing here
// derives, prorates or otherwise calculates salary.

export const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export const PAYMENT_STATUSES = ["Pending", "Processed", "Paid", "On Hold"];

export const PAYMENT_METHODS = ["Bank Transfer", "Cash", "Cheque"];

// Mirrors the backend payroll status state machine for UX only (which buttons to
// show). The backend re-validates every transition and remains authoritative.
export const STATUS_TRANSITIONS = {
  Pending: ["Processed", "On Hold"],
  Processed: ["Paid"],
  "On Hold": ["Processed"],
  Paid: [],
};

export const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(Number(amount) || 0);

export const formatMonth = (month) => {
  if (month === null || month === undefined || month === "") return "-";
  if (typeof month === "string" && isNaN(Number(month))) return month;
  return MONTHS.find((m) => m.value === String(month))?.label || `Month ${month}`;
};

export const formatDate = (dateString) =>
  dateString ? new Date(dateString).toLocaleDateString("en-IN") : "-";

// A rolling list of years for filter/select controls, newest first.
export const yearOptions = (count = 6) => {
  const current = new Date().getFullYear();
  return Array.from({ length: count }, (_, idx) => String(current - idx));
};

export const statusClass = (status) =>
  `status-${String(status || "pending").toLowerCase().replace(/\s+/g, "-")}`;

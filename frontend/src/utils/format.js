// Shared display formatting for attendance/leave/payroll tables. These
// functions format values for HUMANS; all authoritative calculations remain
// on the backend and are displayed as returned.

/**
 * "2026-10-30 08:46:00" | "08:46" | Date -> "08:46 AM".
 * Anything absent or unparseable renders as the neutral "--:--" placeholder.
 */
export const formatTime12 = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hours = value.getHours();
    const minutes = String(value.getMinutes()).padStart(2, "0");
    const suffix = hours >= 12 ? "PM" : "AM";
    const display = hours % 12 === 0 ? 12 : hours % 12;
    return `${String(display).padStart(2, "0")}:${minutes} ${suffix}`;
  }
  if (!value) return "--:--";
  const match = /(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return "--:--";
  const hours = Number(match[1]);
  const minutes = match[2];
  if (Number.isNaN(hours) || hours > 23) return "--:--";
  const suffix = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(display).padStart(2, "0")}:${minutes} ${suffix}`;
};

/** "2026-10-30" -> "30 Oct 2026" (parses the key, never the runtime clock). */
export const formatDateLabel = (key) => {
  if (!key) return "";
  const [year, month, day] = String(key).split("-").map(Number);
  if (!year || !month || !day) return String(key);
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${String(day).padStart(2, "0")} ${monthNames[month - 1]} ${year}`;
};

/** Backend decimal hours (e.g. 8.62) -> "8.62 hrs"; empty -> "--". */
export const formatDecimalHours = (hours) => {
  if (hours === null || hours === undefined || hours === "") return "--";
  const value = Number(hours);
  if (Number.isNaN(value)) return "--";
  return `${value.toFixed(2)} hrs`;
};

/** Backend minutes (e.g. 517) -> "8.62 hrs". */
export const formatHoursFromMinutes = (minutes) => {
  if (minutes === null || minutes === undefined) return "--";
  return formatDecimalHours(Number(minutes) / 60);
};

/**
 * Semantic tone for status pills. Unknown statuses fall back to "info" so new
 * backend statuses render styled instead of breaking the table.
 */
export const statusTone = (status) => {
  const value = String(status ?? "").toLowerCase();
  if (["present", "approved", "paid", "active"].includes(value)) return "positive";
  if (["pending", "late", "processed"].includes(value)) return "warning";
  if (["rejected", "absent", "on hold", "inactive"].includes(value)) return "negative";
  if (["on leave", "half-day", "half day"].includes(value)) return "info";
  return "info";
};

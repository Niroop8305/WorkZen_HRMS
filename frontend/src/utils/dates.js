// D-6: the app's business timezone is Asia/Kolkata (mirrors the backend's
// attendance clock). A `new Date()` formatted with toISOString() names the
// PREVIOUS day between 00:00 and 05:29 IST, because toISOString is UTC. Every
// date the UI derives for an API payload, a calendar cell or a MySQL DATE must
// therefore be produced from the business timezone's wall clock, never UTC.

export const BUSINESS_TIMEZONE = "Asia/Kolkata";

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The YYYY-MM-DD key for `date` (defaults to now) as the business timezone's
 * wall clock names it — never shifted by the host's or UTC's offset.
 */
export const toLocalDateKey = (date = new Date()) => {
  const parts = PARTS_FORMATTER.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

/**
 * The current business date key, e.g. "2026-11-19".
 */
export const todayLocalKey = () => toLocalDateKey(new Date());

/**
 * Human label, e.g. "19 Nov 2026", in the business timezone.
 */
export const formatLocalDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

import { MONTHS, PAYMENT_STATUSES, yearOptions } from "./format";

// Reusable payroll filter bar. Month and Year are always available (both are
// server-supported filters on /my-payroll and /all). Status is shown only for
// the Admin / Payroll Officer overview because it maps to the server `status`
// filter. Search is an optional client-side text filter over the already-loaded
// rows - the backend /all endpoint does not offer free-text search or
// pagination, so this only narrows what is on screen and never pretends to be a
// server query.
const PayrollFilters = ({ value, onChange, showStatus = false, showSearch = false, years }) => {
  const yearList = years || yearOptions(6);
  const update = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="payroll-filters">
      <div className="filter-group">
        <label htmlFor="payroll-month">Month</label>
        <select id="payroll-month" value={value.month} onChange={(e) => update({ month: e.target.value })}>
          <option value="">All</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="payroll-year">Year</label>
        <select id="payroll-year" value={value.year} onChange={(e) => update({ year: e.target.value })}>
          <option value="">All</option>
          {yearList.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {showStatus && (
        <div className="filter-group">
          <label htmlFor="payroll-status">Status</label>
          <select id="payroll-status" value={value.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {showSearch && (
        <div className="filter-group filter-search">
          <label htmlFor="payroll-search">Search</label>
          <input
            id="payroll-search"
            type="text"
            placeholder="Filter by name, code, department"
            value={value.search}
            onChange={(e) => update({ search: e.target.value })}
          />
        </div>
      )}
    </div>
  );
};

export default PayrollFilters;

import { useState } from "react";
import { STATUS_TRANSITIONS } from "./format";

// Per-row payroll status control for Admin / Payroll Officer (Step 9). It only
// offers transitions the backend state machine allows (Pending -> Processed /
// On Hold, Processed -> Paid, On Hold -> Processed), so an invalid transition
// can never be submitted from the UI. The backend still re-validates and remains
// authoritative. A payment date is collected only when moving to Paid; leaving it
// blank lets the server default it to today.
const PayrollStatusControl = ({ row, busy, onTransition }) => {
  const allowed = STATUS_TRANSITIONS[row.payment_status] || [];
  const [next, setNext] = useState("");
  const [date, setDate] = useState("");

  if (allowed.length === 0) {
    return <span className="status-final">Final</span>;
  }

  const apply = () => {
    if (!next) return;
    onTransition(row.payroll_id, next, next === "Paid" ? date || undefined : undefined);
  };

  return (
    <div className="status-control">
      <select
        value={next}
        disabled={busy}
        onChange={(e) => setNext(e.target.value)}
        aria-label={`Change status for payroll ${row.payroll_id}`}
      >
        <option value="">Change status…</option>
        {allowed.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {next === "Paid" && (
        <input
          type="date"
          value={date}
          disabled={busy}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Payment date"
        />
      )}
      <button type="button" className="btn-apply-status" onClick={apply} disabled={!next || busy}>
        Apply
      </button>
    </div>
  );
};

export default PayrollStatusControl;

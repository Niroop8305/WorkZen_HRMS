import { useState } from "react";

// Salary structure assignment / version form (Steps 11 + 12). Assigns a salary
// component to an employee with an amount and an effective date range. The
// amount is a currency value for FIXED components and a 0-100 percentage for
// PERCENTAGE components; client validation mirrors salaryService, and the server
// re-validates including effective-date overlap (surfaced as a 409).
const SalaryStructureForm = ({ components, initial, onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    component_id: initial?.component_id ? String(initial.component_id) : "",
    amount: initial ? String(initial.amount) : "",
    effective_from: initial?.effective_from || "",
    effective_to: initial?.effective_to || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeComponents = components.filter((c) => c.is_active);
  const selected = activeComponents.find((c) => String(c.component_id) === form.component_id);
  const isPercentage = selected?.calculation_type === "PERCENTAGE";

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.component_id) return setError("Please select a salary component.");

    const amount = Number(form.amount);
    if (form.amount === "" || !Number.isFinite(amount) || amount < 0) {
      return setError("Amount must be a non-negative number.");
    }
    if (isPercentage && amount > 100) {
      return setError("Amount must be between 0 and 100 for a PERCENTAGE component.");
    }
    if (!form.effective_from) return setError("Effective-from date is required.");
    if (form.effective_to && form.effective_to < form.effective_from) {
      return setError("Effective-to cannot be before effective-from.");
    }

    setError("");
    setBusy(true);
    try {
      await onSubmit({
        component_id: Number(form.component_id),
        amount,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
      });
    } catch (err) {
      setError(err?.message || "Failed to save salary structure");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="payroll-state error">{error}</div>}

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="struct-component">Component</label>
          <select
            id="struct-component"
            value={form.component_id}
            onChange={(e) => update({ component_id: e.target.value })}
            disabled={busy}
          >
            <option value="">Select a component…</option>
            {activeComponents.map((c) => (
              <option key={c.component_id} value={c.component_id}>
                {c.component_name} ({c.component_type} · {c.calculation_type})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="struct-amount">{isPercentage ? "Percentage (0-100)" : "Amount"}</label>
          <input
            id="struct-amount"
            type="number"
            step="0.01"
            min="0"
            max={isPercentage ? "100" : undefined}
            value={form.amount}
            onChange={(e) => update({ amount: e.target.value })}
            disabled={busy}
          />
        </div>

        <div className="form-group">
          <label htmlFor="struct-from">Effective From</label>
          <input
            id="struct-from"
            type="date"
            value={form.effective_from}
            onChange={(e) => update({ effective_from: e.target.value })}
            disabled={busy}
          />
        </div>

        <div className="form-group">
          <label htmlFor="struct-to">Effective To (optional)</label>
          <input
            id="struct-to"
            type="date"
            value={form.effective_to}
            onChange={(e) => update({ effective_to: e.target.value })}
            disabled={busy}
          />
        </div>
      </div>

      <p className="payroll-hint">
        Leave "Effective To" empty for an open-ended assignment. Overlapping ranges for the same
        component are rejected by the server.
      </p>

      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-view-payslip" disabled={busy}>
          {busy ? "Saving…" : initial ? "Update Version" : "Assign Structure"}
        </button>
      </div>
    </form>
  );
};

export default SalaryStructureForm;

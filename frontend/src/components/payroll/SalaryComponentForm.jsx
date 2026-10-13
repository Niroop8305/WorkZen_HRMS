import { useState } from "react";

// Salary component create/edit form (Step 10). Field set and validation mirror
// the backend salaryService rules: component_name required and <= 100 chars,
// component_type Earning|Deduction, calculation_type FIXED|PERCENTAGE, optional
// description, boolean is_taxable. No component amounts or preset percentages
// (e.g. HRA/PF/tax) are hardcoded here - amounts live on the salary structure.
const SalaryComponentForm = ({ initial, onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    component_name: initial?.component_name || "",
    component_type: initial?.component_type || "Earning",
    calculation_type: initial?.calculation_type || "FIXED",
    is_taxable: initial ? Boolean(initial.is_taxable) : false,
    description: initial?.description || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = form.component_name.trim();
    if (!name) return setError("Component name is required.");
    if (name.length > 100) return setError("Component name must be 100 characters or fewer.");
    setError("");
    setBusy(true);
    try {
      await onSubmit({
        component_name: name,
        component_type: form.component_type,
        calculation_type: form.calculation_type,
        is_taxable: form.is_taxable,
        description: form.description.trim() || null,
      });
    } catch (err) {
      setError(err?.message || "Failed to save salary component");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="payroll-state error">{error}</div>}

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="comp-name">Component Name</label>
          <input
            id="comp-name"
            type="text"
            value={form.component_name}
            onChange={(e) => update({ component_name: e.target.value })}
            disabled={busy}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label htmlFor="comp-type">Type</label>
          <select
            id="comp-type"
            value={form.component_type}
            onChange={(e) => update({ component_type: e.target.value })}
            disabled={busy}
          >
            <option value="Earning">Earning</option>
            <option value="Deduction">Deduction</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="comp-calc">Calculation</label>
          <select
            id="comp-calc"
            value={form.calculation_type}
            onChange={(e) => update({ calculation_type: e.target.value })}
            disabled={busy}
          >
            <option value="FIXED">FIXED</option>
            <option value="PERCENTAGE">PERCENTAGE</option>
          </select>
        </div>

        <div className="form-group form-group-inline">
          <label htmlFor="comp-taxable">Taxable</label>
          <input
            id="comp-taxable"
            type="checkbox"
            checked={form.is_taxable}
            onChange={(e) => update({ is_taxable: e.target.checked })}
            disabled={busy}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="comp-desc">Description (optional)</label>
        <textarea
          id="comp-desc"
          rows={2}
          value={form.description}
          onChange={(e) => update({ description: e.target.value })}
          disabled={busy}
        />
      </div>

      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-view-payslip" disabled={busy}>
          {busy ? "Saving…" : initial ? "Update Component" : "Create Component"}
        </button>
      </div>
    </form>
  );
};

export default SalaryComponentForm;

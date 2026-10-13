import { useCallback, useEffect, useState } from "react";
import {
  getEmployees,
  getComponents,
  getSalaryStructure,
  getSalaryStructureAsOf,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
  parseApiError,
} from "../../services/payrollApi";
import Modal from "./Modal";
import SalaryStructureForm from "./SalaryStructureForm";
import { formatCurrency, formatDate } from "./format";

// Salary structure administration (Steps 11 + 12). Pick an employee to view all
// effective-dated component versions (current + historical), assign a new
// version, edit or remove an existing one, and resolve the structure as-of a
// date to preview the timeline. Overlap and inactive-component conflicts are
// surfaced verbatim from the backend (409); the server stays authoritative.
const SalaryStructuresPanel = () => {
  const [employees, setEmployees] = useState([]);
  const [components, setComponents] = useState([]);
  const [userId, setUserId] = useState("");
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null); // null closed, {} create, {..} edit

  const [asOfDate, setAsOfDate] = useState("");
  const [asOf, setAsOf] = useState(null);
  const [asOfLoading, setAsOfLoading] = useState(false);

  useEffect(() => {
    getEmployees().then(setEmployees).catch(() => setEmployees([]));
    getComponents(true).then(setComponents).catch(() => setComponents([]));
  }, []);

  const loadStructures = useCallback(async (id) => {
    if (!id) {
      setStructures([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setStructures(await getSalaryStructure(id, true));
    } catch (err) {
      setError(await parseApiError(err, "Failed to load salary structure"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAsOf(null);
    setAsOfDate("");
    loadStructures(userId);
  }, [userId, loadStructures]);

  const selectedEmployee = employees.find((e) => String(e.user_id) === String(userId));

  const handleSubmit = async (payload) => {
    try {
      if (editing?.structure_id) {
        await updateSalaryStructure(editing.structure_id, payload);
        setNotice("Salary structure version updated.");
      } else {
        await createSalaryStructure(userId, payload);
        setNotice("Salary structure assigned.");
      }
      setEditing(null);
      await loadStructures(userId);
    } catch (err) {
      throw new Error(await parseApiError(err, "Failed to save salary structure"));
    }
  };

  const handleRemove = async (structure) => {
    setNotice("");
    try {
      await deleteSalaryStructure(structure.structure_id);
      await loadStructures(userId);
      setNotice(`Removed "${structure.component_name}" version.`);
    } catch (err) {
      setError(await parseApiError(err, "Failed to remove salary structure"));
    }
  };

  const resolveAsOf = async () => {
    if (!userId || !asOfDate) return;
    setAsOfLoading(true);
    setError("");
    try {
      setAsOf(await getSalaryStructureAsOf(userId, asOfDate));
    } catch (err) {
      setAsOf(null);
      setError(await parseApiError(err, "Failed to resolve salary structure"));
    } finally {
      setAsOfLoading(false);
    }
  };

  const renderAmount = (row) =>
    row.calculation_type === "PERCENTAGE" ? `${Number(row.amount)}%` : formatCurrency(row.amount);

  return (
    <div className="payroll-experience">
      <div className="payroll-toolbar">
        <div className="payroll-title">
          <h1>Salary Structures</h1>
          <p>Assign effective-dated salary components to an employee.</p>
        </div>
      </div>

      <div className="payroll-filters">
        <div className="filter-group">
          <label htmlFor="struct-employee">Employee</label>
          <select id="struct-employee" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.user_id} value={emp.user_id}>
                {emp.full_name || emp.email}
                {emp.employee_code ? ` (${emp.employee_code})` : ""}
              </option>
            ))}
          </select>
        </div>

        {userId && (
          <div className="filter-group">
            <label htmlFor="struct-asof">Resolve as of</label>
            <input
              id="struct-asof"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </div>
        )}

        {userId && (
          <div className="filter-group filter-actions">
            <button type="button" className="btn-secondary" onClick={resolveAsOf} disabled={!asOfDate || asOfLoading}>
              {asOfLoading ? "Resolving…" : "Resolve"}
            </button>
            <button type="button" className="btn-view-payslip" onClick={() => setEditing({})}>
              Assign Component
            </button>
          </div>
        )}
      </div>

      {notice && <div className="payroll-state success">{notice}</div>}
      {error && <div className="payroll-state error">{error}</div>}

      {!userId ? (
        <div className="payroll-state">Select an employee to view their salary structure.</div>
      ) : (
        <>
          {selectedEmployee && (
            <p className="payroll-hint">
              Configuring structure for {selectedEmployee.full_name || selectedEmployee.email}
              {selectedEmployee.department ? ` · ${selectedEmployee.department}` : ""}.
            </p>
          )}

          {asOf && (
            <div className="asof-card">
              <h3>Effective structure as of {formatDate(asOf.as_of)}</h3>
              {asOf.components.length === 0 ? (
                <p className="payroll-hint">No active components effective on this date.</p>
              ) : (
                <ul className="asof-list">
                  {asOf.components.map((c) => (
                    <li key={c.structure_id}>
                      <span>
                        {c.component_name} <em>({c.component_type})</em>
                      </span>
                      <span>{renderAmount(c)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="asof-totals">
                <span>Fixed earnings: {formatCurrency(asOf.totals.fixed_earnings)}</span>
                <span>Fixed deductions: {formatCurrency(asOf.totals.fixed_deductions)}</span>
                <span>Net fixed: {formatCurrency(asOf.totals.net_fixed)}</span>
              </div>
              <p className="payroll-hint">
                Totals cover FIXED components only. PERCENTAGE components are resolved against the
                prorated fixed-earnings base by the payroll engine at generation time.
              </p>
            </div>
          )}

          {loading ? (
            <div className="payroll-state">Loading salary structure...</div>
          ) : structures.length === 0 ? (
            <div className="payroll-state">No salary structure versions for this employee.</div>
          ) : (
            <div className="payroll-table-wrapper">
              <table className="payroll-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Type</th>
                    <th>Calculation</th>
                    <th className="text-right">Amount</th>
                    <th>Effective From</th>
                    <th>Effective To</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {structures.map((s) => (
                    <tr key={s.structure_id} className={s.is_active ? "" : "row-inactive"}>
                      <td>{s.component_name}</td>
                      <td>{s.component_type}</td>
                      <td>{s.calculation_type}</td>
                      <td className="text-right">{renderAmount(s)}</td>
                      <td>{formatDate(s.effective_from)}</td>
                      <td>{s.effective_to ? formatDate(s.effective_to) : "Open"}</td>
                      <td>
                        <span className={`status-pill ${s.is_active ? "status-paid" : "status-on-hold"}`}>
                          {s.is_active ? "Active" : "Removed"}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="row-actions">
                          {s.is_active && (
                            <>
                              <button type="button" className="btn-secondary" onClick={() => setEditing(s)}>
                                Edit
                              </button>
                              <button type="button" className="btn-secondary" onClick={() => handleRemove(s)}>
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && userId && (
        <Modal
          title={editing.structure_id ? "Edit Salary Structure Version" : "Assign Salary Component"}
          onClose={() => setEditing(null)}
        >
          <SalaryStructureForm
            components={components}
            initial={editing.structure_id ? editing : null}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
};

export default SalaryStructuresPanel;

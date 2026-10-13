import { useCallback, useEffect, useState } from "react";
import {
  getComponents,
  createComponent,
  updateComponent,
  updateComponentStatus,
  parseApiError,
} from "../../services/payrollApi";
import Modal from "./Modal";
import SalaryComponentForm from "./SalaryComponentForm";

// Salary component administration (Step 10). Lists all components (including
// inactive) from GET /payroll/components and supports create, edit and
// activate/deactivate. The list is refetched after every mutation because the
// backend returns camelCase mutation payloads but snake_case list rows.
const SalaryComponentsPanel = () => {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null); // null = closed, {} = create, {..} = edit

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setComponents(await getComponents(true));
    } catch (err) {
      setError(await parseApiError(err, "Failed to load salary components"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (payload) => {
    try {
      if (editing?.component_id) {
        await updateComponent(editing.component_id, payload);
        setNotice(`Component "${payload.component_name}" updated.`);
      } else {
        await createComponent(payload);
        setNotice(`Component "${payload.component_name}" created.`);
      }
      setEditing(null);
      await load();
    } catch (err) {
      // Re-throw so the form surfaces the backend message inline.
      throw new Error(await parseApiError(err, "Failed to save salary component"));
    }
  };

  const toggleActive = async (component) => {
    setNotice("");
    try {
      await updateComponentStatus(component.component_id, !component.is_active);
      await load();
      setNotice(
        `Component "${component.component_name}" ${component.is_active ? "deactivated" : "activated"}.`,
      );
    } catch (err) {
      setError(await parseApiError(err, "Failed to update component status"));
    }
  };

  return (
    <div className="payroll-experience">
      <div className="payroll-toolbar">
        <div className="payroll-title">
          <h1>Salary Components</h1>
          <p>Define the earning and deduction components used by salary structures.</p>
        </div>
        <button type="button" className="btn-view-payslip" onClick={() => setEditing({})}>
          Add Component
        </button>
      </div>

      {notice && <div className="payroll-state success">{notice}</div>}
      {error && <div className="payroll-state error">{error}</div>}

      {loading ? (
        <div className="payroll-state">Loading salary components...</div>
      ) : components.length === 0 ? (
        <div className="payroll-state">No salary components configured yet.</div>
      ) : (
        <div className="payroll-table-wrapper">
          <table className="payroll-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Calculation</th>
                <th>Taxable</th>
                <th>Status</th>
                <th>Description</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.component_id} className={c.is_active ? "" : "row-inactive"}>
                  <td>{c.component_name}</td>
                  <td>{c.component_type}</td>
                  <td>{c.calculation_type}</td>
                  <td>{c.is_taxable ? "Yes" : "No"}</td>
                  <td>
                    <span className={`status-pill ${c.is_active ? "status-paid" : "status-on-hold"}`}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="cell-description">{c.description || "-"}</td>
                  <td className="text-right">
                    <div className="row-actions">
                      <button type="button" className="btn-secondary" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => toggleActive(c)}>
                        {c.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title={editing.component_id ? "Edit Salary Component" : "New Salary Component"}
          onClose={() => setEditing(null)}
        >
          <SalaryComponentForm
            initial={editing.component_id ? editing : null}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
};

export default SalaryComponentsPanel;

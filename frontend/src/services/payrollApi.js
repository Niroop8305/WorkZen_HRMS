import api from "./api";

// Centralized Payroll API layer (M5). Every payroll/salary call the frontend
// makes goes through here so raw axios usage is not scattered across components.
// The backend is the single source of truth for all calculation, validation and
// authorization; these helpers only transport requests and unwrap the standard
// { success, data } envelope. No salary value is ever computed client-side.

// ---------------------------------------------------------------------------
// Payroll records
// ---------------------------------------------------------------------------

// Employee's own payroll history. Supported server filters: month + year.
export const getMyPayroll = (params = {}) =>
  api.get("/payroll/my-payroll", { params }).then((r) => r.data.data || []);

// Admin / Payroll Officer org-wide payroll. Supported server filters: userId,
// department, month + year, status. The backend does NOT paginate or free-text
// search this endpoint; callers must not fake those capabilities.
export const getAllPayroll = (params = {}) =>
  api.get("/payroll/all", { params }).then((r) => r.data.data || []);

// Generate one employee's payroll for a period. Payload carries ONLY selection
// inputs (user_id, month, year, optional payment_method, remarks). It never
// carries gross/net/component amounts - the server calculates everything.
export const generatePayroll = (payload) =>
  api.post("/payroll/generate", payload).then((r) => r.data);

// Move a payroll record through the backend status state machine.
export const updatePayrollStatus = (payrollId, payload) =>
  api.put(`/payroll/${payrollId}/status`, payload).then((r) => r.data);

// ---------------------------------------------------------------------------
// Payslip (immutable snapshot, M4)
// ---------------------------------------------------------------------------

export const getPayslip = (payrollId) =>
  api.get(`/payroll/payslip/${payrollId}`).then((r) => r.data.data);

// Fetch the server-generated PDF as a blob. The JWT lives in localStorage and is
// attached by the axios interceptor, so a plain window.open/link would not carry
// it - the caller triggers the download from the returned blob instead.
export const downloadPayslipPdf = async (payrollId) => {
  const response = await api.get(`/payroll/payslip/${payrollId}/pdf`, {
    responseType: "blob",
  });
  const disposition = response.headers["content-disposition"] || "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : `WorkZen-Payslip-${payrollId}.pdf`;
  return { blob: response.data, filename };
};

// Trigger a browser download for a blob returned by downloadPayslipPdf.
export const saveBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Salary components (Admin / Payroll Officer)
// ---------------------------------------------------------------------------

export const getComponents = (includeInactive = true) =>
  api
    .get("/payroll/components", { params: { include_inactive: includeInactive } })
    .then((r) => r.data.data || []);

export const createComponent = (payload) =>
  api.post("/payroll/components", payload).then((r) => r.data);

export const updateComponent = (componentId, payload) =>
  api.put(`/payroll/components/${componentId}`, payload).then((r) => r.data);

export const updateComponentStatus = (componentId, isActive) =>
  api
    .patch(`/payroll/components/${componentId}/status`, { is_active: isActive })
    .then((r) => r.data);

// ---------------------------------------------------------------------------
// Employee salary structures (Admin / Payroll Officer, effective-dated)
// ---------------------------------------------------------------------------

export const getSalaryStructure = (userId, includeInactive = true) =>
  api
    .get(`/payroll/salary-structure/${userId}`, {
      params: { include_inactive: includeInactive },
    })
    .then((r) => r.data.data || []);

export const getSalaryStructureAsOf = (userId, date) =>
  api
    .get(`/payroll/salary-structure/${userId}/as-of`, { params: { date } })
    .then((r) => r.data.data);

export const createSalaryStructure = (userId, payload) =>
  api.post(`/payroll/salary-structure/${userId}`, payload).then((r) => r.data);

export const updateSalaryStructure = (structureId, payload) =>
  api.put(`/payroll/salary-structure/version/${structureId}`, payload).then((r) => r.data);

export const deleteSalaryStructure = (structureId) =>
  api.delete(`/payroll/salary-structure/version/${structureId}`).then((r) => r.data);

// ---------------------------------------------------------------------------
// Employee directory (for selection dropdowns)
// ---------------------------------------------------------------------------

export const getEmployees = () => api.get("/users").then((r) => r.data.data || []);

// ---------------------------------------------------------------------------
// Error normalization (Step 22)
// ---------------------------------------------------------------------------

// Map an axios error to a short, user-facing message without leaking raw server
// or database internals. The backend already returns helpful messages for
// 400/404/409, so those are preferred verbatim; status codes provide fallbacks.
// Blob error bodies (from the PDF endpoint) are parsed before inspection.
export const parseApiError = async (error, fallback = "Something went wrong. Please try again.") => {
  const status = error?.response?.status;
  let body = error?.response?.data;
  if (body instanceof Blob) {
    try {
      body = JSON.parse(await body.text());
    } catch {
      body = null;
    }
  }
  if (body?.message) return body.message;
  switch (status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have access to this payroll resource.";
    case 404:
      return "The requested record was not found.";
    case 409:
      return "This action conflicts with existing payroll data.";
    default:
      if (status >= 500) return "Server error. Please try again later.";
      if (!status) return "Network error. Unable to reach the server.";
      return fallback;
  }
};

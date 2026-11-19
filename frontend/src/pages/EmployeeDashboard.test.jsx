// D-2 role-guard contract: the Employee dashboard consumes ONLY employee-
// authorized endpoints. A single org-wide call (/users, /attendance/all-status,
// /leave/active-leaves) is a regression — it would 403 in the console again.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import EmployeeDashboard from "../pages/EmployeeDashboard.jsx";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      role: "Employee",
      userId: 42,
      email: "emp@workzen.test",
      profile: { full_name: "Priya Test" },
    },
    logout: vi.fn(),
  }),
}));
vi.mock("../components/Sidebar", () => ({ default: () => <aside /> }));
vi.mock("../components/Header", () => ({ default: () => <header /> }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

import api from "../services/api";

const ok = (data) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url === "/dashboard/my-stats") {
      return ok({
        attendance_summary: { present_days: 3, worked_minutes: 1440 },
        leave_balance: [{ balance_id: 1, leave_type_name: "Casual", balance_days: 5 }],
        pending_leaves: [],
        recent_payroll: [],
      });
    }
    if (url === "/attendance/status") {
      return ok({ status: "not_checked_in", check_in_time: null });
    }
    if (url === "/attendance/my-logs") return ok([]);
    if (url === "/leave/my-leaves") return ok([]);
    if (url === "/payroll/my-payroll") return ok([]);
    return Promise.reject(new Error(`unexpected endpoint: ${url}`));
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EmployeeDashboard endpoint guard (D-2)", () => {
  it("requests only employee-authorized endpoints", async () => {
    render(<EmployeeDashboard />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const urls = api.get.mock.calls.map((call) => call[0]);
    expect(urls).toContain("/dashboard/my-stats");
    expect(urls).toContain("/attendance/status");
    expect(urls).toContain("/attendance/my-logs");
    expect(urls).toContain("/leave/my-leaves");
    expect(urls).toContain("/payroll/my-payroll");
    for (const url of urls) {
      expect(url).not.toBe("/users");
      expect(url).not.toBe("/attendance/all-status");
      expect(url).not.toBe("/leave/active-leaves");
      expect(url).not.toBe("/dashboard/stats");
    }
  });

  it("renders the welcome header and check-in action", async () => {
    const { getByText } = render(<EmployeeDashboard />);
    await waitFor(() => getByText(/Welcome, Priya/i));
    expect(getByText(/Check In/)).toBeInTheDocument();
  });
});

// Regression harness for the Reports sections.
//
// Root cause of the historical "#undefined" cells: mappings against fields the
// API never sends. These tests replay the EXACT backend payload shapes for all
// four report sections (daily /monthly attendance, payroll period, leave) and
// assert every cell renders real data — never "undefined" or "Unknown".

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "Admin", email: "admin@workzen.demo" } };
vi.mock("../context/AuthContext", () => ({ useAuth: () => authState }));

const apiGet = vi.fn();
vi.mock("../services/api", () => ({ default: { get: (...args) => apiGet(...args) } }));

import Reports from "../pages/Reports.jsx";

const dailyRow = {
  attendance_id: 1,
  userId: 7, // /attendance/day shape: camelCase, NOT user_id
  attendance_date: "2026-10-30",
  check_in_time: "2026-10-30 08:46:00",
  check_out_time: "2026-10-30 17:35:00",
  total_hours: 8.82,
  worked_minutes: 517,
  late_minutes: 0,
  status: "Present",
  userName: "Aarav Sharma", // /attendance/day shape: userName
  employee_code: "WZ-SYN-0990",
  department: "Engineering",
  checkIn: "08:46",
  checkOut: "17:35",
};

const monthlyRow = {
  attendance_id: 9,
  user_id: 7, // /attendance/all shape: snake_case
  attendance_date: "2026-10-30",
  check_in_time: "2026-10-30 09:14:00",
  check_out_time: "2026-10-30 18:02:00",
  worked_minutes: 528,
  late_minutes: 14,
  status: "Late",
  employee_name: "Aarav Sharma", // /attendance/all shape: employee_name
  employee_code: "WZ-SYN-0990",
};

const payrollRow = {
  payroll_id: 3,
  month: 9,
  year: 2026,
  gross_salary: 84000,
  total_deductions: 12600,
  net_salary: 71400,
  payment_status: "Paid",
  payment_date: "2026-10-01",
  employee_name: "Aarav Sharma",
  employee_code: "WZ-SYN-0990",
};

const leaveRow = {
  leave_id: 5,
  employee_name: "Aarav Sharma",
  employee_code: "WZ-SYN-0990",
  leave_type: "Casual Leave",
  start_date: "2026-11-02",
  end_date: "2026-11-03",
  total_days: 2,
  status: "Approved",
};

const renderReports = () =>
  render(
    <MemoryRouter>
      <Reports />
    </MemoryRouter>,
  );

const runSection = (label) => {
  screen.getByRole("button", { name: label }).click();
};

describe("Reports sections", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("renders all four sections; leave section hidden from Payroll Officer", () => {
    authState.user = { role: "Payroll Officer", email: "payroll@workzen.demo" };
    renderReports();
    expect(screen.getByText("Daily Attendance Report")).toBeTruthy();
    expect(screen.getByText("Monthly Attendance Summary")).toBeTruthy();
    expect(screen.getByText("Payroll Period Report")).toBeTruthy();
    expect(screen.getByText("Leave Report")).toBeTruthy(); // note card
    expect(screen.queryByRole("button", { name: "Run leave report" })).toBeNull();
    cleanup();

    authState.user = { role: "Admin", email: "admin@workzen.demo" };
    renderReports();
    expect(
      screen.getByRole("button", { name: "Run leave report" }),
    ).toBeTruthy();
  });

  it("daily report maps userName/checkIn without undefined cells", async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: [dailyRow], pagination: { total: 1 } },
    });
    renderReports();
    runSection("Run daily attendance report");
    await waitFor(() =>
      expect(screen.getAllByText(/Aarav Sharma · WZ-SYN-0990/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("08:46 AM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("05:35 PM").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8\.62 hrs/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/#undefined/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("monthly summary maps the /attendance/all shape (employee_name, datetimes)", async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: [monthlyRow], pagination: { total: 1 } },
    });
    renderReports();
    runSection("Run monthly attendance report");
    await waitFor(() =>
      expect(screen.getAllByText(/Aarav Sharma · WZ-SYN-0990/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("09:14 AM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("06:02 PM").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unknown/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("payroll period report maps gross/deductions/net without undefined cells", async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: [payrollRow] },
    });
    renderReports();
    runSection("Run payroll period report");
    await waitFor(() =>
      expect(screen.getAllByText(/09\/2026/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("71400").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("leave report maps organization leave rows (Admin only)", async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: [leaveRow] },
    });
    renderReports();
    runSection("Run leave report");
    await waitFor(() =>
      expect(screen.getAllByText(/Casual Leave/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("02 Nov 2026").length).toBeGreaterThan(0);
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("shows the empty state instead of a broken table when no rows exist", async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: [], pagination: { total: 0 } },
    });
    renderReports();
    runSection("Run daily attendance report");
    await waitFor(() =>
      expect(screen.getByText(/No attendance records for that date\./)).toBeTruthy(),
    );
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("surfaces the API error message on failure", async () => {
    apiGet.mockRejectedValue({
      response: { data: { message: "Date parameter is required" } },
    });
    renderReports();
    runSection("Run daily attendance report");
    await waitFor(() =>
      expect(screen.getByText(/Date parameter is required/)).toBeTruthy(),
    );
  });
});

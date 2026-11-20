// Regression harness for the Reports "#undefined" incident.
//
// Root cause: Reports used to render `${r.employee_name} ${r.full_name}
// #${r.user_id}` against the /attendance/day payload, whose rows actually carry
// userName / userId / employee_code. Every unknown field rendered the literal
// string "#undefined" in the table.
//
// These tests replay the EXACT backend payload shapes
// (attendanceController.getAttendanceByDay -> { success, data: rows,
// pagination }, rows with userName/userId/employee_code/checkIn/...;
// payroll rows with month/year/gross_salary/net_salary) and assert no cell
// ever contains "undefined".

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "Admin", email: "admin@workzen.demo" } };
vi.mock("../context/AuthContext", () => ({ useAuth: () => authState }));

const apiGet = vi.fn();
vi.mock("../services/api", () => ({ default: { get: (...args) => apiGet(...args) } }));

import Reports from "../pages/Reports.jsx";

const attendanceRow = {
  attendance_id: 1,
  userId: 7, // backend shape: camelCase, NOT user_id
  attendance_date: "2026-10-30",
  check_in_time: "2026-10-30 08:46:00",
  check_out_time: "2026-10-30 17:35:00",
  total_hours: 8.82,
  worked_minutes: 517,
  late_minutes: 0,
  early_checkout_minutes: 0,
  status: "Present",
  remarks: null,
  userName: "Aarav Sharma", // backend shape: userName, NOT employee_name
  employee_code: "WZ-SYN-0990",
  department: "Engineering",
  designation: "SDE",
  date: "2026-10-30",
  checkIn: "08:46",
  checkOut: "17:35",
};

const payrollRow = {
  payroll_id: 3,
  userId: 7,
  employee_code: "WZ-SYN-0990",
  month: 9,
  year: 2026,
  working_days: 22,
  present_days: 21,
  paid_leave_days: 1,
  gross_salary: 84000,
  total_deductions: 12600,
  net_salary: 71400,
  payment_status: "Paid",
  payment_date: "2026-10-01",
};

const renderReports = () =>
  render(
    <MemoryRouter>
      <Reports />
    </MemoryRouter>,
  );

const runDailyReport = async () => {
  const user = screen.getByRole("combobox");
  // report type defaults to daily; just press Run
  const runButton = screen.getByRole("button", { name: /run report/i });
  runButton.click();
  await waitFor(() => expect(screen.getByText(/Aarav Sharma/)).toBeTruthy());
};

describe("Reports", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("renders employee names, codes and formatted times with zero '#undefined'", async () => {
    apiGet.mockResolvedValue({
      data: {
        success: true,
        data: [attendanceRow],
        pagination: { page: 1, limit: 1000, total: 1, totalPages: 1 },
      },
    });
    renderReports();
    await runDailyReport();

    expect(screen.getByText(/Aarav Sharma · WZ-SYN-0990/)).toBeTruthy();
    expect(screen.getAllByText("08:46 AM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("05:35 PM").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8\.62 hrs/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/#undefined/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.getAllByText("30 Oct 2026").length).toBeGreaterThan(0);
  });

  it("monthly summary maps the /attendance/all payload shape (employee_name, full datetimes)", async () => {
    const allRow = {
      attendance_id: 9,
      user_id: 7, // /all uses snake_case user_id
      attendance_date: "2026-10-30",
      check_in_time: "2026-10-30 09:14:00",
      check_out_time: "2026-10-30 18:02:00",
      total_hours: 8.8,
      worked_minutes: 528,
      late_minutes: 14,
      status: "Late",
      employee_name: "Aarav Sharma", // /all uses employee_name, NOT userName
      employee_code: "WZ-SYN-0990",
      department: "Engineering",
    };
    apiGet.mockResolvedValue({
      data: { success: true, data: [allRow], pagination: { total: 1 } },
    });
    renderReports();
    const select = screen.getByRole("combobox");
    const nativeSelectSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    ).set;
    nativeSelectSetter.call(select, "monthly");
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
    screen.getByRole("button", { name: /run report/i }).click();

    await waitFor(() =>
      expect(screen.getByText(/Aarav Sharma · WZ-SYN-0990/)).toBeTruthy(),
    );
    expect(screen.getAllByText("09:14 AM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("06:02 PM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8.80 hrs").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unknown/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("payroll report maps gross/deductions/net without undefined cells", async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: [payrollRow] },
    });
    renderReports();
    // switch to Payroll Summary
    const select = screen.getByRole("combobox");
    const setSelect = (value) => {
      Object.defineProperty(select, "value", { value, configurable: true });
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    };
    // react selects respond to change events with the native setter
    const nativeSelectSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    ).set;
    nativeSelectSetter.call(select, "payroll");
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
    screen.getByRole("button", { name: /run report/i }).click();

    await waitFor(() => expect(screen.getByText(/09\/2026/)).toBeTruthy());
    expect(screen.getByText("71400")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("shows the empty state instead of a broken table when no rows exist", async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: [], pagination: { total: 0 } },
    });
    renderReports();
    screen.getByRole("button", { name: /run report/i }).click();
    await waitFor(() =>
      expect(screen.getByText(/No records matched this report\./)).toBeTruthy(),
    );
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("surfaces the API error message on failure", async () => {
    apiGet.mockRejectedValue({
      response: { data: { message: "Date parameter is required" } },
    });
    renderReports();
    screen.getByRole("button", { name: /run report/i }).click();
    await waitFor(() =>
      expect(screen.getByText(/Date parameter is required/)).toBeTruthy(),
    );
  });
});

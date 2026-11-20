// Sidebar contract:
//  - the active section renders with the "active" class (white text + indigo
//    accent bar styling hook)
//  - navigation is filtered by role: Employees only see their own routes,
//    Reports appears only for Admin/Payroll Officer
//  - the WorkZen logo is shown, with no Odoo references

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: null };
vi.mock("../context/AuthContext", () => ({ useAuth: () => authState }));

import Sidebar from "../components/Sidebar.jsx";

const renderSidebar = (activeSection = "") =>
  render(
    <MemoryRouter>
      <Sidebar activeSection={activeSection} />
    </MemoryRouter>,
  );

const labels = () =>
  screen
    .getAllByRole("button")
    .map((btn) => btn.textContent);

describe("Sidebar", () => {
  beforeEach(() => {
    authState.user = { role: "Admin", email: "admin@workzen.demo" };
  });

  it("marks the active section and shows WorkZen branding", () => {
    renderSidebar("attendance");
    const attendance = screen.getByRole("button", { name: /Attendance/i });
    expect(attendance.className).toContain("active");
    expect(screen.getAllByText(/WorkZen/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/odoo/i)).toBeNull();
  });

  it("hides Reports from HR Officers and Employees", () => {
    authState.user = { role: "HR Officer", email: "hr@workzen.demo" };
    renderSidebar();
    expect(labels()).not.toContain("Reports");
    expect(labels()).toContain("Employees");
  });

  it("gives Employees a personal nav without Employees/Reports", () => {
    authState.user = { role: "Employee", email: "emp@workzen.demo" };
    renderSidebar();
    const items = labels();
    expect(items[0]).toBe("Dashboard"); // their own dashboard, first in nav
    expect(items).not.toContain("Employees");
    expect(items).not.toContain("Reports");
    expect(items).toContain("Attendance");
    expect(items).toContain("My Profile");
  });

  it("shows Reports for Admin and Payroll Officer", () => {
    authState.user = { role: "Payroll Officer", email: "payroll@workzen.demo" };
    renderSidebar();
    expect(labels()).toContain("Reports");
  });
});

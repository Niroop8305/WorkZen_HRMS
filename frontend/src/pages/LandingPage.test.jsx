// Landing page contract:
//  - unauthenticated visitors see the WorkZen-branded hero and section anchors
//  - authenticated users are redirected to their role dashboard instead of
//    seeing marketing content
//  - all CTAs route to /login (demo access is the real sign-in page)
//  - no third-party (Odoo) branding anywhere on the page

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const authState = { user: null };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

import LandingPage from "../pages/LandingPage.jsx";

const renderAtRoot = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/dashboard" element={<div>STAFF DASHBOARD</div>} />
        <Route
          path="/employee/dashboard"
          element={<div>EMPLOYEE DASHBOARD</div>}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("LandingPage", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("renders WorkZen branding and no Odoo references", () => {
    renderAtRoot();
    expect(screen.getAllByText(/WorkZen/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/odoo/i)).toBeNull();
  });

  it("exposes the section anchors and calls-to-action", () => {
    renderAtRoot();
    // Features/Roles/Security appear in both the top nav and the footer.
    for (const anchor of ["Features", "Roles", "Security"]) {
      expect(screen.getAllByRole("link", { name: anchor }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("link", { name: "Sign In" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Launch Demo/i })).toBeTruthy();
  });

  it("redirects authenticated Admin users to the staff dashboard", () => {
    authState.user = { role: "Admin", email: "admin@workzen.demo" };
    renderAtRoot();
    expect(screen.getByText("STAFF DASHBOARD")).toBeTruthy();
  });

  it("redirects authenticated Employees to their own dashboard", () => {
    authState.user = { role: "Employee", email: "emp@workzen.demo" };
    renderAtRoot();
    expect(screen.getByText("EMPLOYEE DASHBOARD")).toBeTruthy();
  });

  it("renders the four-role access matrix", () => {
    renderAtRoot();
    for (const role of ["Admin", "HR Officer", "Payroll Officer", "Employee"]) {
      expect(screen.getByText(role)).toBeTruthy();
    }
  });

  it("leaves marketing content on screen for unauthenticated visitors", () => {
    renderAtRoot();
    expect(screen.queryByText("LOGIN PAGE")).toBeNull();
    cleanup();
  });
});

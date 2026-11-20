// Smoke test: SignIn must render with its WorkZen branding and the gated demo
// grid. Regression guard — an unbound WorkZenLogo usage (missing import) builds
// fine but crashes at runtime with "WorkZenLogo is not defined".

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: null, login: vi.fn() };
vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

import SignIn from "../pages/SignIn.jsx";

const renderSignIn = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <SignIn />
    </MemoryRouter>,
  );

describe("SignIn", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("renders WorkZen branding with no Odoo references", () => {
    renderSignIn();
    expect(screen.getAllByText(/WorkZen/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/odoo/i)).toBeNull();
  });

  it("links back to the home page", () => {
    renderSignIn();
    expect(
      screen.getByRole("link", { name: /back to home/i }),
    ).toBeTruthy();
  });

  it("shows the demo-account grid in development", () => {
    renderSignIn();
    expect(screen.getByText(/Demo Accounts/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Fill" }).length).toBe(4);
  });
});

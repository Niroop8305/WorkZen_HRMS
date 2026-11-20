// Shell contract for MyProfile: the page must render inside the shared
// dashboard layout — sidebar visible, header on top — instead of the old
// full-viewport standalone container that dropped the side navigation.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = {
  user: {
    userId: 42,
    role: "Employee",
    email: "emp@workzen.test",
  },
  logout: vi.fn(),
};
vi.mock("../context/AuthContext", () => ({ useAuth: () => authState }));

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("../services/api", () => ({
  default: { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a) },
}));

import MyProfile from "../pages/MyProfile.jsx";

const ok = (data) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockImplementation((url) => {
    if (url === "/payroll/my-payroll") return ok([]);
    if (String(url).startsWith("/payroll/salary-structure/")) return ok(null);
    if (String(url).startsWith("/users/profile/"))
      return ok({
        profile: { first_name: "Priya", last_name: "Test", email: "emp@workzen.test" },
      });
    return ok(null);
  });
});

const renderProfile = () =>
  render(
    <MemoryRouter initialEntries={["/profile"]}>
      <MyProfile />
    </MemoryRouter>,
  );

describe("MyProfile shell", () => {
  it("renders inside the dashboard layout with sidebar and header", async () => {
    renderProfile();
    await waitFor(() =>
      expect(screen.getByText(/Priya/i)).toBeTruthy(),
    );
    // "My Profile" appears twice: the sidebar nav item and the header title —
    // both shell pieces are rendering.
    expect(screen.getAllByText("My Profile").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector(".dashboard-layout")).toBeTruthy();
    expect(document.querySelector(".dashboard-sidebar")).toBeTruthy();
    expect(document.querySelector(".dashboard-main")).toBeTruthy();
    // The profile content renders within main, not as a full-page takeover.
    const main = document.querySelector(".dashboard-main");
    expect(main.querySelector(".profile-container")).toBeTruthy();
  });
});

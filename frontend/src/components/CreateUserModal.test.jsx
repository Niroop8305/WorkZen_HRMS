// T-008 frontend contract: the create-user success panel must never render a
// credential, and it must name the delivery outcome honestly for all three
// mail states the backend reports (emailed / mail-disabled / failed).

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateUserModal from "../components/CreateUserModal.jsx";

// The modal only talks to /users/create; everything else is static UI.
vi.mock("../services/api", () => ({ default: { post: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "Admin", userId: 1, email: "admin@x.test" } }),
}));

import api from "../services/api";

const createViaForm = async (response) => {
  api.post.mockResolvedValueOnce(response);
  render(<CreateUserModal isOpen onClose={() => {}} onUserCreated={() => {}} />);
  // The form labels are not programmatically associated with their inputs,
  // so the fields are addressed by name.
  await userEvent.type(document.querySelector('input[name="first_name"]'), "Priya");
  await userEvent.type(document.querySelector('input[name="email"]'), "priya@workzen.test");
  await userEvent.click(screen.getByRole("button", { name: /create user/i }));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
};

const baseData = {
  data: {
    userId: 7,
    email: "priya@workzen.test",
    role: "Employee",
    employee_code: "OIPRT20260007",
    full_name: "Priya Test",
  },
};

describe("CreateUserModal credential messaging (T-008)", () => {
  beforeEach(() => {
    vi.stubGlobal("alert", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows the emailed confirmation and no credential", async () => {
    await createViaForm({
      data: { success: true, message: "User created successfully and welcome email sent", emailSent: true, credentials_emailed: true, email_delivery_status: "emailed", ...baseData },
    });
    await waitFor(() => screen.getByText(/credentials emailed/i));
    expect(screen.getByText(/only for the recipient/i)).toBeInTheDocument();
    // The old credential label/value is gone; the copy that remains only says
    // the password was delivered by mail.
    expect(screen.queryByText(/^temporary password:?$/i)).not.toBeInTheDocument();
    expect(document.querySelector("code")).not.toBeInTheDocument();
    // No 16-hex credential anywhere in the panel.
    expect(document.body.textContent).not.toMatch(/\b[0-9a-f]{16}\b/i);
  });

  it("names the mail-disabled state and asks for SMTP + reset flow", async () => {
    await createViaForm({
      data: { success: true, message: "User created successfully; mail is disabled in this environment, so no welcome email was sent", emailSent: false, credentials_emailed: false, email_delivery_status: "mail-disabled", ...baseData },
    });
    await waitFor(() => screen.getByText(/credential not delivered/i));
    expect(screen.getByText(/mail is disabled/i)).toBeInTheDocument();
    expect(screen.getByText(/password-reset flow/i)).toBeInTheDocument();
    // The old credential label/value is gone; the copy that remains only says
    // the password was delivered by mail.
    expect(screen.queryByText(/^temporary password:?$/i)).not.toBeInTheDocument();
    expect(document.querySelector("code")).not.toBeInTheDocument();
  });

  it("names the email-failed state", async () => {
    await createViaForm({
      data: { success: true, message: "User created successfully but email failed to send", emailSent: false, credentials_emailed: false, email_delivery_status: "failed", ...baseData },
    });
    await waitFor(() => screen.getByText(/email failed to send/i));
    expect(screen.getByText(/no credential is shown/i)).toBeInTheDocument();
  });
});

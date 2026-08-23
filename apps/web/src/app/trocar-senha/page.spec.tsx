import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSessionSecurity } from "@/features/auth/auth.service";
import { ApiError } from "@/lib/http/api-error";
import ChangeRequiredPasswordPage from "./page";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/features/auth/auth.service", () => ({
  fetchSessionSecurity: vi.fn(),
}));

vi.mock("./change-required-password-form", () => ({
  ChangeRequiredPasswordForm: () => <div>Formulário de troca obrigatória</div>,
}));

const securityMock = vi.mocked(fetchSessionSecurity);

describe("/trocar-senha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when the session is missing", async () => {
    securityMock.mockRejectedValue(new ApiError("Sessão expirada.", 401));

    render(<ChangeRequiredPasswordPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
  });

  it("returns an authenticated user without a pending reset to home", async () => {
    securityMock.mockResolvedValue({
      csrfToken: "csrf-token",
      passwordChangeRequired: false,
    });

    render(<ChangeRequiredPasswordPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/home"));
  });

  it("shows the required password form only for a pending reset", async () => {
    securityMock.mockResolvedValue({
      csrfToken: "csrf-token",
      passwordChangeRequired: true,
    });

    render(<ChangeRequiredPasswordPage />);

    expect(
      await screen.findByText("Formulário de troca obrigatória"),
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

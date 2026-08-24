import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeRequiredPassword } from "@/features/auth/auth.service";
import { ApiError } from "@/lib/http/api-error";
import { ChangeRequiredPasswordForm } from "./change-required-password-form";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/features/auth/auth.service", () => ({
  changeRequiredPassword: vi.fn(),
}));

const changeMock = vi.mocked(changeRequiredPassword);

describe("ChangeRequiredPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    changeMock.mockResolvedValue(undefined);
  });

  it("validates the new password and confirmation before calling the API", async () => {
    const user = userEvent.setup();
    render(<ChangeRequiredPasswordForm />);

    await user.click(screen.getByRole("button", { name: "Definir nova senha" }));

    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(changeMock).not.toHaveBeenCalled();
  });

  it("submits only the new password and redirects after success", async () => {
    const user = userEvent.setup();
    render(<ChangeRequiredPasswordForm />);
    await user.type(screen.getByLabelText("Nova senha"), "definitive-password");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "definitive-password");
    await user.click(screen.getByRole("button", { name: "Definir nova senha" }));

    await waitFor(() =>
      expect(changeMock).toHaveBeenCalledWith({
        newPassword: "definitive-password",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/senha foi alterada/i);
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("maps known reset errors without exposing an implementation detail", async () => {
    changeMock.mockRejectedValueOnce(
      new ApiError(
        "Escolha uma senha diferente da temporária.",
        400,
        "PASSWORD_MUST_CHANGE",
      ),
    );
    const user = userEvent.setup();
    render(<ChangeRequiredPasswordForm />);
    await user.type(screen.getByLabelText("Nova senha"), "temporary-password");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "temporary-password");
    await user.click(screen.getByRole("button", { name: "Definir nova senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /diferente da temporária/i,
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("maps an expired or replaced temporary credential", async () => {
    changeMock.mockRejectedValueOnce(
      new ApiError(
        "A senha temporária expirou ou foi substituída.",
        401,
        "PASSWORD_RESET_INVALID",
      ),
    );
    const user = userEvent.setup();
    render(<ChangeRequiredPasswordForm />);
    await user.type(screen.getByLabelText("Nova senha"), "definitive-password");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "definitive-password");
    await user.click(screen.getByRole("button", { name: "Definir nova senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /expirou ou foi substituída/i,
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("prevents double submission while the password change is pending", async () => {
    let resolve!: () => void;
    changeMock.mockImplementation(
      () => new Promise<void>((done) => (resolve = done)),
    );
    const user = userEvent.setup();
    render(<ChangeRequiredPasswordForm />);
    await user.type(screen.getByLabelText("Nova senha"), "definitive-password");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "definitive-password");
    const submit = screen.getByRole("button", { name: "Definir nova senha" });
    await user.click(submit);
    await user.click(submit);

    expect(changeMock).toHaveBeenCalledOnce();
    expect(submit).toBeDisabled();
    resolve();
  });
});

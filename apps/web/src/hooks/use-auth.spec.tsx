import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMe } from "@/features/users/users.service";
import { ApiError } from "@/lib/http/api-error";
import { useMe } from "./use-auth";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/features/users/users.service", () => ({
  fetchMe: vi.fn(),
}));

const fetchMeMock = vi.mocked(fetchMe);

function Probe() {
  const query = useMe();
  if (query.isPending) return <p>Carregando sessão</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  return <p>{query.data?.email}</p>;
}

function renderProbe() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
}

describe("useMe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects a coded password-change response to the required-change page", async () => {
    fetchMeMock.mockRejectedValue(
      new ApiError(
        "Defina uma nova senha para continuar.",
        403,
        "PASSWORD_CHANGE_REQUIRED",
      ),
    );

    renderProbe();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Defina uma nova senha",
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/trocar-senha"));
  });

  it("does not redirect an unrelated forbidden response", async () => {
    fetchMeMock.mockRejectedValue(
      new ApiError("Acesso negado.", 403, "ADMIN_PROFILE_REQUIRED"),
    );

    renderProbe();

    expect(await screen.findByRole("alert")).toHaveTextContent("Acesso negado");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("keeps ordinary authentication failures available to the caller", async () => {
    fetchMeMock.mockRejectedValue(new ApiError("Sessão expirada.", 401));

    renderProbe();

    expect(await screen.findByRole("alert")).toHaveTextContent("Sessão expirada");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("exposes the loading state while session validation is pending", async () => {
    fetchMeMock.mockImplementation(() => new Promise(() => undefined));

    renderProbe();

    expect(screen.getByText("Carregando sessão")).toBeInTheDocument();
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminAuditEvents } from "@/features/audit/audit.service";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { AuditClient } from "./audit-client";

const replace = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/auditoria",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));
vi.mock("@/features/audit/audit.service", () => ({
  fetchAdminAuditEvents: vi.fn(),
}));

const fetchAuditMock = vi.mocked(fetchAdminAuditEvents);
const event = {
  id: "audit-1",
  actorType: "ADMIN" as const,
  actorAdminId: "admin-1",
  participantId: "participant-1",
  operation: "PARTICIPANT_STATUS_CHANGED" as const,
  entityType: "PARTICIPANT" as const,
  entityId: "participant-1",
  reason: "Bloqueio solicitado pela organização.",
  before: { id: "participant-1", isActive: true, passwordHash: "segredo" },
  after: { id: "participant-1", isActive: false, token: "segredo" },
  metadata: { pointEventId: "point-1", headers: "segredo" },
  requestId: "request-1",
  createdAt: "2026-07-14T15:30:00.000Z",
};

describe("AuditClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearch = "";
    fetchAuditMock.mockResolvedValue({
      items: [event],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it("carrega os filtros da URL e aplica combinacoes resetando a pagina", async () => {
    currentSearch = "page=3&actorType=ADMIN&operation=ACTION_UPDATED";
    const user = userEvent.setup();
    renderWithQueryClient(<AuditClient />);

    await waitFor(() =>
      expect(fetchAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 3,
          actorType: "ADMIN",
          operation: "ACTION_UPDATED",
        }),
      ),
    );
    await user.type(screen.getByLabelText("Request ID"), "req-42");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(replace).toHaveBeenCalledWith(
      "/admin/auditoria?actorType=ADMIN&operation=ACTION_UPDATED&requestId=req-42",
      { scroll: false },
    );
  });

  it("exibe carregamento, erro com retry e vazio independentemente", async () => {
    let reject!: (error: Error) => void;
    fetchAuditMock.mockImplementationOnce(
      () => new Promise((_, fail) => (reject = fail)),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<AuditClient />);
    expect(
      screen.getByRole("status", { name: "Carregando auditoria" }),
    ).toBeInTheDocument();

    reject(new ApiError("Consulta indisponivel.", 503));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Consulta indisponivel.",
    );
    fetchAuditMock.mockResolvedValueOnce({
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByText("Nenhum evento encontrado"),
    ).toBeInTheDocument();
  });

  it("mostra detalhes nomeados sem renderizar campos sensiveis ou JSON cru", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<AuditClient />);
    const details = await screen.findByText("Ver detalhes");
    await user.click(details);
    const region = screen.getByRole("region", { name: "Detalhes do evento" });

    expect(within(region).getAllByText("Ativo")).toHaveLength(2);
    expect(within(region).getByText("point-1")).toBeInTheDocument();
    expect(region).not.toHaveTextContent("passwordHash");
    expect(region).not.toHaveTextContent("token");
    expect(region).not.toHaveTextContent("headers");
    expect(region).not.toHaveTextContent('{"');
  });

  it("mantem semantica de tabela no desktop e lista no mobile", async () => {
    renderWithQueryClient(<AuditClient />);
    expect(
      await screen.findByRole("table", { name: "Eventos de auditoria" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", {
        name: "Eventos de auditoria em tela pequena",
      }),
    ).toBeInTheDocument();
  });
});

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminAuditEvents } from "@/features/audit/audit.service";
import { ApiError } from "@/lib/http/api-error";
import { renderWithQueryClient } from "@/test/render";
import { AuditClient } from "./audit-client";

const replace = vi.fn();
const push = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/auditoria",
  useRouter: () => ({ push, replace }),
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
  actorDisplay: { name: "Ada Lovelace", email: "ada@example.com" },
  participantId: "participant-1",
  participantDisplay: { name: "Grace Hopper", email: "grace@example.com" },
  operation: "PARTICIPANT_STATUS_CHANGED" as const,
  entityType: "PARTICIPANT" as const,
  entityId: "participant-1",
  entityDisplay: { name: "Grace Hopper" },
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
    currentSearch =
      "page=3&actorType=ADMIN&operation=ACTION_UPDATED&actorSearch=Ada";
    fetchAuditMock.mockResolvedValue({
      items: [event],
      meta: { page: 3, limit: 20, total: 60, totalPages: 3 },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AuditClient />);

    await waitFor(() =>
      expect(fetchAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 3,
          actorType: "ADMIN",
          actorSearch: "Ada",
          operation: "ACTION_UPDATED",
        }),
      ),
    );
    await user.clear(screen.getByLabelText("Ator (nome ou e-mail)"));
    await user.type(screen.getByLabelText("Ator (nome ou e-mail)"), "Linus");
    await user.type(screen.getByLabelText("Entidade (nome)"), "Palestra");
    await user.type(
      screen.getByLabelText("Participante (nome ou e-mail)"),
      "Grace",
    );
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(push).toHaveBeenCalledWith(
      "/admin/auditoria?actorSearch=Linus&actorType=ADMIN&entitySearch=Palestra&operation=ACTION_UPDATED&participantSearch=Grace",
      { scroll: false },
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("remove filtros tecnicos de ID do formulario", async () => {
    renderWithQueryClient(<AuditClient />);
    await screen.findByRole("table", { name: "Eventos de auditoria" });

    expect(
      screen.queryByLabelText("ID do administrador"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ID da entidade")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("ID do participante"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Ator (nome ou e-mail)")).toHaveAttribute(
      "name",
      "actorSearch",
    );
    expect(screen.getByLabelText("Entidade (nome)")).toHaveAttribute(
      "name",
      "entitySearch",
    );
    expect(
      screen.getByLabelText("Participante (nome ou e-mail)"),
    ).toHaveAttribute("name", "participantSearch");
  });

  it("preserva filtros de ID de uma URL salva ao combinar buscas humanas", async () => {
    currentSearch =
      "actorAdminId=admin-1&entityId=action-1&participantId=participant-1";
    const user = userEvent.setup();
    renderWithQueryClient(<AuditClient />);

    await waitFor(() =>
      expect(fetchAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actorAdminId: "admin-1",
          entityId: "action-1",
          participantId: "participant-1",
        }),
      ),
    );
    await user.type(screen.getByLabelText("Ator (nome ou e-mail)"), "Ada");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(push).toHaveBeenCalledWith(
      "/admin/auditoria?actorAdminId=admin-1&actorSearch=Ada&entityId=action-1&participantId=participant-1",
      { scroll: false },
    );
  });

  it("usa push na paginacao e reidrata o formulario ao voltar no historico", async () => {
    currentSearch = "limit=50&requestId=req-atual";
    fetchAuditMock.mockResolvedValue({
      items: [event],
      meta: { page: 1, limit: 50, total: 100, totalPages: 2 },
    });
    const user = userEvent.setup();
    const view = renderWithQueryClient(<AuditClient />);

    await user.click(
      await screen.findByRole("button", { name: "Proxima pagina" }),
    );
    expect(push).toHaveBeenCalledWith(
      "/admin/auditoria?limit=50&page=2&requestId=req-atual",
      { scroll: false },
    );

    currentSearch = "limit=50&requestId=req-anterior";
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <AuditClient />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Request ID")).toHaveValue("req-anterior");
  });

  it("limpa filtros com push preservando o limite aceito", async () => {
    currentSearch = "limit=50&requestId=req-1";
    const user = userEvent.setup();
    renderWithQueryClient(<AuditClient />);

    await user.click(
      await screen.findByRole("button", { name: "Limpar filtros" }),
    );

    expect(push).toHaveBeenCalledWith("/admin/auditoria?limit=50", {
      scroll: false,
    });
  });

  it("canonicaliza pagina acima do total com replace sem renderizar vazio", async () => {
    currentSearch = "limit=50&page=9&requestId=req-1";
    fetchAuditMock.mockResolvedValue({
      items: [],
      meta: { page: 9, limit: 50, total: 120, totalPages: 3 },
    });
    renderWithQueryClient(<AuditClient />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/admin/auditoria?limit=50&page=3&requestId=req-1",
        { scroll: false },
      ),
    );
    expect(replace).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Nenhum evento encontrado"),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("refaz a consulta ao remontar mesmo quando o cache contem auditoria", async () => {
    const first = renderWithQueryClient(<AuditClient />);
    await screen.findByRole("table", { name: "Eventos de auditoria" });
    first.unmount();

    render(
      <QueryClientProvider client={first.queryClient}>
        <AuditClient />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(fetchAuditMock).toHaveBeenCalledTimes(2));
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
    fetchAuditMock.mockResolvedValue({
      items: [
        {
          ...event,
          before: {
            id: "participant-1",
            isActive: true,
            passwordHash: "segredo",
            type: "CHECKIN",
            role: "ADMIN",
            status: "PENDING",
            redemptionMethod: "CLAIM_CODE",
          },
          after: { id: "participant-1", isActive: false, token: "segredo" },
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AuditClient />);
    const details = (
      await screen.findAllByRole("button", {
        name: "Ver detalhes de Status do participante alterado",
      })
    )[0];
    details.focus();
    await user.keyboard("{Enter}");
    const region = screen.getByRole("region", { name: "Detalhes do evento" });

    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(details).toHaveAttribute("aria-controls", region.id);
    expect(details).toHaveFocus();
    expect(within(region).getAllByText("Ativo")).toHaveLength(2);
    expect(region).toHaveTextContent("Credenciamento");
    expect(region).toHaveTextContent("Administrador");
    expect(region).toHaveTextContent("Pendente");
    expect(region).toHaveTextContent("Código de uso único");
    expect(region).not.toHaveTextContent("CHECKIN");
    expect(region).not.toHaveTextContent("CLAIM_CODE");
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

  it("prioriza nomes e e-mails e preserva IDs e navegacao do participante", async () => {
    renderWithQueryClient(<AuditClient />);
    const table = await screen.findByRole("table", {
      name: "Eventos de auditoria",
    });

    expect(within(table).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(table).getByText("ada@example.com")).toBeInTheDocument();
    expect(
      within(table).getByText("Grace Hopper", { selector: "a span" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("grace@example.com")).toBeInTheDocument();
    expect(within(table).getByText("admin-1")).toHaveClass("font-mono");
    expect(within(table).getAllByText("participant-1")[0]).toHaveClass(
      "font-mono",
    );
    expect(
      within(table).getByRole("link", { name: /Grace Hopper/ }),
    ).toHaveAttribute("href", "/admin/participantes/participant-1");
  });

  it("usa fallbacks seguros quando os displays nao existem", async () => {
    fetchAuditMock.mockResolvedValue({
      items: [
        {
          ...event,
          actorDisplay: null,
          participantDisplay: null,
          entityDisplay: null,
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    renderWithQueryClient(<AuditClient />);
    const table = await screen.findByRole("table", {
      name: "Eventos de auditoria",
    });

    expect(within(table).getByText("Administrador")).toBeInTheDocument();
    expect(
      within(table).getByText("Participante", { selector: "span.font-medium" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("link", { name: /participant-1/ }),
    ).toBeInTheDocument();
  });

  it("renderiza a hierarquia humana completa na lista mobile", async () => {
    renderWithQueryClient(<AuditClient />);
    const mobile = await screen.findByRole("list", {
      name: "Eventos de auditoria em tela pequena",
    });
    const participant = within(mobile).getByRole("link", {
      name: /Grace Hopper/,
    });

    expect(within(mobile).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(mobile).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(participant).getByText("Grace Hopper")).toBeInTheDocument();
    expect(
      within(participant).getByText("grace@example.com"),
    ).toBeInTheDocument();
    expect(within(participant).getByText("participant-1")).toHaveClass(
      "font-mono",
    );
  });

  it("trata SYSTEM, participante ausente e displays vazios sem links invalidos", async () => {
    fetchAuditMock.mockResolvedValue({
      items: [
        {
          ...event,
          actorType: "SYSTEM",
          actorAdminId: null,
          actorDisplay: { name: " ", email: undefined as unknown as null },
          participantId: null,
          participantDisplay: { name: "", email: " " },
          entityDisplay: { name: "" },
        },
        {
          ...event,
          id: "audit-2",
          actorDisplay: null,
          participantDisplay: { name: "", email: " " },
          entityDisplay: null,
        },
      ],
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    renderWithQueryClient(<AuditClient />);
    const mobile = await screen.findByRole("list", {
      name: "Eventos de auditoria em tela pequena",
    });

    expect(within(mobile).getByText("Sistema")).toBeInTheDocument();
    expect(
      within(mobile).getAllByText("Participante", {
        selector: "span.font-medium",
      }).length,
    ).toBeGreaterThan(0);
    expect(within(mobile).getByText("Não relacionado")).toBeInTheDocument();
    const links = within(mobile).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "/admin/participantes/participant-1",
    );
    expect(within(links[0]).getByText("participant-1")).toHaveClass(
      "font-mono",
    );
    expect(links[0]).not.toHaveAttribute(
      "href",
      expect.stringMatching(/null|undefined/),
    );
    expect(mobile).not.toHaveTextContent("undefined");
  });
});

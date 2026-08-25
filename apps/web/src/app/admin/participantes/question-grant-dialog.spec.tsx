import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminActions,
  grantQuestionAction,
} from "@/features/actions/actions.service";
import { renderWithQueryClient } from "@/test/render";
import { QuestionGrantDialog } from "./question-grant-dialog";

vi.mock("@/features/actions/actions.service", () => ({
  fetchAdminActions: vi.fn(),
  grantQuestionAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fetchActionsMock = vi.mocked(fetchAdminActions);
const grantMock = vi.mocked(grantQuestionAction);
const action = {
  id: "question-1",
  name: "Perguntas — Palestra de IA",
  description: null,
  type: "QUESTION" as const,
  code: null,
  points: 30,
  isActive: true,
  isCodeActive: false,
  createdAt: "2026-08-25T12:00:00.000Z",
  claimCodes: { total: 0, used: 0, available: 0 },
  redemptionsCount: 0,
};

describe("QuestionGrantDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchActionsMock.mockResolvedValue({
      items: [action],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    grantMock.mockResolvedValue({
      action: { id: action.id, name: action.name, points: action.points },
      participantId: "participant-1",
      pointEventId: "event-1",
      awardedPoints: 30,
      awardedXp: 30,
      currentPoints: 130,
      currentXp: 80,
      currentLevel: 1,
      grantedAt: "2026-08-25T13:00:00.000Z",
    });
  });

  it("pré-seleciona a única palestra e confirma pontos e XP em um clique", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(
      <QuestionGrantDialog
        onClose={vi.fn()}
        onSuccess={onSuccess}
        participant={{ id: "participant-1", name: "Ana Silva" }}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Ana Silva")).toBeVisible();
    await within(dialog).findByText("+30 pontos / +30 XP");
    expect(
      within(dialog).getByRole("combobox", { name: "Palestra" }),
    ).toHaveValue("question-1");
    expect(within(dialog).getByText("+30 pontos / +30 XP")).toBeVisible();

    await user.click(
      within(dialog).getByRole("button", { name: "Confirmar pontos" }),
    );

    await waitFor(() =>
      expect(grantMock).toHaveBeenCalledWith("question-1", "participant-1"),
    );
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ currentPoints: 130 }),
    );
  });

  it("bloqueia a confirmação quando não existe palestra de pergunta ativa", async () => {
    fetchActionsMock.mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    renderWithQueryClient(
      <QuestionGrantDialog
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        participant={{ id: "participant-1", name: "Ana Silva" }}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(
        /Nenhuma palestra de pergunta está ativa/,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Confirmar pontos" }),
    ).toBeDisabled();
  });
});

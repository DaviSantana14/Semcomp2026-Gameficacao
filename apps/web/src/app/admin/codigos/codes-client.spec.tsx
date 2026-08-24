import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminActions } from "@/features/actions/actions.service";
import { renderWithQueryClient } from "@/test/render";
import { CodesClient } from "./codes-client";

vi.mock("@/features/actions/actions.service", () => ({
  fetchAdminActions: vi.fn(),
}));
vi.mock("./claim-code-generator", () => ({ ClaimCodeGenerator: () => null }));
vi.mock("./claim-code-batch-history", () => ({ ClaimCodeBatchHistory: () => null }));
vi.mock("./claim-code-history", () => ({ ClaimCodeHistory: () => null }));
vi.mock("./reusable-code-history", () => ({ ReusableCodeHistory: () => null }));
vi.mock("./code-redemption-history", () => ({
  CodeRedemptionHistory: () => <p>Conteúdo de resgates</p>,
}));

describe("CodesClient tabs", () => {
  beforeEach(() => {
    vi.mocked(fetchAdminActions).mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
  });

  it("keeps all three code views keyboard navigable", async () => {
    renderWithQueryClient(<CodesClient />);
    const single = screen.getByRole("tab", { name: "Uso único" });
    const reusable = screen.getByRole("tab", { name: "Reutilizáveis" });
    const redemptions = screen.getByRole("tab", { name: "Resgates" });

    fireEvent.keyDown(single, { key: "ArrowRight" });
    expect(reusable).toHaveFocus();
    fireEvent.keyDown(reusable, { key: "ArrowRight" });
    expect(redemptions).toHaveFocus();
    fireEvent.keyDown(redemptions, { key: "Home" });
    expect(single).toHaveFocus();
    fireEvent.keyDown(single, { key: "End" });
    expect(redemptions).toHaveFocus();
    expect(screen.getByText("Conteúdo de resgates")).toBeInTheDocument();
  });
});

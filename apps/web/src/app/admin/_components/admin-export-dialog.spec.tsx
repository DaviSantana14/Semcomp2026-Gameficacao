import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AdminExportDialog } from "./admin-export-dialog";

function renderDialog({
  count = vi.fn().mockResolvedValue({ count: 4, maxRows: 50_000 }),
  download = vi.fn().mockResolvedValue(undefined),
}: {
  count?: () => Promise<{ count: number; maxRows: number }>;
  download?: () => Promise<void>;
} = {}) {
  const onClose = vi.fn();
  render(
    <AdminExportDialog
      appliedFilters={[{ label: "Busca", value: "Ana Silva" }]}
      count={count}
      download={download}
      onClose={onClose}
      title="Exportar participantes"
    />,
  );
  return { count, download, onClose };
}

describe("AdminExportDialog", () => {
  it("loads and announces the count with the applied filters and PII warning", async () => {
    const count = vi.fn().mockResolvedValue({ count: 4, maxRows: 50_000 });
    renderDialog({ count });

    expect(screen.getByRole("status")).toHaveTextContent(/contando/i);
    expect(await screen.findByText("4 registros")).toBeInTheDocument();
    expect(screen.getByText("Busca")).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText(/dados pessoais/i)).toBeInTheDocument();
    expect(count).toHaveBeenCalledOnce();
  });

  it("keeps the count error available for retry", async () => {
    const count = vi
      .fn()
      .mockRejectedValueOnce(new Error("Falha ao contar"))
      .mockResolvedValueOnce({ count: 2, maxRows: 50_000 });
    renderDialog({ count });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao contar",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("2 registros")).toBeInTheDocument();
    expect(count).toHaveBeenCalledTimes(2);
  });

  it.each([
    [0, /nenhum registro/i],
    [50_001, /acima do limite/i],
  ])("disables export for an invalid count (%s)", async (value, message) => {
    renderDialog({
      count: vi.fn().mockResolvedValue({ count: value, maxRows: 50_000 }),
    });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
  });

  it("prevents double downloads and closes only after the download resolves", async () => {
    let resolveDownload!: () => void;
    const download = vi.fn(
      () => new Promise<void>((resolve) => (resolveDownload = resolve)),
    );
    const { onClose } = renderDialog({ download });
    const exportButton = await screen.findByRole("button", {
      name: "Exportar CSV",
    });
    fireEvent.click(exportButton);
    fireEvent.click(exportButton);

    expect(download).toHaveBeenCalledOnce();
    expect(exportButton).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    resolveDownload();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("keeps the dialog open and shows a retryable download error", async () => {
    const download = vi.fn().mockRejectedValue(new Error("Falha no arquivo"));
    const { onClose } = renderDialog({ download });

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Exportar CSV" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha no arquivo",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

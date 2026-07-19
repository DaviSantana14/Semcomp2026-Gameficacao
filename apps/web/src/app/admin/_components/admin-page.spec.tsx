import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AdminPageHeader,
  AdminPanel,
  AdminSectionHeader,
} from "./admin-page";
import { PaginationControls } from "./pagination-controls";

describe("admin page primitives", () => {
  it("renders the editorial page hierarchy and optional action", () => {
    render(
      <AdminPageHeader
        action={<button type="button">Criar registro</button>}
        description="Descrição operacional"
        eyebrow="operação // cadastros"
        title="Participantes"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Participantes" }),
    ).toBeVisible();
    expect(screen.getByText("Descrição operacional")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Criar registro" }),
    ).toBeVisible();
  });

  it("renders labelled content panels and section headings", () => {
    render(
      <AdminPanel aria-labelledby="records-title">
        <AdminSectionHeader
          description="Itens disponíveis para operação"
          eyebrow="resultado"
          id="records-title"
          title="Registros"
        />
      </AdminPanel>,
    );

    expect(screen.getByRole("region", { name: "Registros" })).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Registros" }),
    ).toBeVisible();
  });

  it("labels pagination in Brazilian Portuguese", () => {
    render(
      <PaginationControls onPageChange={() => undefined} page={1} totalPages={2} />,
    );

    expect(screen.getByRole("navigation", { name: "Paginação" })).toBeVisible();
    expect(screen.getByText("Página 1 de 2")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Próxima página" }),
    ).toBeVisible();
  });
});

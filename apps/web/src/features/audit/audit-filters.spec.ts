import { describe, expect, it } from "vitest";
import {
  auditQueryKey,
  parseAuditUrlFilters,
  serializeAuditApiFilters,
  updateAuditUrlFilters,
} from "./audit-filters";

describe("audit filters", () => {
  it("normaliza pagina, limite, datas e valores enumerados da URL", () => {
    const filters = parseAuditUrlFilters(
      new URLSearchParams(
        "page=-2&limit=999&actorType=ADMIN&operation=ACTION_UPDATED&entityType=ACTION&from=2026-07-01&to=invalid",
      ),
    );

    expect(filters).toEqual({
      page: 1,
      limit: 20,
      actorType: "ADMIN",
      operation: "ACTION_UPDATED",
      entityType: "ACTION",
      from: "2026-07-01",
    });
  });

  it("converte o periodo inclusivo para o contrato date-time da API", () => {
    expect(
      serializeAuditApiFilters({
        page: 2,
        limit: 20,
        from: "2026-07-01",
        to: "2026-07-03",
      }),
    ).toEqual({
      page: 2,
      limit: 20,
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-03T23:59:59.999Z",
    });
  });

  it("reseta a pagina ao alterar filtros e remove valores vazios", () => {
    const current = new URLSearchParams(
      "page=4&requestId=req-1&entityId=act-1",
    );
    const next = updateAuditUrlFilters(current, {
      requestId: "  ",
      operation: "ACTION_CREATED",
    });

    expect(next.toString()).toBe("entityId=act-1&operation=ACTION_CREATED");
  });

  it("inclui todos os filtros na chave de consulta", () => {
    const filters = parseAuditUrlFilters(
      new URLSearchParams("page=3&requestId=req-1&participantId=user-1"),
    );
    expect(auditQueryKey(filters)).toEqual(["admin", "audit-events", filters]);
  });
});

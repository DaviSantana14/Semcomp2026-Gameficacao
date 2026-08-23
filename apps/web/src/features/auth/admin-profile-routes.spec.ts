import { describe, expect, it } from "vitest";
import {
  adminAreasForProfile,
  canAccessAdminRoute,
  firstAdminRoute,
} from "./admin-profile-routes";

describe("admin profile routes", () => {
  it.each([
    ["GENERAL", "/admin"],
    ["SHOP", "/admin/lojinha"],
    ["ACTIVITIES", "/admin/atividades"],
  ] as const)("selects the first route for %s", (profile, route) => {
    expect(firstAdminRoute(profile)).toBe(route);
  });

  it("exposes all areas only to general administrators", () => {
    expect(adminAreasForProfile("GENERAL").map((area) => area.href)).toEqual([
      "/admin",
      "/admin/participantes",
      "/admin/atividades",
      "/admin/movimentacoes",
      "/admin/codigos",
      "/admin/lojinha",
      "/admin/auditoria",
      "/admin/operadores",
    ]);
  });

  it("keeps shop and activities routes isolated", () => {
    expect(canAccessAdminRoute("SHOP", "/admin/lojinha/rewards")).toBe(true);
    expect(canAccessAdminRoute("SHOP", "/admin/atividades")).toBe(false);
    expect(canAccessAdminRoute("ACTIVITIES", "/admin/codigos")).toBe(true);
    expect(canAccessAdminRoute("ACTIVITIES", "/admin/participantes")).toBe(
      false,
    );
  });
});

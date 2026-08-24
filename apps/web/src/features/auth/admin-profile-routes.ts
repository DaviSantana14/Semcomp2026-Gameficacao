import type { AdminProfile } from "@/features/users/users.types";

export type AdminArea = {
  href: string;
  label: string;
};

export const ADMIN_AREAS: readonly AdminArea[] = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/participantes", label: "Participantes" },
  { href: "/admin/atividades", label: "Atividades" },
  { href: "/admin/movimentacoes", label: "Movimentações" },
  { href: "/admin/codigos", label: "Códigos" },
  { href: "/admin/lojinha", label: "Lojinha" },
  { href: "/admin/auditoria", label: "Auditoria" },
  { href: "/admin/operadores", label: "Operadores" },
];

const PROFILE_AREA_HREFS: Record<AdminProfile, readonly string[]> = {
  GENERAL: ADMIN_AREAS.map((area) => area.href),
  SHOP: ["/admin/lojinha"],
  ACTIVITIES: ["/admin/atividades", "/admin/codigos"],
};

export function adminAreasForProfile(profile: AdminProfile) {
  const allowed = new Set(PROFILE_AREA_HREFS[profile]);
  return ADMIN_AREAS.filter((area) => allowed.has(area.href));
}

export function firstAdminRoute(profile: AdminProfile) {
  return {
    GENERAL: "/admin",
    SHOP: "/admin/lojinha",
    ACTIVITIES: "/admin/atividades",
  }[profile];
}

export function canAccessAdminRoute(profile: AdminProfile, pathname: string) {
  return PROFILE_AREA_HREFS[profile].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

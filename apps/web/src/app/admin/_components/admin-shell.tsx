"use client";

import {
  ArrowLeftRight,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  ShoppingBag,
  Trophy,
  UserCog,
  UsersRound,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { LogoutButton } from "@/components/logout-button";
import { BrandLogo } from "@/components/semcomp/brand-logo";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-auth";
import {
  adminAreasForProfile,
  canAccessAdminRoute,
  firstAdminRoute,
} from "@/features/auth/admin-profile-routes";
import { ApiError } from "@/lib/http/api-error";
import { cn } from "@/lib/utils";
import { AdminLoading } from "./admin-loading";

function iconForAdminArea(href: string) {
  switch (href) {
    case "/admin":
      return LayoutDashboard;
    case "/admin/participantes":
      return UsersRound;
    case "/admin/atividades":
      return Zap;
    case "/admin/movimentacoes":
      return ArrowLeftRight;
    case "/admin/codigos":
      return KeyRound;
    case "/admin/lojinha":
      return ShoppingBag;
    case "/admin/auditoria":
      return ClipboardList;
    case "/admin/operadores":
      return UserCog;
    default:
      return LayoutDashboard;
  }
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, error, isFetching, isLoading, refetch } = useMe();
  const errorRef = useRef<HTMLDivElement>(null);
  const isUnauthorized = error instanceof ApiError && error.status === 401;
  const adminProfile = user?.role === "ADMIN" ? user.adminProfile : null;
  const profileRouteBlocked = Boolean(
    adminProfile && !canAccessAdminRoute(adminProfile, pathname),
  );

  useEffect(() => {
    if (isUnauthorized) router.replace("/login");
  }, [isUnauthorized, router]);

  useEffect(() => {
    if (user && user.role !== "ADMIN") router.replace("/home");
  }, [router, user]);

  useEffect(() => {
    if (profileRouteBlocked && adminProfile) {
      router.replace(firstAdminRoute(adminProfile));
    }
  }, [adminProfile, profileRouteBlocked, router]);

  useEffect(() => {
    if (error && !isUnauthorized) errorRef.current?.focus();
  }, [error, isUnauthorized]);

  if (error && !isUnauthorized) {
    return (
      <main className="semcomp-atmosphere flex min-h-dvh items-center justify-center p-4 md:p-6">
        <div
          aria-labelledby="admin-session-error-title"
          className="grid w-full max-w-lg gap-5 rounded-[18px] border border-destructive/40 bg-card/95 p-6"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <div className="grid gap-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-destructive">
              Sessão administrativa indisponível
            </p>
            <h1
              className="font-display text-4xl font-semibold uppercase leading-[0.92]"
              id="admin-session-error-title"
            >
              Não foi possível validar seu acesso
            </h1>
            <p className="font-reading text-sm leading-6 text-muted-foreground">
              Verifique sua conexão e tente consultar a sessão novamente. Se o
              problema continuar, acione o suporte do evento.
            </p>
          </div>
          <Button
            aria-label="Tentar validar o acesso administrativo novamente"
            className="w-full sm:w-fit"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "Validando acesso..." : "Tentar novamente"}
          </Button>
        </div>
      </main>
    );
  }

  if (isLoading || !user || user.role !== "ADMIN" || !adminProfile) {
    return (
      <main className="semcomp-atmosphere min-h-dvh p-4 md:p-6">
        <AdminLoading />
      </main>
    );
  }

  return (
    <div className="semcomp-atmosphere min-h-dvh w-full max-w-full overflow-x-hidden lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-border bg-card/95 px-4 py-4 backdrop-blur-xl lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex h-full flex-col gap-5">
          <header className="flex items-center justify-between gap-4 lg:flex-col lg:items-start">
            <BrandLogo className="w-[10.5rem]" priority />
            <p className="rounded-full border border-secondary/35 bg-secondary/10 px-3 py-1.5 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-foreground">
              Administração SEMCOMP
            </p>
          </header>

          <div className="hidden h-px bg-gradient-to-r from-secondary/60 to-transparent lg:block" />

          <nav
            aria-label="Áreas administrativas"
            className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:overflow-visible"
          >
            {adminAreasForProfile(adminProfile).map(({ href, label }) => {
              const Icon = iconForAdminArea(href);
              const active =
                href === "/admin"
                  ? pathname === href
                  : pathname.startsWith(href);

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-3 rounded-[11px] border px-3 py-2 text-sm font-semibold transition-[color,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-secondary/40 bg-secondary/15 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                  )}
                  href={href}
                  key={href}
                >
                  <span
                    aria-hidden="true"
                    className="semcomp-checkpoint text-muted-foreground"
                  />
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-4",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto hidden flex-col gap-4 border-t border-border pt-5 lg:flex">
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-primary">
                Sessão administrativa
              </p>
              <p className="mt-2 truncate text-sm font-bold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center gap-3 rounded-[11px] px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="/ranking"
            >
              <Trophy aria-hidden="true" className="size-4 text-primary" />
              Ranking público
            </Link>
            <LogoutButton className="w-full" />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4 lg:hidden">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                aria-label="Abrir ranking"
                className="inline-flex min-h-11 items-center rounded-[11px] border border-border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href="/ranking"
              >
                <Trophy aria-hidden="true" className="size-4" />
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </aside>
      <section className="min-w-0 p-4 md:p-6 lg:p-8">{children}</section>
    </div>
  );
}

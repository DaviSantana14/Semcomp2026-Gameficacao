"use client";

import { Boxes, KeyRound, LayoutDashboard, ShoppingBag, Trophy, UsersRound, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AdminLoading } from "./admin-loading";

const ADMIN_AREAS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/participantes", label: "Participantes", icon: UsersRound },
  { href: "/admin/atividades", label: "Atividades", icon: Zap },
  { href: "/admin/codigos", label: "Códigos", icon: KeyRound },
  { href: "/admin/lojinha", label: "Lojinha", icon: ShoppingBag },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, error, isFetching, isLoading, refetch } = useMe();
  const errorRef = useRef<HTMLDivElement>(null);
  const isUnauthorized = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (isUnauthorized) router.replace("/login");
  }, [isUnauthorized, router]);

  useEffect(() => {
    if (user && user.role !== "ADMIN") router.replace("/home");
  }, [router, user]);

  useEffect(() => {
    if (error && !isUnauthorized) errorRef.current?.focus();
  }, [error, isUnauthorized]);

  if (error && !isUnauthorized) {
    return (
      <main className="arcade-grid flex min-h-dvh items-center justify-center p-4 md:p-6">
        <div
          aria-labelledby="admin-session-error-title"
          className="grid w-full max-w-lg gap-4 rounded-lg border border-destructive/40 bg-card/95 p-5 shadow-lg"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <div className="grid gap-2">
            <p className="font-mono text-xs uppercase text-destructive">Sessão administrativa indisponível</p>
            <h1 className="text-xl font-black" id="admin-session-error-title">Não foi possível validar seu acesso</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Verifique sua conexão e tente consultar a sessão novamente. Se o problema continuar, acione o suporte do evento.
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

  if (isLoading || !user || user.role !== "ADMIN") {
    return <main className="arcade-grid min-h-dvh p-4 md:p-6"><AdminLoading /></main>;
  }

  return (
    <div className="arcade-grid min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-card/95 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex h-full flex-col gap-5">
          <header className="flex items-center justify-between gap-3 lg:flex-col lg:items-start">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary"><Boxes aria-hidden="true" /></div>
              <div><p className="font-mono text-xs uppercase text-primary">Semcomp OS</p><p className="font-black">Console admin</p></div>
            </div>
            <Badge className="border-success/40 bg-success/10 font-mono text-success">OPERADOR // ONLINE</Badge>
          </header>

          <nav aria-label="Areas administrativas" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {ADMIN_AREAS.map(({ href, icon: Icon, label }) => {
              const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
              return <Link aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground")} href={href} key={href}><Icon aria-hidden="true" className="size-4" />{label}</Link>;
            })}
          </nav>

          <div className="mt-auto hidden flex-col gap-3 border-t border-border pt-4 lg:flex">
            <div className="min-w-0"><p className="truncate text-sm font-bold">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/ranking"><Trophy aria-hidden="true" className="size-4" />Ranking</Link>
            <LogoutButton className="w-full" />
          </div>

          <div className="flex items-center justify-between gap-3 lg:hidden">
            <div className="min-w-0"><p className="truncate text-sm font-bold">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
            <div className="flex shrink-0 gap-2"><Link aria-label="Abrir ranking" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/ranking"><Trophy aria-hidden="true" className="size-4" /></Link><LogoutButton /></div>
          </div>
        </div>
      </aside>
      <section className="min-w-0 p-4 md:p-6 lg:p-8">{children}</section>
    </div>
  );
}

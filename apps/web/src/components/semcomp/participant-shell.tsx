"use client";

import { Home, Medal, ShoppingBag } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/features/users/users.types";
import { cn } from "@/lib/utils";
import { LogoutButton } from "../logout-button";
import { BrandLogo } from "./brand-logo";

export type ParticipantHref = "/home" | "/ranking" | "/lojinha";

type ParticipantShellProps = {
  activeHref: ParticipantHref;
  children: ReactNode;
  user: User;
};

const navigation = [
  { href: "/home", icon: Home, label: "Início" },
  { href: "/ranking", icon: Medal, label: "Ranking" },
  { href: "/lojinha", icon: ShoppingBag, label: "Lojinha" },
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ParticipantShell({
  activeHref,
  children,
  user,
}: ParticipantShellProps) {
  return (
    <div className="semcomp-atmosphere min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border-b border-border/70 bg-background/70 px-5 py-5 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0 lg:px-6 lg:py-7">
        <div className="flex items-center justify-between gap-5 lg:block">
          <BrandLogo className="w-36" priority />
          <span className="rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-secondary lg:mt-6 lg:inline-flex">
            participante
          </span>
        </div>

        <nav aria-label="Navegação principal" className="mt-5 lg:mt-10">
          <ul className="grid grid-cols-3 gap-2 lg:flex lg:flex-col">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isCurrent = item.href === activeHref;

              return (
                <li key={item.href}>
                  <Link
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 rounded-[11px] px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:justify-start lg:gap-3 lg:px-3.5",
                      isCurrent && "bg-secondary/10 text-foreground",
                    )}
                    href={item.href}
                  >
                    <span className="semcomp-checkpoint" />
                    <Icon aria-hidden="true" className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-4 flex justify-end lg:hidden">
          <LogoutButton />
        </div>

        <div className="mt-6 hidden border-t border-border/70 pt-6 lg:mt-auto lg:block">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-secondary/35 bg-secondary/10 font-mono text-xs font-bold text-secondary">
              {getInitials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
          <LogoutButton className="w-full" />
        </div>
      </aside>

      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-10 lg:py-10 xl:px-14">
        {children}
      </main>
    </div>
  );
}

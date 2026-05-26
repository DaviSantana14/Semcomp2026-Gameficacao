"use client";

import {
  Coins,
  Medal,
  ScanLine,
  Shield,
  ShoppingBag,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";
import { Progress } from "@/components/ui/progress";
import { useMe } from "@/hooks/use-auth";
import { ApiError, fetchCsrfToken } from "@/lib/api";
import { RedeemCodeDialog } from "./redeem-code-dialog";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getLevelProgress(xp: number) {
  return Math.max(0, Math.min(100, xp % 100));
}

export function HomeClient() {
  const router = useRouter();
  const { data: user, error, isLoading } = useMe();
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/login");
    }
  }, [error, router]);

  useEffect(() => {
    if (user) {
      void fetchCsrfToken().catch(() => undefined);
    }
  }, [user]);

  if (isLoading) {
    return (
      <main className="arcade-grid min-h-dvh px-4 py-6 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="h-32 rounded-lg border border-border bg-card" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-36 rounded-lg border border-border bg-card" />
            <div className="h-36 rounded-lg border border-border bg-card" />
            <div className="h-36 rounded-lg border border-border bg-card" />
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  const progress = getLevelProgress(user.xp);

  return (
    <main className="arcade-grid min-h-dvh px-4 py-6 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="scanline relative overflow-hidden rounded-lg border border-primary/30 bg-card/85 p-5 shadow-[0_0_80px_color-mix(in_srgb,var(--primary)_14%,transparent)] md:p-6">
          <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-primary/40 bg-primary/10 text-primary">
                  Semcomp Game
                </Badge>
                <Badge className="border-accent/40 bg-accent/10 text-accent">
                  {user.role === "ADMIN" ? "Admin" : "Participante"}
                </Badge>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 font-mono text-xl font-black text-primary">
                  {getInitials(user.name)}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-mono text-sm font-semibold uppercase text-muted-foreground">
                    player online
                  </p>
                  <h1 className="truncate text-3xl font-black tracking-normal text-foreground md:text-5xl">
                    {user.name}
                  </h1>
                  <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <LogoutButton className="w-full sm:w-auto" />
              <Button className="w-full sm:w-auto" onClick={() => setIsRedeemOpen(true)}>
                <ScanLine aria-hidden="true" data-icon="inline-start" />
                Resgatar codigo
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-accent/30 bg-card/85">
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex flex-col gap-1.5">
                <CardDescription>Moeda da loja</CardDescription>
                <CardTitle className="font-mono text-3xl">{user.points} PTS</CardTitle>
              </div>
              <Coins className="text-accent" aria-hidden="true" />
            </CardHeader>
          </Card>

          <Card className="border-primary/30 bg-card/85">
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex flex-col gap-1.5">
                <CardDescription>Ranking competitivo</CardDescription>
                <CardTitle className="font-mono text-3xl">{user.xp} XP</CardTitle>
              </div>
              <Trophy className="text-primary" aria-hidden="true" />
            </CardHeader>
          </Card>

          <Card className="border-success/30 bg-card/85">
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex flex-col gap-1.5">
                <CardDescription>Nivel atual</CardDescription>
                <CardTitle className="font-mono text-3xl">LVL {user.level}</CardTitle>
              </div>
              <Sparkles className="text-success" aria-hidden="true" />
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <Card className="bg-card/85">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="text-primary" aria-hidden="true" />
                Barra de XP
              </CardTitle>
              <CardDescription>{progress}% do nivel atual</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Progress value={progress} />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{user.xp} XP total</span>
                <span>Nivel {user.level + 1}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/85">
            <CardHeader>
              <CardTitle>Proximas arenas</CardTitle>
              <CardDescription>Fluxos principais do evento</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button className="justify-start" disabled variant="secondary">
                <Medal aria-hidden="true" data-icon="inline-start" />
                Ranking
              </Button>
              <Button className="justify-start" disabled variant="secondary">
                <ShoppingBag aria-hidden="true" data-icon="inline-start" />
                Lojinha
              </Button>
              {user.role === "ADMIN" ? (
                <Button
                  className="justify-start"
                  onClick={() => router.push("/admin")}
                  variant="secondary"
                >
                  <Shield aria-hidden="true" data-icon="inline-start" />
                  Admin
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
      <RedeemCodeDialog
        isOpen={isRedeemOpen}
        onClose={() => setIsRedeemOpen(false)}
      />
    </main>
  );
}

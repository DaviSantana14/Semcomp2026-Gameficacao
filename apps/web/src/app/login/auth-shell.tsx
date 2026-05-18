import { CircuitBoard, Crown, RadioTower, Trophy } from "lucide-react";
import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

type AuthShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

export function AuthShell({ children, description, eyebrow, title }: AuthShellProps) {
  return (
    <main className="arcade-grid flex min-h-dvh items-center justify-center px-4 py-8">
      <section className="grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.05fr_440px]">
        <div className="scanline flex min-h-[520px] flex-col justify-between rounded-lg border border-border bg-card/70 p-5 shadow-[0_0_80px_color-mix(in_srgb,var(--primary)_12%,transparent)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border-primary/40 bg-primary/10 text-primary">
                Semcomp Game
              </Badge>
              <Badge className="border-accent/40 bg-accent/10 text-accent">
                Live Score
              </Badge>
            </div>

            <div className="flex max-w-2xl flex-col gap-4">
              <p className="font-mono text-sm font-semibold uppercase text-primary">
                {eyebrow}
              </p>
              <h1 className="text-4xl font-black leading-[0.95] tracking-normal text-foreground md:text-6xl">
                {title}
              </h1>
              <p className="max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
                {description}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/65 p-4">
              <Trophy className="mb-4 text-primary" aria-hidden="true" />
              <p className="font-mono text-2xl font-black">XP</p>
              <p className="text-sm text-muted-foreground">ranking por progresso</p>
            </div>
            <div className="rounded-lg border border-border bg-background/65 p-4">
              <Crown className="mb-4 text-accent" aria-hidden="true" />
              <p className="font-mono text-2xl font-black">PTS</p>
              <p className="text-sm text-muted-foreground">moeda para loja</p>
            </div>
            <div className="rounded-lg border border-border bg-background/65 p-4">
              <RadioTower className="mb-4 text-success" aria-hidden="true" />
              <p className="font-mono text-2xl font-black">CODE</p>
              <p className="text-sm text-muted-foreground">resgate no evento</p>
            </div>
          </div>

          <CircuitBoard
            className="absolute right-5 top-5 text-primary/20"
            aria-hidden="true"
            size={84}
          />
        </div>

        {children}
      </section>
    </main>
  );
}

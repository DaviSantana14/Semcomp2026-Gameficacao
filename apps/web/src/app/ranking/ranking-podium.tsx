import type { RankingEntry } from "@/features/ranking/ranking.types";
import { cn } from "@/lib/utils";
import { getPositionLabel } from "./ranking-row";

const numberFormatter = new Intl.NumberFormat("pt-BR");

const placementByPosition: Record<number, string> = {
  1: "col-span-2 border-secondary/50 bg-secondary/10 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:min-h-64 lg:-translate-y-5",
  2: "col-start-1 border-primary/30 bg-primary/5 lg:col-start-1 lg:row-start-1",
  3: "col-start-2 border-border/90 bg-card/80 lg:col-start-3 lg:row-start-1",
};

export function RankingPodium({ entries }: { entries: RankingEntry[] }) {
  return (
    <div
      className="grid grid-cols-2 items-end gap-3 lg:grid-cols-3 lg:pt-5"
      data-testid="ranking-podium"
    >
      {entries.slice(0, 3).map((entry) => (
        <article
          className={cn(
            "relative flex min-h-48 flex-col justify-between overflow-hidden rounded-[20px] border p-5",
            placementByPosition[entry.position] ?? placementByPosition[3],
          )}
          key={`${entry.position}-${entry.name}`}
        >
          <div
            aria-hidden="true"
            className="absolute -right-12 -top-12 size-36 rounded-full border border-secondary/20"
          />
          <p className="relative font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            posição
          </p>
          <div className="relative mt-8">
            <p
              className={cn(
                "font-display text-5xl font-bold leading-none text-foreground",
                entry.position === 1 && "text-6xl text-secondary",
              )}
            >
              {getPositionLabel(entry.position)}
            </p>
            <p className="mt-4 truncate text-base font-bold text-foreground">
              {entry.name}
            </p>
            <p className="mt-1 font-mono text-sm font-bold text-muted-foreground">
              {numberFormatter.format(entry.xp)} XP
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

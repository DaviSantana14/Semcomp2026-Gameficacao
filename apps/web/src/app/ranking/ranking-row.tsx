import type { RankingEntry } from "@/features/ranking/ranking.types";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function getPositionLabel(position: number) {
  return `#${position.toString().padStart(2, "0")}`;
}

export function RankingRow({
  emphasis = false,
  entry,
}: {
  emphasis?: boolean;
  entry: RankingEntry;
}) {
  return (
    <article
      className={cn(
        "grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/75 py-4 last:border-b-0",
        emphasis &&
          "rounded-[16px] border border-secondary/35 bg-secondary/8 px-4 last:border-b",
      )}
    >
      <p className="font-mono text-sm font-bold text-secondary">
        {getPositionLabel(entry.position)}
      </p>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground sm:text-base">
          {entry.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">participante</p>
      </div>
      <p className="whitespace-nowrap font-mono text-sm font-bold text-foreground sm:text-base">
        {numberFormatter.format(entry.xp)} XP
      </p>
    </article>
  );
}

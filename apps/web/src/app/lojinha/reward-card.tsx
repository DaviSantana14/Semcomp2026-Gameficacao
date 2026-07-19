import { Coins, ImageIcon, PackageOpen, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Reward } from "@/features/rewards/rewards.types";

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function getRedeemDisabledReason(reward: Reward, points: number) {
  if (reward.stock <= 0) return "Esgotado";
  if (points < reward.costInPoints) return "Saldo insuficiente";
  return null;
}

export function RewardCard({
  onRedeem,
  points,
  redeeming,
  reward,
}: {
  onRedeem: (reward: Reward) => void;
  points: number;
  redeeming: boolean;
  reward: Reward;
}) {
  const disabledReason = getRedeemDisabledReason(reward, points);
  const stateLabel = disabledReason ?? "Disponível";
  const buttonLabel = redeeming
    ? "Resgatando..."
    : (disabledReason ?? "Resgatar");

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/80 bg-card/75 backdrop-blur">
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden border-b border-border/75 bg-[radial-gradient(circle_at_50%_30%,color-mix(in_srgb,var(--secondary)_18%,transparent),transparent_62%)]">
        {reward.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-full object-cover"
            src={reward.imageUrl}
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-[18px] border border-secondary/25 bg-background/55 text-secondary">
            <ImageIcon aria-hidden="true" className="size-8" />
          </div>
        )}
        <span className="absolute right-4 top-4 rounded-full border border-border/80 bg-background/80 px-3 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground backdrop-blur">
          {stateLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h2 className="text-xl font-bold text-foreground">{reward.name}</h2>
        <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
          {reward.description ?? "Recompensa oficial da SEMCOMP."}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 border-y border-border/75 py-4">
          <div>
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <Coins aria-hidden="true" className="size-3.5" />
              Custo
            </dt>
            <dd className="mt-1 font-mono text-base font-bold text-foreground">
              {numberFormatter.format(reward.costInPoints)} PTS
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <PackageOpen aria-hidden="true" className="size-3.5" />
              Estoque
            </dt>
            <dd className="mt-1 font-mono text-base font-bold text-foreground">
              {numberFormatter.format(reward.stock)}
            </dd>
          </div>
        </dl>

        <Button
          className="mt-5 w-full"
          disabled={Boolean(disabledReason) || redeeming}
          onClick={() => onRedeem(reward)}
          variant={
            disabledReason === "Saldo insuficiente"
              ? "secondary"
              : disabledReason === "Esgotado"
                ? "outline"
                : "primary"
          }
        >
          <ShoppingBag aria-hidden="true" data-icon="inline-start" />
          {buttonLabel}
        </Button>
      </div>
    </article>
  );
}

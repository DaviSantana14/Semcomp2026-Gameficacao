"use client";

import { AlertTriangle, ShoppingBag, X } from "lucide-react";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Reward } from "@/features/rewards/rewards.types";

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function RewardRedemptionDialog({
  error,
  onClose,
  onConfirm,
  open,
  pending,
  points,
  reward,
}: {
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
  points: number;
  reward: Reward;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const remainingPoints = points - reward.costInPoints;

  return (
    <Dialog
      initialFocusRef={cancelRef}
      onClose={onClose}
      open={open}
      preventClose={pending}
      titleId={titleId}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-secondary">
            checkpoint de troca
          </p>
          <h2 className="mt-2 text-2xl font-bold" id={titleId}>
            Confirmar resgate
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Confira o impacto no seu saldo antes de continuar.
          </p>
        </div>
        <Button
          aria-label="Fechar"
          className="size-11 shrink-0 p-0"
          disabled={pending}
          onClick={onClose}
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-6 rounded-[16px] border border-border/80 bg-background/45 p-4">
        <p className="text-xs text-muted-foreground">Recompensa</p>
        <p className="mt-1 text-lg font-bold text-foreground">{reward.name}</p>
      </div>

      <dl className="mt-4 grid gap-px overflow-hidden rounded-[16px] border border-border/80 bg-border/80 sm:grid-cols-3">
        <div className="bg-card p-4">
          <dt className="text-xs text-muted-foreground">Custo</dt>
          <dd className="mt-1 font-mono text-base font-bold">
            {numberFormatter.format(reward.costInPoints)} PTS
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="text-xs text-muted-foreground">Saldo atual</dt>
          <dd className="mt-1 font-mono text-base font-bold">
            {numberFormatter.format(points)} PTS
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="text-xs text-muted-foreground">
            Saldo após o resgate
          </dt>
          <dd className="mt-1 font-mono text-base font-bold text-primary">
            {numberFormatter.format(remainingPoints)} PTS
          </dd>
        </div>
      </dl>

      {error ? (
        <div
          className="mt-4 flex gap-2 rounded-[13px] border border-destructive/35 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          disabled={pending}
          onClick={onClose}
          ref={cancelRef}
          variant="outline"
        >
          Cancelar
        </Button>
        <Button disabled={pending} onClick={onConfirm}>
          <ShoppingBag aria-hidden="true" data-icon="inline-start" />
          {pending
            ? "Resgatando..."
            : `Resgatar por ${numberFormatter.format(reward.costInPoints)} PTS`}
        </Button>
      </div>
    </Dialog>
  );
}

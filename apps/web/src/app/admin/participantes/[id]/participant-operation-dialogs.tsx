"use client";

import { AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateAdjustment } from "@/features/participants/participant-operations";
import { ApiError } from "@/lib/http/api-error";

const number = new Intl.NumberFormat("pt-BR", { signDisplay: "always" });

export function AdjustmentDialog({
  balance,
  initialDeltas,
  onClose,
  onSubmit,
  open,
}: {
  balance: { points: number; xp: number };
  initialDeltas: { pointsDelta: number; xpDelta: number };
  onClose: () => void;
  onSubmit: (value: {
    pointsDelta: number;
    xpDelta: number;
    reason: string;
  }) => Promise<unknown>;
  open: boolean;
}) {
  const [pointsDelta, setPointsDelta] = useState(
    String(initialDeltas.pointsDelta),
  );
  const [xpDelta, setXpDelta] = useState(String(initialDeltas.xpDelta));
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);
  const validation = validateAdjustment(
    { pointsDelta, xpDelta, reason },
    balance,
  );
  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validation.valid || !reviewed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(validation.values);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught : new Error("Falha inesperada"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal onClose={onClose} pending={pending} title="Ajustar pontos e XP">
      <form className="grid gap-5" onSubmit={submit}>
        <p className="text-sm text-muted-foreground">
          Registre uma correção motivada. O nível atual não será recalculado.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delta de pontos">
            <Input
              aria-invalid={Boolean(validation.errors.pointsDelta)}
              data-initial-focus
              id="adjustment-points"
              inputMode="numeric"
              onChange={(event) => setPointsDelta(event.target.value)}
              value={pointsDelta}
            />
          </Field>
          <Field label="Delta de XP">
            <Input
              aria-invalid={Boolean(validation.errors.xpDelta)}
              id="adjustment-xp"
              inputMode="numeric"
              onChange={(event) => setXpDelta(event.target.value)}
              value={xpDelta}
            />
          </Field>
        </div>
        <Reason value={reason} onChange={setReason} />
        <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-4">
          <Balance
            label="Pontos previstos"
            value={validation.predicted.points}
          />
          <Balance label="XP previsto" value={validation.predicted.xp} />
        </div>
        {Object.values(validation.errors).length ? (
          <p className="text-sm text-destructive" role="alert">
            {Object.values(validation.errors)[0]}
          </p>
        ) : null}
        <Review
          checked={reviewed}
          label="Revisei os saldos previstos"
          onChange={setReviewed}
        />
        <OperationError error={error} />
        <DialogActions
          confirm="Confirmar ajuste"
          disabled={!validation.valid || !reviewed || pending}
          onClose={onClose}
          pending={pending}
        />
      </form>
    </Modal>
  );
}

export function ReversalDialog({
  balance,
  event,
  onClose,
  onSubmit,
}: {
  balance: { points: number; xp: number };
  event: { pointsDelta: number; xpDelta: number };
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  return (
    <ReasonDialog
      confirm="Confirmar estorno"
      description="O histórico original será preservado e um evento compensatório será criado."
      onClose={onClose}
      onSubmit={onSubmit}
      reviewLabel="Revisei o evento original e os saldos do estorno"
      title="Estornar ajuste"
    >
      <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-2">
        <BalancePair
          label="Evento original"
          points={event.pointsDelta}
          xp={event.xpDelta}
          signed
        />
        <BalancePair
          label="Delta do estorno"
          points={-event.pointsDelta}
          xp={-event.xpDelta}
          signed
        />
        <BalancePair
          label="Saldo atual"
          points={balance.points}
          xp={balance.xp}
        />
        <BalancePair
          label="Saldo após estorno"
          points={balance.points - event.pointsDelta}
          xp={balance.xp - event.xpDelta}
        />
      </div>
    </ReasonDialog>
  );
}

export function ReconciliationConfirmationDialog({
  deltas,
  onClose,
  onSubmit,
}: {
  deltas: { points: number; xp: number };
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  return (
    <ReasonDialog
      confirm="Confirmar no histórico"
      description="Esta ação alinha somente o livro-razão. O saldo armazenado não será alterado."
      onClose={onClose}
      onSubmit={onSubmit}
      reviewLabel="Revisei a divergência e o lançamento no histórico"
      title="Confirmar compensação"
    >
      <div className="grid grid-cols-2 gap-3 rounded-md border border-warning/40 bg-warning/5 p-4">
        <Balance label="Delta no histórico" value={deltas.points} signed />
        <Balance label="Delta de XP no histórico" value={deltas.xp} signed />
      </div>
    </ReasonDialog>
  );
}

function ReasonDialog({
  children,
  confirm,
  description,
  onClose,
  onSubmit,
  reviewLabel,
  title,
}: {
  children: React.ReactNode;
  confirm: string;
  description: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  reviewLabel: string;
  title: string;
}) {
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const valid = reason.trim().length >= 10 && reason.trim().length <= 500;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !reviewed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught : new Error("Falha inesperada"),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal onClose={onClose} pending={pending} title={title}>
      <form className="grid gap-5" onSubmit={submit}>
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
        <Reason initialFocus value={reason} onChange={setReason} />
        <Review checked={reviewed} label={reviewLabel} onChange={setReviewed} />
        <OperationError error={error} />
        <DialogActions
          confirm={confirm}
          disabled={!valid || !reviewed || pending}
          onClose={onClose}
          pending={pending}
        />
      </form>
    </Modal>
  );
}

function Modal({
  children,
  onClose,
  pending,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  pending: boolean;
  title: string;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const initial = dialog?.querySelector<HTMLElement>("[data-initial-focus]");
    initial?.focus();
    const siblings = Array.from(document.body.children).filter(
      (element) => element !== rootRef.current,
    ) as HTMLElement[];
    const previous = siblings.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.inert,
    }));
    siblings.forEach((element) => {
      element.setAttribute("aria-hidden", "true");
      element.inert = true;
    });
    return () => {
      previous.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
        element.inert = inert;
      });
      previousFocus.current?.focus();
    };
  }, []);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pending) onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose, pending]);
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (!pending && event.currentTarget === event.target) onClose();
      }}
      ref={rootRef}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="my-auto w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-2xl"
        role="dialog"
        ref={dialogRef}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-xl font-black" id={titleId}>
            {title}
          </h2>
          <Button
            aria-label="Fechar"
            className="size-11 p-0"
            disabled={pending}
            onClick={() => !pending && onClose()}
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const id =
    label === "Delta de pontos" ? "adjustment-points" : "adjustment-xp";
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
function Reason({
  initialFocus = false,
  value,
  onChange,
}: {
  initialFocus?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="operation-reason">Motivo</Label>
      <textarea
        className="min-h-24 rounded-md border border-input bg-muted/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id="operation-reason"
        {...(initialFocus ? { "data-initial-focus": true } : {})}
        maxLength={500}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}
function Review({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        checked={checked}
        className="mt-1 size-4"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}
function Balance({
  label,
  signed = false,
  value,
}: {
  label: string;
  signed?: boolean;
  value: number;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-black tabular-nums">
        {signed ? number.format(value) : value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
function OperationError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <div
      className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {error instanceof ApiError && error.status === 409
        ? "Conflito: inicie uma nova tentativa para não duplicar a operação anterior."
        : error.message}
    </div>
  );
}
function DialogActions({
  confirm,
  disabled,
  onClose,
  pending,
}: {
  confirm: string;
  disabled: boolean;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        disabled={pending}
        onClick={onClose}
        type="button"
        variant="outline"
      >
        Cancelar
      </Button>
      <Button disabled={disabled} type="submit">
        {pending ? "Registrando..." : confirm}
      </Button>
    </div>
  );
}

function BalancePair({
  label,
  points,
  signed = false,
  xp,
}: {
  label: string;
  points: number;
  signed?: boolean;
  xp: number;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Balance label="Pontos" signed={signed} value={points} />
        <Balance label="XP" signed={signed} value={xp} />
      </div>
    </div>
  );
}

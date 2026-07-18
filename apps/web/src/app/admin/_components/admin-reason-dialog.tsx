"use client";

import { AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const ADMIN_REASON_MIN_LENGTH = 10;
export const ADMIN_REASON_MAX_LENGTH = 500;

export function normalizeAdminReason(value: string) {
  return value.trim();
}

export function isValidAdminReason(value: string) {
  const length = normalizeAdminReason(value).length;
  return length >= ADMIN_REASON_MIN_LENGTH && length <= ADMIN_REASON_MAX_LENGTH;
}

export function AdminReasonDialog({
  confirmLabel,
  currentState,
  description,
  intendedState,
  onClose,
  onSubmit,
  operationKey,
  title,
}: {
  confirmLabel: string;
  currentState: string;
  description: string;
  intendedState: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  operationKey: string;
  title: string;
}) {
  return (
    <AdminReasonDialogForm
      key={operationKey}
      confirmLabel={confirmLabel}
      currentState={currentState}
      description={description}
      intendedState={intendedState}
      onClose={onClose}
      onSubmit={onSubmit}
      title={title}
    />
  );
}

function AdminReasonDialogForm({
  confirmLabel,
  currentState,
  description,
  intendedState,
  onClose,
  onSubmit,
  title,
}: Omit<Parameters<typeof AdminReasonDialog>[0], "operationKey">) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const valid = isValidAdminReason(reason);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("textarea")?.focus();
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
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(normalizeAdminReason(reason));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught : new Error("Falha inesperada"),
      );
    } finally {
      setPending(false);
    }
  }

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
        className="my-auto w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-2xl"
        ref={dialogRef}
        role="dialog"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black" id={titleId}>
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <Button
            aria-label="Fechar"
            className="size-11 p-0"
            disabled={pending}
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        <form className="grid gap-5" onSubmit={submit}>
          <dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-4">
            <div>
              <dt className="text-xs text-muted-foreground">Estado atual</dt>
              <dd className="mt-1 font-semibold">{currentState}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Estado pretendido
              </dt>
              <dd className="mt-1 font-semibold">{intendedState}</dd>
            </div>
          </dl>
          <div className="grid gap-2">
            <Label htmlFor="admin-operation-reason">Motivo</Label>
            <textarea
              aria-describedby="admin-operation-reason-help"
              className="min-h-24 rounded-md border border-input bg-muted/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="admin-operation-reason"
              maxLength={ADMIN_REASON_MAX_LENGTH}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
            <p
              className="text-xs text-muted-foreground"
              id="admin-operation-reason-help"
            >
              {`Informe de ${ADMIN_REASON_MIN_LENGTH} a ${ADMIN_REASON_MAX_LENGTH} caracteres.`}
            </p>
          </div>
          {error ? (
            <div
              className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              <AlertTriangle className="size-4 shrink-0" />
              {error.message}
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={pending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={!valid || pending} type="submit">
              {pending ? "Registrando..." : confirmLabel}
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

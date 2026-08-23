"use client";

import { AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { bulkUpdateClaimCodes } from "@/features/actions/actions.service";
import type { ClaimCodeBulkOperationDetail } from "@/features/actions/actions.types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  isValidAdminReason,
  normalizeAdminReason,
} from "../_components/admin-reason-dialog";

export const MAX_CLAIM_CODE_BULK_SELECTION = 500;

type ClaimCodeBulkIntent = "activate" | "deactivate";

export function ClaimCodeBulkDialog({
  intent,
  onClose,
  onSuccess,
  selectedIds,
}: {
  intent: ClaimCodeBulkIntent;
  onClose: () => void;
  onSuccess: (operation: ClaimCodeBulkOperationDetail) => void;
  selectedIds: ReadonlySet<string>;
}) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const ids = Array.from(selectedIds);
  const isActive = intent === "activate";
  const confirmationWord = isActive ? "ATIVAR" : "DESATIVAR";
  const actionName = isActive ? "ativação" : "desativação";
  const valid =
    ids.length > 0 &&
    ids.length <= MAX_CLAIM_CODE_BULK_SELECTION &&
    isValidAdminReason(reason) &&
    confirmation === confirmationWord;

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("textarea, input")?.focus();

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
          "button:not([disabled]), textarea:not([disabled]), input:not([disabled])",
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
      const operation = await bulkUpdateClaimCodes({
        ids,
        isActive,
        reason: normalizeAdminReason(reason),
        confirmation: confirmationWord,
      });
      onSuccess(operation);
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
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-secondary">
              operação administrativa
            </p>
            <h2 className="mt-1 text-xl font-black" id={titleId}>
              {isActive
                ? "Ativar códigos selecionados"
                : "Desativar códigos selecionados"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ids.length}{" "}
              {ids.length === 1 ? "código selecionado" : "códigos selecionados"}
              . Somente estes IDs serão enviados.
            </p>
          </div>
          <Button
            aria-label="Fechar"
            className="size-11 p-0"
            disabled={pending}
            onClick={onClose}
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        <form className="grid gap-5" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="claim-code-bulk-reason">Motivo</Label>
            <textarea
              aria-describedby="claim-code-bulk-reason-help"
              className="min-h-24 rounded-md border border-input bg-muted/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={pending}
              id="claim-code-bulk-reason"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
            <p
              className="text-xs text-muted-foreground"
              id="claim-code-bulk-reason-help"
            >
              Informe de 10 a 500 caracteres.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="claim-code-bulk-confirmation">Confirmação</Label>
            <input
              aria-label="Confirmação"
              autoComplete="off"
              className="min-h-11 rounded-md border border-input bg-muted/70 px-3 py-2 font-mono text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={pending}
              id="claim-code-bulk-confirmation"
              onChange={(event) =>
                setConfirmation(event.target.value.toUpperCase())
              }
              placeholder={confirmationWord}
              spellCheck={false}
              value={confirmation}
            />
            <p className="text-xs text-muted-foreground">
              Digite {confirmationWord} para confirmar a {actionName}.
            </p>
          </div>
          {ids.length > MAX_CLAIM_CODE_BULK_SELECTION ? (
            <p className="text-sm text-destructive" role="alert">
              Selecione no máximo {MAX_CLAIM_CODE_BULK_SELECTION} códigos.
            </p>
          ) : null}
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
              {pending ? "Registrando..." : `Confirmar ${actionName}`}
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

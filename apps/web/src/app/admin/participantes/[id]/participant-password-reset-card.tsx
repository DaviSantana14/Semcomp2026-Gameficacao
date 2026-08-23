"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-auth";
import { resetParticipantPassword } from "@/features/participants/participants.service";
import type {
  AdminParticipantDetail,
  ParticipantPasswordResetResult,
} from "@/features/participants/participants.types";
import { AdminPanel } from "../../_components/admin-page";

const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 500;

export function ParticipantPasswordResetCard({
  participant,
}: {
  participant: AdminParticipantDetail;
}) {
  const { data: user } = useMe();
  const queryClient = useQueryClient();
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [replacePending, setReplacePending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<ParticipantPasswordResetResult | null>(
    null,
  );

  if (user?.role !== "ADMIN" || user.adminProfile !== "GENERAL") return null;

  const normalizedReason = reason.trim();
  const validReason =
    normalizedReason.length >= REASON_MIN_LENGTH &&
    normalizedReason.length <= REASON_MAX_LENGTH;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validReason || pending) return;

    setPending(true);
    setError(null);
    try {
      const resetResult = await resetParticipantPassword(participant.id, {
        reason: normalizedReason,
        replacePending,
      });
      setResult(resetResult);
      void queryClient.invalidateQueries({
        queryKey: ["admin", "participants"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "participant", participant.id],
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught
          : new Error("Não foi possível redefinir a senha."),
      );
    } finally {
      setPending(false);
    }
  }

  function closeResult() {
    setResult(null);
    setReason("");
    setReplacePending(false);
    setError(null);
  }

  return (
    <>
      <AdminPanel
        aria-labelledby={titleId}
        className="grid gap-5 p-5 md:p-6"
        role="region"
      >
        <div>
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-secondary">
            segurança // credencial do participante
          </p>
          <h2 className="mt-2 text-xl font-bold" id={titleId}>
            Reset de senha
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Gere uma senha temporária para o participante definir uma nova
            credencial. A senha será exibida uma única vez.
          </p>
        </div>

        {participant.passwordResetRequired ? (
          <label className="flex items-start gap-3 rounded-md border border-secondary/30 bg-secondary/10 p-3 text-sm">
            <input
              aria-label="Substituir reset pendente"
              checked={replacePending}
              className="mt-1 size-4 accent-primary"
              disabled={pending}
              onChange={(event) => setReplacePending(event.target.checked)}
              type="checkbox"
            />
            <span>
              Já existe uma troca obrigatória pendente. Substituir a senha
              temporária anterior e revogar a sessão atual.
            </span>
          </label>
        ) : null}

        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="participant-password-reset-reason">
              Motivo do reset
            </Label>
            <textarea
              aria-describedby="participant-password-reset-reason-help"
              className="min-h-24 w-full rounded-[11px] border border-input bg-muted/70 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending}
              id="participant-password-reset-reason"
              maxLength={REASON_MAX_LENGTH}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
            <p
              className="text-xs text-muted-foreground"
              id="participant-password-reset-reason-help"
            >
              Informe de {REASON_MIN_LENGTH} a {REASON_MAX_LENGTH} caracteres.
            </p>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error.message}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button disabled={!validReason || pending} type="submit">
              <KeyRound aria-hidden="true" />
              {pending ? "Gerando..." : "Gerar senha temporária"}
            </Button>
          </div>
        </form>
      </AdminPanel>

      {result ? (
        <ParticipantPasswordResetResultDialog
          onClose={closeResult}
          result={result}
        />
      ) : null}
    </>
  );
}

function ParticipantPasswordResetResultDialog({
  onClose,
  result,
}: {
  onClose: () => void;
  result: ParticipantPasswordResetResult | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    if (!result || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      onClose={onClose}
      open={result !== null}
      titleId="participant-password-reset-result-title"
    >
      {result ? (
        <div className="grid gap-5">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-success">
              segurança // senha temporária
            </p>
            <h2
              className="mt-2 text-2xl font-bold"
              id="participant-password-reset-result-title"
            >
              Entregue esta senha ao participante
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ela não será exibida novamente depois que esta janela for
              fechada.
            </p>
          </div>
          <div className="rounded-[14px] border border-secondary/35 bg-secondary/10 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Senha temporária
            </p>
            <code
              className="mt-3 block break-all font-mono text-xl font-bold text-foreground"
              data-testid="participant-temporary-password"
            >
              {result.temporaryPassword}
            </code>
            <Button
              className="mt-4"
              onClick={() => void copyPassword()}
              type="button"
              variant="outline"
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Senha copiada" : "Copiar senha"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Expira em {new Date(result.expiresAt).toLocaleString("pt-BR")}.
          </p>
          <div className="flex justify-end border-t border-border/80 pt-4">
            <Button onClick={onClose} type="button">
              Fechar
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { OperatorActivationResult } from "@/features/operators/operators.types";

export function OperatorActivationResultDialog({
  onClose,
  result,
}: {
  onClose: () => void;
  result: OperatorActivationResult | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!result || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(result.activationCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      onClose={onClose}
      open={result !== null}
      titleId="operator-activation-result-title"
    >
      {result ? (
        <div className="grid gap-5">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-success">
              ativação // código gerado
            </p>
            <h2 className="mt-2 text-2xl font-bold" id="operator-activation-result-title">
              Entregue este código a {result.operator.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ele não será exibido novamente depois que esta janela for fechada.
            </p>
          </div>
          <div className="rounded-[14px] border border-secondary/35 bg-secondary/10 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Código de ativação
            </p>
            <code
              className="mt-3 block break-all font-mono text-xl font-bold tracking-[0.12em] text-foreground"
              data-testid="operator-activation-code"
            >
              {result.activationCode}
            </code>
            <Button className="mt-4" onClick={() => void copyCode()} type="button" variant="outline">
              {copied ? <Check /> : <Copy />}
              {copied ? "Código copiado" : "Copiar código"}
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

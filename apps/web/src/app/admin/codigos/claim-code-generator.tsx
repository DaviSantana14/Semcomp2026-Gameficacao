"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, LoaderCircle, TicketCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchAdminActions,
  generateClaimCodes,
} from "@/features/actions/actions.service";
import type { GeneratedClaimCodesResponse } from "@/features/actions/actions.types";
import { ApiError } from "@/lib/http/api-error";
import {
  isValidAdminReason,
  normalizeAdminReason,
} from "../_components/admin-reason-dialog";
import {
  AdminPanel,
  AdminSectionHeader,
  adminSelectClassName,
  adminTextareaClassName,
} from "../_components/admin-page";
export function ClaimCodeGenerator() {
  const qc = useQueryClient();
  const [actionId, setActionId] = useState("");
  const [quantity, setQuantity] = useState(50);
  const [reason, setReason] = useState("");
  const [last, setLast] = useState<GeneratedClaimCodesResponse | null>(null);
  const actions = useQuery({
    queryKey: ["admin", "actions", "generator"],
    queryFn: () => fetchAdminActions({ page: 1, limit: 100, status: "active" }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: () =>
      generateClaimCodes(actionId, {
        quantity,
        reason: normalizeAdminReason(reason),
      }),
    onSuccess: async (batch) => {
      setLast(batch);
      setReason("");
      toast.success(`${batch.quantity} códigos gerados.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "claim-codes"] }),
        qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
        qc.invalidateQueries({ queryKey: ["admin", "actions"] }),
      ]);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Não foi possível gerar o lote.",
      ),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidAdminReason(reason) || mutation.isPending) return;
    mutation.mutate();
  }
  const text = last?.codes.join("\n") ?? "";
  function download() {
    if (!last) return;
    const url = URL.createObjectURL(new Blob([text + "\n"]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `codigos-${last.action.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <AdminPanel
      aria-labelledby="claim-code-generator-title"
      className="overflow-hidden border-secondary/35 bg-[radial-gradient(circle_at_90%_0%,color-mix(in_srgb,var(--secondary)_13%,transparent),transparent_34%),color-mix(in_srgb,var(--card)_92%,transparent)]"
    >
      <AdminSectionHeader
        className="border-b border-secondary/20 px-5 py-5 md:px-6"
        description="Escolha uma atividade e gere códigos individuais. O último lote permanece disponível até uma nova geração bem-sucedida."
        eyebrow="emissão // uso único"
        id="claim-code-generator-title"
        title="Gerar lote de códigos"
      />
      <div className="grid gap-5 p-5 md:p-6">
        {actions.isPending ? (
          <p role="status">Carregando atividades...</p>
        ) : actions.error ? (
          <Button onClick={() => void actions.refetch()} variant="outline">
            Tentar novamente
          </Button>
        ) : (
          <form
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]"
            onSubmit={submit}
          >
            <Label className="grid gap-2">
              Atividade
              <select
                required
                className={adminSelectClassName}
                disabled={mutation.isPending}
                value={actionId}
                onChange={(e) => {
                  const nextActionId = e.target.value;
                  if (nextActionId !== actionId) setReason("");
                  setActionId(nextActionId);
                }}
              >
                <option value="">Selecione</option>
                {actions.data?.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.points} PTS
                  </option>
                ))}
              </select>
            </Label>
            <Label className="grid gap-2">
              Quantidade
              <Input
                min={1}
                max={500}
                disabled={mutation.isPending}
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </Label>
            <Label className="grid gap-2 md:col-span-2">
              Motivo
              <textarea
                aria-label="Motivo"
                aria-describedby="claim-code-reason-help"
                className={adminTextareaClassName}
                disabled={mutation.isPending}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                value={reason}
              />
              <span
                className="text-xs text-muted-foreground"
                id="claim-code-reason-help"
              >
                Informe de 10 a 500 caracteres.
              </span>
            </Label>
            <Button
              className="w-full sm:w-fit md:col-span-2"
              disabled={mutation.isPending || !isValidAdminReason(reason)}
              type="submit"
            >
              {mutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <TicketCheck />
              )}
              {mutation.isPending ? "Gerando..." : "Gerar lote"}
            </Button>
          </form>
        )}
        {last ? (
          <section className="grid gap-4 rounded-[16px] border border-success/30 bg-success/[0.04] p-4 md:p-5">
            <div>
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-success">
                lote pronto
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                {last.quantity} códigos · {last.action.name}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(text)
                    .then(() => toast.success("Códigos copiados."))
                }
              >
                <Copy />
                Copiar
              </Button>
              <Button variant="outline" onClick={download}>
                <Download />
                Baixar .txt
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-[11px] border border-border/80 bg-background/65 p-4 font-mono text-sm leading-6">
              {text}
            </pre>
          </section>
        ) : null}
      </div>
    </AdminPanel>
  );
}

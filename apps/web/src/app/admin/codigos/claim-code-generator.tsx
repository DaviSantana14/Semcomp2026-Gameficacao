"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, LoaderCircle, TicketCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Gerar códigos de uso único</CardTitle>
        <CardDescription>
          O último lote permanece disponível até uma nova geração bem-sucedida.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {actions.isPending ? (
          <p role="status">Carregando atividades...</p>
        ) : actions.error ? (
          <Button onClick={() => void actions.refetch()} variant="outline">
            Tentar novamente
          </Button>
        ) : (
          <form
            className="grid gap-4 md:grid-cols-[1fr_12rem]"
            onSubmit={submit}
          >
            <Label className="grid gap-2">
              Atividade
              <select
                required
                className="min-h-11 rounded-md border border-input bg-muted px-3"
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
                className="min-h-24 rounded-md border border-input bg-muted px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="w-fit md:col-span-2"
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
          <section className="grid gap-3 rounded-lg border p-4">
            <h3 className="font-black">Último lote · {last.action.name}</h3>
            <div className="flex gap-2">
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
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-4 font-mono text-sm">
              {text}
            </pre>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

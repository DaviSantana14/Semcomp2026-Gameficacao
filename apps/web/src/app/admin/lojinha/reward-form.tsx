"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, PackagePlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AdminReward,
  CreateRewardPayload,
  UpdateRewardDetailsPayload,
} from "@/features/rewards/rewards.types";
import {
  isValidAdminReason,
  normalizeAdminReason,
} from "../_components/admin-reason-dialog";
import {
  AdminPanel,
  AdminSectionHeader,
  adminTextareaClassName,
} from "../_components/admin-page";

export type RewardFormSubmission =
  | { mode: "create"; payload: CreateRewardPayload }
  | { mode: "edit"; rewardId: string; payload: UpdateRewardDetailsPayload };

type RewardFormProps = {
  reward: AdminReward | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (submission: RewardFormSubmission) => void;
};

const empty: CreateRewardPayload = {
  name: "",
  description: "",
  costInPoints: 100,
  stock: 0,
  imageUrl: "",
  isActive: true,
  reason: "",
};

export function RewardForm({
  reward,
  pending,
  onCancel,
  onSubmit,
}: RewardFormProps) {
  const [form, setForm] = useState<CreateRewardPayload>(() =>
    reward
      ? {
          name: reward.name,
          description: reward.description ?? "",
          costInPoints: reward.costInPoints,
          stock: reward.stock,
          imageUrl: reward.imageUrl ?? "",
          isActive: reward.isActive,
          reason: "",
        }
      : empty,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidAdminReason(form.reason) || pending) return;
    const normalized = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      imageUrl: form.imageUrl?.trim() || undefined,
      reason: normalizeAdminReason(form.reason),
    };
    if (reward) {
      const payload: UpdateRewardDetailsPayload = {
        name: normalized.name,
        description: form.description?.trim() ?? "",
        costInPoints: normalized.costInPoints,
        stock: normalized.stock,
        imageUrl: normalized.imageUrl ?? null,
        reason: normalized.reason,
      };
      onSubmit({ mode: "edit", rewardId: reward.id, payload });
      return;
    }
    onSubmit({ mode: "create", payload: normalized });
  }

  return (
    <AdminPanel aria-labelledby="reward-form-title" className="overflow-hidden">
      <AdminSectionHeader
        className="border-b border-border/80 px-5 py-5 md:px-6"
        description={
          reward
            ? `Editando ${reward.name}. Alterações valem para resgates futuros.`
            : "Defina custo, estoque e imagem para disponibilizar um novo item."
        }
        eyebrow={reward ? "catálogo // edição" : "catálogo // novo item"}
        id="reward-form-title"
        title="Configurar recompensa"
      />
      <form className="grid gap-5 p-5 md:p-6" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome">
            <Input
              disabled={pending}
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="URL da imagem">
            <Input
              disabled={pending}
              inputMode="url"
              placeholder="https://..."
              type="url"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </Field>
          <Field label="Custo em pontos">
            <Input
              disabled={pending}
              min={1}
              required
              type="number"
              value={form.costInPoints}
              onChange={(e) =>
                setForm({ ...form, costInPoints: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Estoque">
            <Input
              disabled={pending}
              min={0}
              required
              type="number"
              value={form.stock}
              onChange={(e) =>
                setForm({ ...form, stock: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Field label="Descrição">
          <Input
            disabled={pending}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        {!reward ? (
          <Label className="flex min-h-11 w-fit items-center gap-3 rounded-[11px] border border-border/80 bg-muted/30 px-3">
            <input
              checked={form.isActive}
              disabled={pending}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              type="checkbox"
            />
            Disponível imediatamente
          </Label>
        ) : null}
        <Field label="Motivo">
          <textarea
            aria-label="Motivo"
            aria-describedby="reward-reason-help"
            className={adminTextareaClassName}
            disabled={pending}
            maxLength={500}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          <span
            className="text-xs text-muted-foreground"
            id="reward-reason-help"
          >
            Informe de 10 a 500 caracteres.
          </span>
        </Field>
        <div className="flex flex-wrap gap-2 border-t border-border/80 pt-4">
          <Button
            disabled={pending || !isValidAdminReason(form.reason)}
            type="submit"
          >
            {pending ? (
              <LoaderCircle className="animate-spin" />
            ) : reward ? (
              <Save />
            ) : (
              <PackagePlus />
            )}
            {pending
              ? "Salvando..."
              : reward
                ? "Salvar alterações"
                : "Criar recompensa"}
          </Button>
          {reward ? (
            <Button
              disabled={pending}
              onClick={onCancel}
              type="button"
              variant="outline"
            >
              Cancelar edição
            </Button>
          ) : null}
        </div>
      </form>
    </AdminPanel>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Label className="flex flex-col gap-2">
      {label}
      {children}
    </Label>
  );
}

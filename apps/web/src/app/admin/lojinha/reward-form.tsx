"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, PackagePlus, Save } from "lucide-react";
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
  AdminReward,
  CreateRewardPayload,
  UpdateRewardDetailsPayload,
} from "@/lib/api";

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
        }
      : empty,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      imageUrl: form.imageUrl?.trim() || undefined,
    };
    if (reward) {
      const payload: UpdateRewardDetailsPayload = {
        name: normalized.name,
        description: form.description?.trim() ?? "",
        costInPoints: normalized.costInPoints,
        stock: normalized.stock,
        imageUrl: normalized.imageUrl ?? null,
      };
      onSubmit({ mode: "edit", rewardId: reward.id, payload });
      return;
    }
    onSubmit({ mode: "create", payload: normalized });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {reward ? "Editar recompensa" : "Nova recompensa"}
        </CardTitle>
        <CardDescription>
          Defina custo, estoque e imagem. Alterações valem para resgates
          futuros.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome">
              <Input
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="URL da imagem">
              <Input
                inputMode="url"
                placeholder="https://..."
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
            </Field>
            <Field label="Custo em pontos">
              <Input
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
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
          {!reward ? (
            <Label className="flex min-h-11 items-center gap-3">
              <input
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
                type="checkbox"
              />
              Disponível imediatamente
            </Label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending}>
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
      </CardContent>
    </Card>
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

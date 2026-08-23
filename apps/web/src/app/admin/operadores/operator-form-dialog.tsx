"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminProfile } from "@/features/users/users.types";
import type { AdminOperator } from "@/features/operators/operators.types";
import {
  isValidAdminReason,
  normalizeAdminReason,
} from "../_components/admin-reason-dialog";
import { adminSelectClassName, adminTextareaClassName } from "../_components/admin-page";

export type OperatorFormValues = {
  name: string;
  cpf: string;
  email: string;
  adminProfile: AdminProfile;
  reason: string;
};

const profileOptions: Array<{ label: string; value: AdminProfile }> = [
  { label: "Geral", value: "GENERAL" },
  { label: "Lojinha", value: "SHOP" },
  { label: "Atividades e códigos", value: "ACTIVITIES" },
];

export function OperatorFormDialog({
  onClose,
  onSubmit,
  operator,
  pending,
}: {
  onClose: () => void;
  onSubmit: (values: OperatorFormValues) => Promise<void>;
  operator: AdminOperator | null;
  pending: boolean;
}) {
  const titleId = useId();
  const [form, setForm] = useState<OperatorFormValues>(() => ({
    name: operator?.name ?? "",
    cpf: operator?.cpf ?? "",
    email: operator?.email ?? "",
    adminProfile: operator?.adminProfile ?? "SHOP",
    reason: "",
  }));
  const cpf = form.cpf.replace(/\D/g, "");
  const valid =
    form.name.trim().length >= 1 &&
    cpf.length === 11 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    isValidAdminReason(form.reason);

  function update<K extends keyof OperatorFormValues>(
    key: K,
    value: OperatorFormValues[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending) return;
    await onSubmit({
      ...form,
      name: form.name.trim(),
      cpf,
      email: form.email.trim().toLowerCase(),
      reason: normalizeAdminReason(form.reason),
    });
  }

  return (
    <Dialog
      onClose={onClose}
      open
      preventClose={pending}
      titleId={titleId}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            operadores // {operator ? "edição" : "novo cadastro"}
          </p>
          <h2 className="mt-2 text-2xl font-bold" id={titleId}>
            {operator ? "Editar operador" : "Novo operador"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {operator
              ? "Atualize a identidade ou o perfil de acesso."
              : "O código de ativação será exibido uma única vez."}
          </p>
        </div>
        <Button
          aria-label="Fechar"
          disabled={pending}
          onClick={onClose}
          type="button"
          variant="ghost"
        >
          Fechar
        </Button>
      </div>
      <form className="grid gap-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome">
            <Input
              disabled={pending}
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
          <Field label="CPF">
            <Input
              disabled={pending}
              inputMode="numeric"
              value={form.cpf}
              onChange={(event) => update("cpf", event.target.value)}
            />
          </Field>
          <Field label="E-mail">
            <Input
              disabled={pending}
              inputMode="email"
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </Field>
          <Field label="Perfil">
            <select
              className={adminSelectClassName}
              disabled={pending}
              value={form.adminProfile}
              onChange={(event) =>
                update("adminProfile", event.target.value as AdminProfile)
              }
            >
              {profileOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Motivo">
          <textarea
            aria-label="Motivo"
            aria-describedby="operator-reason-help"
            className={adminTextareaClassName}
            disabled={pending}
            maxLength={500}
            value={form.reason}
            onChange={(event) => update("reason", event.target.value)}
          />
          <span className="text-xs text-muted-foreground" id="operator-reason-help">
            Informe de 10 a 500 caracteres.
          </span>
        </Field>
        <div className="flex flex-col-reverse gap-2 border-t border-border/80 pt-4 sm:flex-row sm:justify-end">
          <Button disabled={pending} onClick={onClose} type="button" variant="outline">
            Cancelar
          </Button>
          <Button disabled={!valid || pending} type="submit">
            {pending
              ? "Salvando..."
              : operator
                ? "Salvar alterações"
                : "Criar operador"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return <Label className="flex flex-col gap-2">{label}{children}</Label>;
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { activateAdmin } from "@/features/auth/auth.service";
import { adminActivationSchema } from "@/features/auth/auth.validation";
import { ApiError } from "@/lib/http/api-error";

type AdminActivationFormValues = z.infer<typeof adminActivationSchema>;

export function AdminActivationForm() {
  const router = useRouter();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<AdminActivationFormValues>({
    resolver: zodResolver(adminActivationSchema),
    defaultValues: {
      code: "",
      cpf: "",
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  async function onSubmit(values: AdminActivationFormValues) {
    try {
      await activateAdmin({
        code: values.code.trim(),
        cpf: values.cpf.replace(/\D/g, ""),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        passwordConfirmation: values.passwordConfirmation,
      });
      toast.success("Acesso ativado. Entre com sua nova senha.");
      router.replace("/login/admin");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível ativar o acesso. Tente novamente.",
      );
    }
  }

  return (
    <Card className="relative z-10 w-full border-secondary/25 bg-card/85 shadow-[0_2rem_6rem_rgba(0,0,0,0.38)] backdrop-blur-xl">
      <CardHeader>
        <CardTitle>Ativar acesso administrativo</CardTitle>
        <CardDescription>
          Use o código recebido e defina sua senha definitiva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)}>
          <ActivationField
            error={errors.code?.message}
            id="activation-code"
            label="Código de ativação"
            register={register("code")}
          />
          <ActivationField
            error={errors.cpf?.message}
            id="cpf"
            inputMode="numeric"
            label="CPF"
            register={register("cpf")}
          />
          <ActivationField
            autoComplete="email"
            error={errors.email?.message}
            id="email"
            inputMode="email"
            label="E-mail"
            register={register("email")}
          />
          <ActivationField
            autoComplete="new-password"
            error={errors.password?.message}
            id="password"
            label="Senha"
            register={register("password")}
            type="password"
          />
          <ActivationField
            autoComplete="new-password"
            error={errors.passwordConfirmation?.message}
            id="password-confirmation"
            label="Confirmar senha"
            register={register("passwordConfirmation")}
            type="password"
          />
          <Button disabled={isSubmitting} type="submit">
            <KeyRound aria-hidden="true" data-icon="inline-start" />
            {isSubmitting ? "Ativando..." : "Ativar acesso"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ActivationField({
  error,
  id,
  label,
  register,
  ...props
}: {
  error?: string;
  id: string;
  label: string;
  register: UseFormRegisterReturn;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id">) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        id={id}
        {...register}
        {...props}
      />
      {error ? (
        <p className="text-sm font-medium text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

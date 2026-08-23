"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
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
import { changeRequiredPassword } from "@/features/auth/auth.service";
import { requiredPasswordChangeSchema } from "@/features/auth/auth.validation";
import { ApiError } from "@/lib/http/api-error";

type ChangeRequiredPasswordFormValues = z.infer<
  typeof requiredPasswordChangeSchema
>;

export function ChangeRequiredPasswordForm() {
  const router = useRouter();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ChangeRequiredPasswordFormValues>({
    resolver: zodResolver(requiredPasswordChangeSchema),
    defaultValues: {
      newPassword: "",
      passwordConfirmation: "",
    },
  });

  async function onSubmit(values: ChangeRequiredPasswordFormValues) {
    setSubmissionError(null);
    try {
      await changeRequiredPassword({ newPassword: values.newPassword });
      setSuccess(true);
      router.replace("/login");
    } catch (error) {
      setSubmissionError(getChangeErrorMessage(error));
    }
  }

  return (
    <Card className="relative z-10 w-full border-secondary/25 bg-card/85 shadow-[0_2rem_6rem_rgba(0,0,0,0.38)] backdrop-blur-xl">
      <CardHeader>
        <CardTitle>Defina sua nova senha</CardTitle>
        <CardDescription>
          A senha temporária é válida por tempo limitado e não pode ser usada
          novamente depois desta troca.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={handleSubmit(onSubmit)}>
          <PasswordField
            error={errors.newPassword?.message}
            id="required-new-password"
            label="Nova senha"
            register={register("newPassword")}
          />
          <PasswordField
            error={errors.passwordConfirmation?.message}
            id="required-password-confirmation"
            label="Confirmar nova senha"
            register={register("passwordConfirmation")}
          />
          {submissionError ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {submissionError}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm font-medium text-success" role="status">
              Sua senha foi alterada. Faça login novamente.
            </p>
          ) : null}
          <Button disabled={isSubmitting} type="submit">
            <KeyRound aria-hidden="true" data-icon="inline-start" />
            {isSubmitting ? "Salvando..." : "Definir nova senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordField({
  error,
  id,
  label,
  register,
}: {
  error?: string;
  id: string;
  label: string;
  register: UseFormRegisterReturn;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        autoComplete="new-password"
        id={id}
        type="password"
        {...register}
      />
      {error ? (
        <p className="text-sm font-medium text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function getChangeErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "PASSWORD_MUST_CHANGE") {
      return "Escolha uma senha diferente da temporária.";
    }
    if (error.code === "PASSWORD_RESET_INVALID") {
      return "A senha temporária expirou ou foi substituída. Solicite um novo reset.";
    }
    return error.message;
  }
  return "Não foi possível definir a nova senha. Tente novamente.";
}

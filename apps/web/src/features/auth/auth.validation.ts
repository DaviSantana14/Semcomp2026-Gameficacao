import { z } from "zod";

export const participantPasswordSchema = z
  .string()
  .refine(
    (value) => Array.from(value).length >= 8,
    "Use pelo menos 8 caracteres.",
  )
  .refine(
    (value) => Array.from(value).length <= 64,
    "Use no máximo 64 caracteres.",
  )
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "A senha ultrapassa o limite de 72 bytes.",
  );

export const adminPasswordSchema = z
  .string()
  .refine(
    (value) => Array.from(value).length >= 12,
    "A senha deve ter entre 12 e 64 caracteres.",
  )
  .refine(
    (value) => Array.from(value).length <= 64,
    "A senha deve ter entre 12 e 64 caracteres.",
  )
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "A senha deve ter no máximo 72 bytes em UTF-8.",
  );

export const adminActivationSchema = z
  .object({
    code: z
      .string()
      .trim()
      .refine(
        (value) => value.length >= 20 && value.length <= 40,
        "Informe um código de ativação válido.",
      ),
    cpf: z
      .string()
      .transform((value) => value.replace(/\D/g, ""))
      .refine(
        (value) => /^\d{11}$/.test(value),
        "Informe um CPF com 11 dígitos.",
      ),
    email: z.string().email("Informe um e-mail válido."),
    password: adminPasswordSchema,
    passwordConfirmation: z
      .string()
      .min(1, "Confirme a senha."),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "As senhas precisam ser iguais.",
    path: ["passwordConfirmation"],
  });

export const requiredPasswordChangeSchema = z
  .object({
    newPassword: participantPasswordSchema,
    passwordConfirmation: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((values) => values.newPassword === values.passwordConfirmation, {
    message: "As senhas precisam ser iguais.",
    path: ["passwordConfirmation"],
  });

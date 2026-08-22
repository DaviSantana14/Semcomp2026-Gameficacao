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

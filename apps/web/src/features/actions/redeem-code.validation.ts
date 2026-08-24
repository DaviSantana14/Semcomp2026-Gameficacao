import { z } from "zod";

const redeemCodePattern = /^[A-Z0-9-]+$/;

export function normalizeRedeemCode(value: string) {
  return value.trim().toUpperCase();
}

export function isRedeemCode(value: string) {
  return redeemCodePattern.test(normalizeRedeemCode(value));
}

export const redeemCodeSchema = z.object({
  code: z
    .string()
    .transform(normalizeRedeemCode)
    .refine((value) => redeemCodePattern.test(value), {
      message: "Use apenas letras, números e hífen.",
    }),
});

export type RedeemCodeValues = z.infer<typeof redeemCodeSchema>;

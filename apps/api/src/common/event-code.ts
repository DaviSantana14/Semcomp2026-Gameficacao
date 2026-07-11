import { randomInt } from 'node:crypto';

export const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CLAIM_CODE_REGEX = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
export const REUSABLE_EVENT_CODE_REGEX =
  /^(?![A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$)[A-Z0-9-]+$/;

export function normalizeEventCode(
  value: string | null | undefined,
): string | undefined {
  if (value == null) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function isClaimCode(value: string | null | undefined): boolean {
  const normalized = normalizeEventCode(value);
  return normalized !== undefined && CLAIM_CODE_REGEX.test(normalized);
}

export function generateClaimCode(): string {
  const characters = Array.from({ length: 8 }, () =>
    CLAIM_CODE_ALPHABET.charAt(randomInt(CLAIM_CODE_ALPHABET.length)),
  );

  return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
}

import { createHmac } from 'crypto';

export type CredentialRateLimitInput = {
  route: string;
  email: string;
  cpf?: string | null;
};

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, '');
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function serializeCredentialRateLimitInput({
  cpf,
  email,
  route,
}: CredentialRateLimitInput) {
  return JSON.stringify([
    'v2',
    route,
    typeof cpf === 'string' && cpf.length > 0 ? normalizeCpf(cpf) : null,
    normalizeEmail(email),
  ]);
}

export function createCredentialRateLimitKey(
  input: CredentialRateLimitInput,
  secret: string,
) {
  return createHmac('sha256', secret)
    .update(serializeCredentialRateLimitInput(input))
    .digest('hex');
}

export class RateLimitKey {
  constructor(private readonly secret: string) {
    if (secret.length === 0) {
      throw new Error('Missing RATE_LIMIT_KEY_SECRET environment variable');
    }
  }

  forCredential(input: CredentialRateLimitInput) {
    return createCredentialRateLimitKey(input, this.secret);
  }
}

import { createHmac } from 'crypto';

export type CredentialRateLimitInput = {
  cpf: string;
  email: string;
  route: string;
};

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, '');
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createCredentialRateLimitKey(
  { cpf, email, route }: CredentialRateLimitInput,
  secret: string,
) {
  return createHmac('sha256', secret)
    .update(`${route}\u0000${normalizeCpf(cpf)}\u0000${normalizeEmail(email)}`)
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

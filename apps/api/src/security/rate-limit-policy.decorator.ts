import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_POLICY_KEY = 'security:rate-limit-policy';

export const RATE_LIMIT_POLICY_NAMES = ['export', 'bulk'] as const;
export type RateLimitPolicyName = (typeof RATE_LIMIT_POLICY_NAMES)[number];

export const RateLimitPolicy = (policy: RateLimitPolicyName) =>
  SetMetadata(RATE_LIMIT_POLICY_KEY, policy);

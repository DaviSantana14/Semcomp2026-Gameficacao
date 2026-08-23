import { Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { createHash } from 'crypto';
import { ADMIN_PROFILES_KEY } from '../auth/admin-profiles.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RateLimitKey } from './rate-limit-key';
import {
  RATE_LIMIT_POLICY_KEY,
  type RateLimitPolicyName,
} from './rate-limit-policy.decorator';

type ResolvedRateLimitPolicy = {
  name: string;
  limit: number;
  ttl: number;
};

type RequestUser = { id?: unknown };

export type RateLimitedRequest = {
  body?: { cpf?: unknown; email?: unknown };
  cookies?: { access_token?: unknown };
  ip?: unknown;
  method?: string;
  path?: unknown;
  route?: { path?: unknown };
  baseUrl?: unknown;
  user?: RequestUser;
};

const NAMED_RATE_LIMIT_POLICIES: Record<
  RateLimitPolicyName,
  ResolvedRateLimitPolicy
> = {
  export: { name: 'admin-export', limit: 5, ttl: 60_000 },
  bulk: { name: 'claim-code-bulk', limit: 2, ttl: 60_000 },
};

const LOGIN_ROUTE_POLICIES: Record<string, ResolvedRateLimitPolicy> = {
  '/auth/login': { name: 'participant-login', limit: 5, ttl: 15 * 60 * 1000 },
  '/auth/admin/login': { name: 'admin-login', limit: 5, ttl: 15 * 60 * 1000 },
  '/auth/register': { name: 'register', limit: 3, ttl: 60 * 60 * 1000 },
};

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly rateLimitKey: RateLimitKey,
    @Optional() private readonly jwtService?: JwtService,
  ) {
    super(options, storageService, reflector);
    this.rateLimitKey = rateLimitKey;
    this.jwtService = jwtService;
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const policy = this.getPolicy(requestProps.context);

    return super.handleRequest({
      ...requestProps,
      limit: policy.limit,
      ttl: policy.ttl,
      blockDuration: policy.ttl,
    });
  }

  protected async getTracker(request: RateLimitedRequest): Promise<string> {
    const route = this.getRoute(request);
    const credentialPolicy = LOGIN_ROUTE_POLICIES[route];

    if (credentialPolicy) {
      const { cpf, email } = request.body ?? {};
      if (typeof email === 'string') {
        return `credential:${this.rateLimitKey.forCredential({
          route,
          email,
          cpf: typeof cpf === 'string' ? cpf : null,
        })}`;
      }
    }

    const authenticatedUserId = await this.getAuthenticatedUserId(request);
    if (authenticatedUserId) {
      return `user:${authenticatedUserId}`;
    }

    return `ip:${typeof request.ip === 'string' ? request.ip : 'unknown'}`;
  }

  protected generateKey(
    context: ThrottlerRequest['context'],
    tracker: string,
    throttlerName: string,
  ) {
    return createHash('sha256')
      .update(
        `${this.getPolicy(context).name}\u0000${throttlerName}\u0000${tracker}`,
      )
      .digest('hex');
  }

  protected async throwThrottlingException(
    context: Parameters<ThrottlerGuard['throwThrottlingException']>[0],
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const response = res as {
      header(name: string, value: number): void;
    };
    response.header('X-RateLimit-Limit', detail.limit);
    response.header('X-RateLimit-Remaining', 0);
    response.header('X-RateLimit-Reset', detail.timeToExpire);

    await super.throwThrottlingException(context, detail);
  }

  private getPolicy(
    context: ThrottlerRequest['context'],
  ): ResolvedRateLimitPolicy {
    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const namedPolicy = this.reflector.getAllAndOverride<RateLimitPolicyName>(
      RATE_LIMIT_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (namedPolicy) {
      return NAMED_RATE_LIMIT_POLICIES[namedPolicy];
    }

    const route = this.getRoute(request);
    const credentialPolicy = LOGIN_ROUTE_POLICIES[route];

    if (credentialPolicy) {
      return credentialPolicy;
    }

    if (route === '/health') {
      return { name: 'health', limit: 60, ttl: 60 * 1000 };
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAdminProfiles = this.reflector.getAllAndOverride<
      unknown[] | undefined
    >(ADMIN_PROFILES_KEY, [context.getHandler(), context.getClass()]);
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(
      request.method ?? '',
    );

    if (!isMutation) {
      return { name: 'authenticated-read', limit: 120, ttl: 60 * 1000 };
    }

    return requiredAdminProfiles !== undefined ||
      requiredRoles?.includes(UserRole.ADMIN)
      ? { name: 'admin-mutation', limit: 30, ttl: 60 * 1000 }
      : { name: 'participant-mutation', limit: 10, ttl: 60 * 1000 };
  }

  private getRoute(request: RateLimitedRequest) {
    const routePath = request.route?.path;
    if (typeof routePath === 'string' && typeof request.baseUrl === 'string') {
      return `${request.baseUrl}${routePath}`;
    }

    return typeof request.path === 'string' ? request.path : '';
  }

  private async getAuthenticatedUserId(request: RateLimitedRequest) {
    if (typeof request.user?.id === 'string' && request.user.id.length > 0) {
      return request.user.id;
    }

    const token = request.cookies?.access_token;
    if (typeof token !== 'string' || !this.jwtService) {
      return undefined;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: unknown }>(
        token,
      );
      return typeof payload.sub === 'string' && payload.sub.length > 0
        ? payload.sub
        : undefined;
    } catch {
      return undefined;
    }
  }
}

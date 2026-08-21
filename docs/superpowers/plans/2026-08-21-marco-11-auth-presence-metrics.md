# Marco 11 Auth, Presence, and Operational Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace participant CPF/email login with email/password and deliver persistent sessions, heartbeat-based presence, minute/day metrics, an admin dashboard, and aggregate CSV export.

**Architecture:** A new `PresenceModule` owns persisted sessions, collection, retention, and metric queries. `AuthModule` consumes its session service, while `AdminModule` exposes separate presence endpoints; PostgreSQL unique buckets and atomic upserts make per-process NestJS schedules safe across replicas. The web app keeps authentication, heartbeat, and admin metric queries separate so one degraded subsystem does not hide the others.

**Tech Stack:** NestJS 11, Prisma ORM 7.8, PostgreSQL 16, bcrypt 6, `@nestjs/schedule`, Next.js 16, React 19, TanStack Query 5, React Hook Form, Zod 4, Vitest 4, Jest 30.

## Global Constraints

- Operational timezone is exactly `America/Sao_Paulo`; persist timestamps in UTC.
- Participant login is email + password only; CPF remains required, normalized, unique, and never acts as a credential.
- Participant passwords accept any Unicode characters and spaces, with 8–64 Unicode code points and at most 72 UTF-8 bytes; impose no composition rule.
- Administrator login remains CPF + email + password with its existing 12–64-character policy and 72-byte limit.
- Use bcrypt v6 async `hash()`/`compare()`, automatic salt, cost 12, and a dummy comparison for every invalid authentication state.
- JWT and cookie duration remain 8 hours; each JWT contains a unique `jti` backed by `UserSession`.
- Heartbeat interval is 60 seconds; online window is 120 seconds; count `DISTINCT userId` and exclude admins and inactive participants.
- Retain ended sessions for 30 days, minute samples for 90 days, and daily summaries for 24 months.
- Heartbeat and presence are telemetry, never `AdminAuditEvent` or `PointEvent`.
- Never store or log passwords, password confirmation, hashes, CPF/email in rate-limit keys, JWTs, cookies, CSRF, IP, user-agent, routes visited, or typed content.
- CSV contains aggregate rows only, uses UTF-8 BOM, `;` delimiter, São Paulo offsets, and the same `[from, to)` filters as history.
- Password recovery, legacy participant login, MFA, Redis, workers, behavioral analytics, and sophisticated charts are out of scope.
- Follow TDD: every behavioral change starts with a focused failing test, then minimal implementation, focused pass, and a small commit.

## File Structure

### Backend data and shared utilities

- `apps/api/prisma/schema/users.prisma`: user/session relation and session enum/model.
- `apps/api/prisma/schema/presence.prisma`: minute samples and daily summaries.
- `apps/api/prisma/migrations/20260821120000_add_presence_sessions/migration.sql`: PostgreSQL tables, indexes, enum, and restrictive foreign key.
- `apps/api/src/common/operational-time.ts`: São Paulo day/minute boundaries and retention cutoffs.
- `apps/api/src/common/clock.ts`: injectable wall clock for deterministic tests.

### Backend authentication and sessions

- `apps/api/src/auth/password-hash.service.ts`: bcrypt-only mechanics and dummy digest.
- `apps/api/src/auth/participant-password-policy.ts`: participant 8/64/72 validation.
- `apps/api/src/auth/participant-password.service.ts`: participant role/policy verification.
- `apps/api/src/presence/sessions.repository.ts`: transactional session persistence.
- `apps/api/src/presence/sessions.service.ts`: session lifecycle API consumed by auth/admin.
- `apps/api/src/presence/presence.module.ts`: exported session and metric services.
- Existing auth DTO/service/controller/strategy, users repository/service, security throttler, seed, and E2E harness are modified in place.

### Backend presence and administration

- `apps/api/src/presence/presence.repository.ts`: aggregate queries and atomic bucket upserts.
- `apps/api/src/presence/presence-collection.service.ts`: one deterministic collection cycle.
- `apps/api/src/presence/presence-scheduler.service.ts`: cron wrappers and safe logging.
- `apps/api/src/presence/presence-query.service.ts`: overview/history validation and mapping.
- `apps/api/src/presence/presence-csv.service.ts`: aggregate CSV serialization only.
- `apps/api/src/admin/admin-presence.controller.ts`: protected overview/history/export routes.
- `apps/api/src/admin/dto/presence-history-query.dto.ts`: validated `[from, to)` query.
- `apps/api/src/admin/dto/presence-response.dto.ts`: documented response contracts.

### Frontend

- Existing participant registration/login files are modified in place.
- `apps/web/src/features/presence/presence.types.ts`: overview/history response types.
- `apps/web/src/features/presence/presence.service.ts`: heartbeat, queries, and CSV download.
- `apps/web/src/hooks/use-presence-heartbeat.ts`: 60-second background heartbeat.
- `apps/web/src/app/admin/_components/presence-panel.tsx`: live cards/degraded state.
- `apps/web/src/app/admin/_components/presence-history.tsx`: filters, pagination, table, and download.

### Operations

- Existing smoke/load scripts, CI workflow, roadmap, and environment documentation are updated in place.

---

### Task 1: Add Presence Persistence and Scheduler Dependency

**Files:**
- Modify: `apps/api/prisma/schema/users.prisma`
- Create: `apps/api/prisma/schema/presence.prisma`
- Create: `apps/api/prisma/migrations/20260821120000_add_presence_sessions/migration.sql`
- Create: `apps/api/src/common/specs/presence-session-migration.spec.ts`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces Prisma models `UserSession`, `PresenceSample`, `PresenceDailySummary` and enum `SessionEndReason`.
- Produces unique database keys `UserSession.jti`, `PresenceSample.bucket`, and `PresenceDailySummary.operationalDate` used by all later tasks.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('presence session migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260821120000_add_presence_sessions/migration.sql',
    ),
    'utf8',
  );

  it('creates session and aggregate tables with restrictive ownership', () => {
    expect(sql).toContain('CREATE TABLE "UserSession"');
    expect(sql).toContain('CREATE TABLE "PresenceSample"');
    expect(sql).toContain('CREATE TABLE "PresenceDailySummary"');
    expect(sql).toContain('ON DELETE RESTRICT');
  });

  it('enforces one jti, minute bucket, and operational date', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "UserSession_jti_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "PresenceSample_bucket_key"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "PresenceDailySummary_operationalDate_key"',
    );
  });
});
```

- [ ] **Step 2: Run the focused test and observe the missing migration failure**

Run: `npm --workspace api test -- --runTestsByPath src/common/specs/presence-session-migration.spec.ts`

Expected: FAIL because `20260821120000_add_presence_sessions/migration.sql` does not exist.

- [ ] **Step 3: Add the Prisma models and exact SQL migration**

Add to `users.prisma`:

```prisma
enum SessionEndReason {
  LOGOUT
  EXPIRED
  REVOKED
}

model UserSession {
  id         String            @id @default(cuid())
  jti        String            @unique
  userId     String
  user       User              @relation(fields: [userId], references: [id], onDelete: Restrict)
  startedAt  DateTime          @default(now())
  lastSeenAt DateTime
  expiresAt  DateTime
  endedAt    DateTime?
  endReason  SessionEndReason?

  @@index([userId, lastSeenAt])
  @@index([endedAt, expiresAt])
  @@index([lastSeenAt])
  @@index([startedAt])
}
```

Add `sessions UserSession[]` and `@@index([role, createdAt])` to `User`; the SQL migration creates the matching `User_role_createdAt_idx` used by participant registration-period counts.

Create `presence.prisma`:

```prisma
model PresenceSample {
  id                     String   @id @default(cuid())
  bucket                 DateTime @unique
  onlineParticipants     Int
  registeredParticipants Int
  peakObservedAt         DateTime
  lastCollectedAt        DateTime
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}

model PresenceDailySummary {
  id                           String   @id @default(cuid())
  operationalDate              DateTime @unique @db.Date
  peakOnlineParticipants       Int
  peakAt                       DateTime?
  registeredParticipantsAtPeak Int
  uniqueParticipantLogins      Int
  newParticipantRegistrations  Int
  lastCalculatedAt             DateTime
  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt
}
```

The SQL migration must create the same enum/tables/indexes, add the restrictive `UserSession_userId_fkey`, and contain no delete/update of existing users.

- [ ] **Step 4: Install scheduling and validate schema/client/tests**

Run:

```bash
npm --workspace api install @nestjs/schedule
npm --workspace api run prisma:validate
npm --workspace api run prisma:generate
npm --workspace api test -- --runTestsByPath src/common/specs/presence-session-migration.spec.ts
```

Expected: Prisma schema valid, client generated, focused test PASS.

- [ ] **Step 5: Commit the persistence foundation**

```bash
git add apps/api/prisma/schema/users.prisma apps/api/prisma/schema/presence.prisma apps/api/prisma/migrations/20260821120000_add_presence_sessions/migration.sql apps/api/src/common/specs/presence-session-migration.spec.ts apps/api/package.json package-lock.json
git commit -m "feat: add presence session persistence"
```

---

### Task 2: Extract Password Hashing and Add Participant Password Policy

**Files:**
- Create: `apps/api/src/auth/password-hash.service.ts`
- Create: `apps/api/src/auth/participant-password-policy.ts`
- Create: `apps/api/src/auth/participant-password.service.ts`
- Create: `apps/api/src/auth/specs/participant-password-policy.spec.ts`
- Create: `apps/api/src/auth/specs/participant-password.service.spec.ts`
- Modify: `apps/api/src/auth/admin-password.service.ts`
- Modify: `apps/api/src/auth/specs/admin-password.service.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Produces `PasswordHashService.hash(password): Promise<string>` and `compare(password, hash): Promise<boolean>`.
- Produces `ParticipantPasswordService.hash(password)` and `verify(password, user)`.
- Preserves `AdminPasswordService.hash/verify` public signatures.

- [ ] **Step 1: Write participant policy tests before implementation**

```ts
import {
  ParticipantPasswordValidationError,
  validateParticipantPassword,
} from '../participant-password-policy';

describe('validateParticipantPassword', () => {
  it.each(['a'.repeat(8), ' '.repeat(8), 'senha livre', 'é'.repeat(8)])(
    'accepts free-form password %p',
    (password) => {
      expect(() => validateParticipantPassword(password)).not.toThrow();
    },
  );

  it.each(['a'.repeat(7), 'a'.repeat(65), 'é'.repeat(37)])(
    'rejects password outside character or byte limits',
    (password) => {
      expect(() => validateParticipantPassword(password)).toThrow(
        ParticipantPasswordValidationError,
      );
    },
  );
});
```

- [ ] **Step 2: Run policy tests and confirm missing module failure**

Run: `npm --workspace api test -- --runTestsByPath src/auth/specs/participant-password-policy.spec.ts`

Expected: FAIL because `participant-password-policy.ts` does not exist.

- [ ] **Step 3: Implement exact participant validation**

```ts
export const PARTICIPANT_PASSWORD_MIN_LENGTH = 8;
export const PARTICIPANT_PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_MAX_UTF8_BYTES = 72;

export class ParticipantPasswordValidationError extends Error {}

export function validateParticipantPassword(password: string): void {
  const characters = Array.from(password).length;
  const bytes = Buffer.byteLength(password, 'utf8');
  if (
    characters < PARTICIPANT_PASSWORD_MIN_LENGTH ||
    characters > PARTICIPANT_PASSWORD_MAX_LENGTH ||
    bytes > PASSWORD_MAX_UTF8_BYTES
  ) {
    throw new ParticipantPasswordValidationError(
      'Invalid participant password.',
    );
  }
}
```

- [ ] **Step 4: Write service tests for cost 12, role checks, and dummy compare**

```ts
it('hashes a valid participant password with cost 12', async () => {
  const hashes = { hash: jest.fn().mockResolvedValue('$2b$12$hash') };
  const service = new ParticipantPasswordService(hashes as never);
  await expect(service.hash('senha123')).resolves.toBe('$2b$12$hash');
  expect(hashes.hash).toHaveBeenCalledWith('senha123');
});

it.each([null, { role: 'ADMIN', isActive: true, passwordHash: '$2b$12$x' },
  { role: 'PARTICIPANT', isActive: false, passwordHash: '$2b$12$x' },
  { role: 'PARTICIPANT', isActive: true, passwordHash: null }])(
  'performs a dummy comparison for invalid participant state',
  async (user) => {
    const hashes = { compare: jest.fn().mockResolvedValue(false) };
    const service = new ParticipantPasswordService(hashes as never);
    await expect(service.verify('senha123', user as never)).resolves.toBe(false);
    expect(hashes.compare).toHaveBeenCalledTimes(1);
  },
);
```

- [ ] **Step 5: Implement shared bcrypt mechanics and role-specific verification**

```ts
import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcrypt';

export const BCRYPT_COST = 12;
export const DUMMY_PASSWORD = 'semcomp-dummy-password';
export const DUMMY_PASSWORD_HASH =
  '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class PasswordHashService {
  hash(password: string) {
    return hash(password, BCRYPT_COST);
  }

  compare(password: string, passwordHash: string) {
    return compare(password, passwordHash);
  }
}
```

`ParticipantPasswordService.verify` must validate the input without throwing, substitute `DUMMY_PASSWORD` when the input exceeds policy/bcrypt limits, substitute `DUMMY_PASSWORD_HASH` unless role/state/hash are valid, call `compare` exactly once, and return true only when all gates and comparison pass. Refactor `AdminPasswordService` to use the same `PasswordHashService` while preserving its 12-character policy and the same one-compare rule.

- [ ] **Step 6: Register providers and run focused auth tests**

Run:

```bash
npm --workspace api test -- --runTestsByPath src/auth/specs/participant-password-policy.spec.ts src/auth/specs/participant-password.service.spec.ts src/auth/specs/admin-password.service.spec.ts
```

Expected: all focused password tests PASS; no synchronous bcrypt API is used.

- [ ] **Step 7: Commit password primitives**

```bash
git add apps/api/src/auth/password-hash.service.ts apps/api/src/auth/participant-password-policy.ts apps/api/src/auth/participant-password.service.ts apps/api/src/auth/specs/participant-password-policy.spec.ts apps/api/src/auth/specs/participant-password.service.spec.ts apps/api/src/auth/admin-password.service.ts apps/api/src/auth/specs/admin-password.service.spec.ts apps/api/src/auth/auth.module.ts
git commit -m "feat: add participant password policy"
```

---

### Task 3: Implement the Persisted Session Lifecycle

**Files:**
- Create: `apps/api/src/common/clock.ts`
- Create: `apps/api/src/presence/sessions.repository.ts`
- Create: `apps/api/src/presence/sessions.service.ts`
- Create: `apps/api/src/presence/presence.module.ts`
- Create: `apps/api/src/presence/specs/sessions.repository.spec.ts`
- Create: `apps/api/src/presence/specs/sessions.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces `SessionDraft`, `ParticipantRegistrationInput`, and `SessionIdentity` types.
- Produces `SessionsService.registerParticipant`, `start(userId, expectedRole, session)`, `validate`, `heartbeat`, `end`, `expire`, `revokeUser`, and `deleteRetained`.
- `AuthService`, `JwtStrategy`, the collector, and admin deactivation consume these methods later.

- [ ] **Step 1: Write failing service lifecycle tests**

```ts
describe(SessionsService.name, () => {
  const now = new Date('2026-08-21T15:00:00.000Z');
  const clock = { now: () => now };

  it('validates only a live session owned by the JWT subject', async () => {
    const repository = {
      findAuthenticatable: jest.fn().mockResolvedValue({
        user: { id: 'user-1', role: 'PARTICIPANT', isActive: true },
      }),
    };
    const service = new SessionsService(repository as never, clock as never);
    await expect(service.validate('jti-1', 'user-1')).resolves.toMatchObject({
      id: 'user-1',
      role: 'PARTICIPANT',
    });
    expect(repository.findAuthenticatable).toHaveBeenCalledWith(
      'jti-1',
      'user-1',
      now,
    );
  });

  it('touches and ends only the current valid jti', async () => {
    const repository = {
      heartbeat: jest.fn().mockResolvedValue(1),
      end: jest.fn().mockResolvedValue(1),
    };
    const service = new SessionsService(repository as never, clock as never);
    await service.heartbeat('jti-1', 'user-1');
    await service.end('jti-1', 'user-1', 'LOGOUT');
    expect(repository.heartbeat).toHaveBeenCalledWith('jti-1', 'user-1', now);
    expect(repository.end).toHaveBeenCalledWith(
      'jti-1',
      'user-1',
      now,
      'LOGOUT',
    );
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm missing classes**

Run: `npm --workspace api test -- --runTestsByPath src/presence/specs/sessions.service.spec.ts`

Expected: FAIL because the presence session services do not exist.

- [ ] **Step 3: Define stable session interfaces and clock**

```ts
export type SessionDraft = {
  id: string;
  jti: string;
  startedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export type ParticipantRegistrationInput = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  passwordHash: string;
};

@Injectable()
export class Clock {
  now() {
    return new Date();
  }
}
```

- [ ] **Step 4: Implement transactional repository methods**

`registerParticipant(input, session)` must run one Prisma transaction that creates the participant with `role: PARTICIPANT`, `lastLoginAt: session.startedAt`, and a nested session. `start(userId, expectedRole, session)` must run one transaction: `updateMany` the user by id, expected role, and `isActive: true`; reject if zero rows changed; then create the session. This closes the race where an administrator deactivates the account between password comparison and session creation. Map Prisma `P2002` from registration to `PersistenceUniqueConstraintError`.

```ts
async findAuthenticatable(jti: string, userId: string, now: Date) {
  return this.prisma.userSession.findFirst({
    where: {
      jti,
      userId,
      endedAt: null,
      expiresAt: { gt: now },
      user: { isActive: true },
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
  });
}
```

`heartbeat` and `end` use `updateMany` with `jti`, `userId`, `endedAt: null`, and `expiresAt > now`. `expire` uses `updateMany` and sets `endedAt = expiresAt` through parameterized raw SQL. `revokeUser` ends all open sessions for one participant. `deleteRetained(cutoff)` deletes only ended/expired sessions older than the supplied cutoff.

- [ ] **Step 5: Implement service error behavior and module exports**

`validate` throws `UnauthorizedException('Sessão inválida. Faça login novamente.')` when no row is returned. `heartbeat` and `end` throw the same exception when their affected-row count is zero. Export `SessionsService` from `PresenceModule`; import `PresenceModule` into `AppModule` once.

- [ ] **Step 6: Run session tests and repository boundary checks**

Run:

```bash
npm --workspace api test -- --runTestsByPath src/presence/specs/sessions.service.spec.ts src/presence/specs/sessions.repository.spec.ts src/common/specs/repository-boundaries.spec.ts
```

Expected: session tests PASS and repository-boundary test confirms Prisma remains inside repositories.

- [ ] **Step 7: Commit the session lifecycle**

```bash
git add apps/api/src/common/clock.ts apps/api/src/presence/sessions.repository.ts apps/api/src/presence/sessions.service.ts apps/api/src/presence/presence.module.ts apps/api/src/presence/specs/sessions.repository.spec.ts apps/api/src/presence/specs/sessions.service.spec.ts apps/api/src/app.module.ts
git commit -m "feat: persist authenticated sessions"
```

---

### Task 4: Cut Participant Authentication Over to Email and Password

**Files:**
- Modify: `apps/api/src/auth/dto/register.dto.ts`
- Modify: `apps/api/src/auth/dto/login.dto.ts`
- Modify: `apps/api/src/auth/dto/admin-login.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/jwt.strategy.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/specs/auth.service.spec.ts`
- Modify: `apps/api/src/auth/specs/auth.controller.spec.ts`
- Create: `apps/api/src/auth/specs/auth-dto.spec.ts`
- Create: `apps/api/src/auth/specs/jwt-session.strategy.spec.ts`
- Modify: `apps/api/src/users/users.repository.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/common/request-context.ts`

**Interfaces:**
- `RegisterDto = { name; cpf; email; password }`.
- `LoginDto = { email; password }`.
- `AdminLoginDto = { cpf; email; password }`, independent from `LoginDto`.
- JWT payload and `request.user` add `jti: string`.
- `POST /auth/register` and participant/admin login all return `{ user, csrfToken }` and set the cookie.
- `POST /auth/heartbeat` and logout consume the current `jti`.

- [ ] **Step 1: Rewrite DTO tests for the new contracts**

```ts
it('accepts free-form participant password and rejects CPF in login', async () => {
  const dto = plainToInstance(LoginDto, {
    email: ' ADA@EXAMPLE.COM ',
    password: '        ',
    cpf: '12345678900',
  });
  expect(await validate(dto)).toHaveLength(0);
  expect(dto.email).toBe('ada@example.com');
  expect(dto.password).toBe('        ');
});

it('keeps administrator CPF, email, and password independent', async () => {
  const dto = plainToInstance(AdminLoginDto, {
    cpf: '123.456.789-00',
    email: 'ADMIN@EXAMPLE.COM',
    password: 'admin-password',
  });
  expect(await validate(dto)).toHaveLength(0);
  expect(dto.cpf).toBe('12345678900');
});
```

Use the global whitelist/forbid test to prove participant login rejects legacy `cpf` with HTTP 400.

- [ ] **Step 2: Write failing service tests for generic failures and atomic registration**

The tests must cover missing participant, admin role, inactive participant, null hash, wrong password, CPF/email conflict, successful register, successful participant login, and unchanged admin login. Every invalid login expects `UnauthorizedException('Email ou senha inválidos.')` and exactly one password comparison.

```ts
expect(sessions.registerParticipant).toHaveBeenCalledWith(
  expect.objectContaining({
    id: expect.any(String),
    name: 'Ada',
    cpf: '12345678900',
    email: 'ada@example.com',
    passwordHash: '$2b$12$hash',
  }),
  expect.objectContaining({ jti: expect.any(String) }),
);
expect(jwtService.signAsync).toHaveBeenCalledWith(
  expect.objectContaining({
    sub: expect.any(String),
    csrfToken: expect.any(String),
    jti: expect.any(String),
  }),
  { expiresIn: '8h' },
);
```

- [ ] **Step 3: Implement auth DTOs and user lookup**

`UsersRepository.findParticipantByEmailWithPasswordHash(email)` must select the user summary plus `passwordHash`, with no CPF predicate. Keep `findByCredentialsWithPasswordHash(cpf, email)` for admins. Remove participant `findActiveByCredentials` usage.

- [ ] **Step 4: Implement registration and login session issuance**

Generate opaque user ID, session ID, and `jti` with `randomUUID()`. Generate CSRF with `randomBytes(32).toString('base64url')`; use one captured `startedAt`, set `expiresAt = startedAt + 8 hours`, sign `{ sub, csrfToken, jti }`, then persist through `SessionsService` before returning.

```ts
private createSessionDraft(userId: string, startedAt: Date) {
  const jti = randomUUID();
  return {
    userId,
    draft: {
      id: randomUUID(),
      jti,
      startedAt,
      lastSeenAt: startedAt,
      expiresAt: new Date(startedAt.getTime() + 8 * 60 * 60 * 1000),
    },
    csrfToken: randomBytes(32).toString('base64url'),
  };
}
```

Registration hashes before attempting the transaction and maps `PersistenceUniqueConstraintError` to `ConflictException('Não foi possível criar o cadastro com os dados informados.')`. Login performs participant role/policy verification before starting a session.

- [ ] **Step 5: Make controller registration authenticated and add heartbeat**

Apply `AllowedOriginGuard` to register. Register sets the same cookie as login and returns no access token. Add:

```ts
@Post('heartbeat')
@HttpCode(HttpStatus.NO_CONTENT)
@UseGuards(JwtAuthGuard, CsrfGuard, AllowedOriginGuard)
async heartbeat(@Req() request: AuthenticatedRequest<{ id: string; jti: string }>) {
  await this.authService.heartbeat(request.user.id, request.user.jti);
}
```

Make logout async, end the current session before `clearCookie`, and keep the cookie when ending fails.

- [ ] **Step 6: Validate jti in `JwtStrategy`**

Require non-empty `sub`, `csrfToken`, and `jti`; call `sessions.validate(jti, sub)` and return `{ ...user, csrfToken, jti }`. Remove the direct `UsersService` lookup from the strategy.

- [ ] **Step 7: Run focused auth/session tests**

Run:

```bash
npm --workspace api test -- --runTestsByPath src/auth/specs/auth-dto.spec.ts src/auth/specs/auth.service.spec.ts src/auth/specs/auth.controller.spec.ts src/auth/specs/jwt-session.strategy.spec.ts src/auth/specs/csrf.guard.spec.ts
```

Expected: all focused tests PASS; register/login bodies never contain `accessToken` or `passwordHash`.

- [ ] **Step 8: Commit backend authentication cutover**

```bash
git add apps/api/src/auth apps/api/src/users apps/api/src/common/request-context.ts
git commit -m "feat: authenticate participants with email and password"
```

---

### Task 5: Update Security Keys, Seed Data, and E2E Authentication Fixtures

**Files:**
- Modify: `apps/api/src/security/rate-limit-key.ts`
- Modify: `apps/api/src/security/rate-limit-key.spec.ts`
- Modify: `apps/api/src/security/app-throttler.guard.ts`
- Modify: `apps/api/src/security/app-throttler.guard.spec.ts`
- Modify: `apps/api/prisma/seed-config.ts`
- Modify: `apps/api/prisma/seed-config.spec.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/test/support/admin-e2e-harness.ts`
- Modify: `apps/api/test/support/e2e-database-cleanup.ts`
- Modify: `apps/api/src/common/specs/e2e-database-cleanup.spec.ts`
- Modify: `apps/api/test/app.e2e-spec.ts`

**Interfaces:**
- `RateLimitCredentialInput` makes `cpf` optional and always requires normalized `email` and `route`.
- Participant fixtures receive a valid bcrypt hash and authenticate with email/password.
- E2E cleanup knows all three new tables and deletes them in child-to-parent order.

- [ ] **Step 1: Write failing rate-limit privacy tests**

```ts
it('uses email but not CPF for the participant login identity', () => {
  const key = createCredentialRateLimitKey(secret, {
    email: 'ADA@EXAMPLE.COM',
    route: '/auth/login',
  });
  expect(key).toMatch(/^credential:[a-f0-9]{64}$/);
  expect(key).not.toContain('ada@example.com');
});

it('separates participant and administrator routes', () => {
  expect(createCredentialRateLimitKey(secret, {
    email: 'ada@example.com', route: '/auth/login',
  })).not.toBe(createCredentialRateLimitKey(secret, {
    cpf: '12345678900', email: 'ada@example.com', route: '/auth/admin/login',
  }));
});
```

- [ ] **Step 2: Run security tests and observe the old CPF requirement**

Run: `npm --workspace api test -- --runTestsByPath src/security/rate-limit-key.spec.ts src/security/app-throttler.guard.spec.ts`

Expected: FAIL because participant credential tracking still requires `cpf`.

- [ ] **Step 3: Implement route-specific credential extraction**

Build the HMAC input from a versioned, length-delimited sequence, never raw concatenation:

```ts
type RateLimitCredentialInput = {
  route: string;
  email: string;
  cpf?: string;
};

const canonical = JSON.stringify([
  'v2',
  input.route,
  normalizeEmail(input.email),
  input.cpf ? normalizeCpf(input.cpf) : null,
]);
return `credential:${createHmac('sha256', secret).update(canonical).digest('hex')}`;
```

The guard passes email/route for `/auth/login`, CPF/email/route for `/auth/admin/login`, and CPF/email/route for `/auth/register`. Passwords must never enter logs, tracker keys, or thrown messages.

- [ ] **Step 4: Write failing seed and cleanup contract tests**

Assert the public seed participant password obeys the participant policy, its hash starts with `$2`, and cleanup contains `PresenceDailySummary`, `PresenceSample`, then `UserSession` before `User`.

- [ ] **Step 5: Update seeds, harness, cleanup, and auth E2E scenarios**

Add a non-secret development-only participant password to `seed-config.ts`, hash it with `PasswordHashService`, and never print it from `seed.ts`. Update `AdminE2eHarness.createParticipant()` to persist `passwordHash`, and its login helper to send:

```ts
await request(app.getHttpServer())
  .post('/auth/login')
  .send({ email: participant.email, password: PARTICIPANT_TEST_PASSWORD })
  .expect(200);
```

Add E2E assertions that registration sets the cookie and returns CSRF immediately, legacy CPF/email login is rejected with 400, bad email/password returns the same generic 401, a valid `jti` permits `/auth/me`, logout invalidates that JWT, and heartbeat requires JWT + origin + CSRF.

- [ ] **Step 6: Run security, seed, cleanup, and app E2E tests**

Run:

```bash
npm --workspace api test -- --runTestsByPath src/security/rate-limit-key.spec.ts src/security/app-throttler.guard.spec.ts src/prisma/seed-config.spec.ts src/common/specs/e2e-database-cleanup.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/app.e2e-spec.ts
```

Expected: all focused unit and E2E tests PASS; no response or log snapshot contains a password/hash.

- [ ] **Step 7: Commit security and fixture changes**

```bash
git add apps/api/src/security apps/api/prisma/seed-config.ts apps/api/prisma/seed-config.spec.ts apps/api/prisma/seed.ts apps/api/test/support apps/api/src/common/specs/e2e-database-cleanup.spec.ts apps/api/test/app.e2e-spec.ts
git commit -m "test: align auth fixtures with participant passwords"
```

---

### Task 6: Cut the Web Authentication Forms Over to Email and Password

**Files:**
- Modify: `apps/web/src/features/auth/auth.types.ts`
- Modify: `apps/web/src/features/auth/auth.service.ts`
- Modify: `apps/web/src/app/login/login-form.tsx`
- Modify: `apps/web/src/app/login/login-form.spec.tsx`
- Modify: `apps/web/src/app/cadastro/register-form.tsx`
- Create: `apps/web/src/app/cadastro/register-form.spec.tsx`
- Modify: `apps/web/src/app/login/admin/admin-login-form.tsx`
- Modify: `apps/web/src/app/login/admin/admin-login-form.spec.tsx`

**Interfaces:**
- `LoginPayload = { email; password }`.
- `RegisterPayload = { name; cpf; email; password }`.
- `AdminLoginPayload = { cpf; email; password }`, not an extension of participant login.
- `register()` returns `LoginResponse`, stores CSRF, and registration no longer calls `login()`.

- [ ] **Step 1: Rewrite login and registration interaction tests**

```tsx
it('submits participant email and password without CPF', async () => {
  render(<LoginForm />);
  await user.type(screen.getByLabelText(/e-mail/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/^senha$/i), '        ');
  await user.click(screen.getByRole('button', { name: /entrar/i }));
  expect(login).toHaveBeenCalledWith({
    email: 'ada@example.com',
    password: '        ',
  });
});

it('registers and redirects without a second login request', async () => {
  render(<RegisterForm />);
  await user.type(screen.getByLabelText(/^nome$/i), 'Ada Lovelace');
  await user.type(screen.getByLabelText(/^cpf$/i), '12345678900');
  await user.type(screen.getByLabelText(/^e-mail$/i), 'ada@example.com');
  await user.type(screen.getByLabelText(/^senha$/i), 'senha123');
  await user.type(screen.getByLabelText(/confirmar senha/i), 'senha123');
  await user.click(screen.getByRole('button', { name: /criar e entrar/i }));
  expect(register).toHaveBeenCalledWith(expect.objectContaining({
    password: 'senha123',
  }));
  expect(login).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/home');
});
```

Also assert the password input has `minLength={8}`, `maxLength={64}`, accepts spaces without trimming, displays the 72-byte validation message, and confirmation exists only in local form state and never in the API payload. Assert registration explains that automatic password recovery is unavailable in this phase and login does not render a misleading “Esqueci minha senha” link.

- [ ] **Step 2: Run frontend auth tests and observe old CPF/login behavior**

Run: `npm --workspace web test -- src/app/login/login-form.spec.tsx src/app/cadastro/register-form.spec.tsx src/app/login/admin/admin-login-form.spec.tsx`

Expected: FAIL because login is still CPF/email and registration performs a second request.

- [ ] **Step 3: Implement exact frontend payloads and validation**

Use a Zod refinement that matches the backend by Unicode code point and UTF-8 byte counts:

```ts
const participantPassword = z.string()
  .refine((value) => Array.from(value).length >= 8, 'Use pelo menos 8 caracteres.')
  .refine((value) => Array.from(value).length <= 64, 'Use no máximo 64 caracteres.')
  .refine((value) => new TextEncoder().encode(value).length <= 72,
    'A senha ultrapassa o limite de 72 bytes.');
```

Do not call `.trim()` on passwords. Keep CPF mask/validation only in registration and admin login. On successful registration/login, `auth.service.ts` stores `csrfToken` before redirecting.

- [ ] **Step 4: Preserve administrator behavior explicitly**

Keep the current admin 12-character rule and CPF/email/password fields. Add a test proving participant policy changes did not reduce the admin minimum.

- [ ] **Step 5: Run focused UI tests and typecheck**

Run:

```bash
npm --workspace web test -- src/app/login/login-form.spec.tsx src/app/cadastro/register-form.spec.tsx src/app/login/admin/admin-login-form.spec.tsx
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: focused tests and TypeScript PASS; participant login DOM contains no CPF input.

- [ ] **Step 6: Commit the web authentication cutover**

```bash
git add apps/web/src/features/auth apps/web/src/app/login apps/web/src/app/cadastro
git commit -m "feat: update participant authentication forms"
```

---

### Task 7: Establish Operational Time and Atomic Presence Collection

**Files:**
- Create: `apps/api/src/common/operational-time.ts`
- Create: `apps/api/src/common/specs/operational-time.spec.ts`
- Modify: `apps/api/src/ranking/ranking.service.ts`
- Modify: `apps/api/src/ranking/specs/ranking.service.spec.ts`
- Create: `apps/api/src/presence/presence.repository.ts`
- Create: `apps/api/src/presence/presence-collection.service.ts`
- Create: `apps/api/src/presence/specs/presence.repository.spec.ts`
- Create: `apps/api/src/presence/specs/presence-collection.service.spec.ts`
- Modify: `apps/api/src/presence/presence.module.ts`
- Create: `apps/api/test/presence-collection.e2e-spec.ts`

**Interfaces:**
- Exports `OPERATIONAL_TIME_ZONE`, `startOfMinuteUtc`, `startOfOperationalDayUtc`, `operationalDateUtc`, `ceilOperationalDateUtc`, `addUtcDays`, and `addUtcMonths`.
- `PresenceCollectionService.collect(now?)` creates/merges one minute bucket and its daily summary.
- Repository counts only distinct, active participant users with a currently valid session.

- [ ] **Step 1: Write deterministic timezone edge tests**

```ts
it.each([
  ['2026-08-21T02:59:59.999Z', '2026-08-20T03:00:00.000Z'],
  ['2026-08-21T03:00:00.000Z', '2026-08-21T03:00:00.000Z'],
])('maps %s to the São Paulo operational day', (input, expected) => {
  expect(startOfOperationalDayUtc(new Date(input)).toISOString()).toBe(expected);
});

it('floors a timestamp to its UTC minute', () => {
  expect(startOfMinuteUtc(new Date('2026-08-21T15:04:59.999Z')).toISOString())
    .toBe('2026-08-21T15:04:00.000Z');
});

it('ceilings a partial São Paulo day for daily [from,to) queries', () => {
  expect(ceilOperationalDateUtc(new Date('2026-08-21T12:00:00.000Z')).toISOString())
    .toBe('2026-08-22T00:00:00.000Z');
  expect(ceilOperationalDateUtc(new Date('2026-08-21T03:00:00.000Z')).toISOString())
    .toBe('2026-08-21T00:00:00.000Z');
});
```

- [ ] **Step 2: Run time tests, implement helpers, and refactor ranking**

Run: `npm --workspace api test -- --runTestsByPath src/common/specs/operational-time.spec.ts src/ranking/specs/ranking.service.spec.ts`

Expected: FAIL on the missing shared helper. Move the existing `Intl.DateTimeFormat` conversion from `ranking.service.ts` into `operational-time.ts`; keep ranking outputs unchanged. Re-run and expect PASS.

- [ ] **Step 3: Write failing collection tests for exact online semantics**

Test that one user with two sessions counts once; admins, inactive users, ended sessions, expired sessions, and `lastSeenAt < now - 120s` count zero; exactly-at-cutoff counts online. Assert registered/new-registration totals filter by `PARTICIPANT` but include inactive participants, registrations use `createdAt < bucket + 1 minute`, and unique logins use distinct participant users whose `startedAt` falls within the São Paulo day.

```ts
expect(repository.countOnlineParticipants).toHaveBeenCalledWith(
  new Date('2026-08-21T14:58:00.000Z'),
  new Date('2026-08-21T15:00:00.000Z'),
);
```

- [ ] **Step 4: Implement aggregate queries and atomic bucket upserts**

Use Prisma for counts and parameterized `$executeRaw` for atomic PostgreSQL upserts. The minute statement must follow this conflict behavior:

```sql
ON CONFLICT ("bucket") DO UPDATE SET
  "onlineParticipants" = GREATEST("PresenceSample"."onlineParticipants", EXCLUDED."onlineParticipants"),
  "registeredParticipants" = CASE
    WHEN EXCLUDED."onlineParticipants" > "PresenceSample"."onlineParticipants"
      THEN EXCLUDED."registeredParticipants"
    ELSE "PresenceSample"."registeredParticipants"
  END,
  "peakObservedAt" = CASE
    WHEN EXCLUDED."onlineParticipants" > "PresenceSample"."onlineParticipants"
      THEN EXCLUDED."peakObservedAt"
    ELSE "PresenceSample"."peakObservedAt"
  END,
  "lastCollectedAt" = GREATEST("PresenceSample"."lastCollectedAt", EXCLUDED."lastCollectedAt"),
  "updatedAt" = CURRENT_TIMESTAMP
```

The daily upsert uses the same strict `>` rule so ties preserve the first observed peak. Generate row IDs in TypeScript and interpolate them only as Prisma tagged-template parameters.

- [ ] **Step 5: Implement one idempotent collection cycle**

Capture `now` once; derive `bucket`, online cutoff, operational-day bounds, and operational date. Fetch online/registered/unique-login/new-registration counts, then upsert minute and daily rows. Collection must not query request metadata or write audit/point events.

- [ ] **Step 6: Prove conflict behavior against PostgreSQL**

In `presence-collection.e2e-spec.ts`, concurrently upsert observations 3 and 5 for the same minute and assert one row remains with peak 5 and its matching registered/observed values. Concurrently upsert an equal peak with a later timestamp and assert the first observation stays attached while `lastCollectedAt` advances. Also seed admin/inactive/duplicate sessions and assert the real distinct-online query returns only eligible people.

- [ ] **Step 7: Run focused collection, repository, and concurrency tests**

Run:

```bash
npm --workspace api test -- --runTestsByPath src/common/specs/operational-time.spec.ts src/ranking/specs/ranking.service.spec.ts src/presence/specs/presence.repository.spec.ts src/presence/specs/presence-collection.service.spec.ts src/common/specs/repository-boundaries.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/presence-collection.e2e-spec.ts
```

Expected: all tests PASS, including concurrent PostgreSQL upserts updating the same bucket without duplicate rows or a reduced peak.

- [ ] **Step 8: Commit operational time and collection**

```bash
git add apps/api/src/common/operational-time.ts apps/api/src/common/specs/operational-time.spec.ts apps/api/src/ranking apps/api/src/presence apps/api/test/presence-collection.e2e-spec.ts
git commit -m "feat: collect atomic presence metrics"
```

---

### Task 8: Schedule Collection, Expiration, Retention, and Transactional Revocation

**Files:**
- Create: `apps/api/src/presence/presence-scheduler.service.ts`
- Create: `apps/api/src/presence/specs/presence-scheduler.service.spec.ts`
- Modify: `apps/api/src/presence/presence.repository.ts`
- Modify: `apps/api/src/presence/sessions.repository.ts`
- Modify: `apps/api/src/presence/sessions.service.ts`
- Modify: `apps/api/src/presence/presence.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/admin/admin-participants.repository.ts`
- Modify: `apps/api/src/admin/admin-participants.service.ts`
- Modify: `apps/api/src/admin/specs/admin-participants.service.spec.ts`
- Modify: `apps/api/test/admin-participants.e2e-spec.ts`

**Interfaces:**
- Minute cron runs at second 5 and first expires sessions, then collects.
- Daily cron runs at 03:15 in `America/Sao_Paulo` and applies all three retention windows.
- Participant deactivation updates status, revokes sessions, and writes the audit event in one existing admin transaction.

- [ ] **Step 1: Write failing scheduler orchestration tests**

```ts
it('expires sessions before collecting the minute', async () => {
  await scheduler.collectMinute();
  expect(sessions.expire.mock.invocationCallOrder[0]).toBeLessThan(
    collection.collect.mock.invocationCallOrder[0],
  );
});

it('derives all retention cutoffs from one captured instant', async () => {
  await scheduler.retain();
  expect(sessions.deleteRetained).toHaveBeenCalledWith(
    new Date('2026-07-22T15:00:00.000Z'),
  );
  expect(presence.deleteMinuteSamplesBefore).toHaveBeenCalledWith(
    new Date('2026-05-23T15:00:00.000Z'),
  );
  expect(presence.deleteDailySummariesBefore).toHaveBeenCalledWith(
    expect.any(Date),
  );
});
```

Use a fixed `Clock`; assert failures are logged with a generated execution ID and swallowed only at the cron wrapper, while the directly tested collection service still rejects.

- [ ] **Step 2: Run scheduler tests and confirm the missing scheduler**

Run: `npm --workspace api test -- --runTestsByPath src/presence/specs/presence-scheduler.service.spec.ts`

Expected: FAIL because `PresenceSchedulerService` does not exist.

- [ ] **Step 3: Register scheduling once and implement cron wrappers**

Import `ScheduleModule.forRoot()` once in `AppModule`. Add:

```ts
@Cron('5 * * * * *', { timeZone: OPERATIONAL_TIME_ZONE })
async collectMinute() {
  const executionId = randomUUID();
  try {
    await this.sessions.expire();
    await this.collection.collect();
  } catch (error) {
    this.logger.error({ event: 'presence_collection_failed', executionId });
  }
}

@Cron('0 15 3 * * *', { timeZone: OPERATIONAL_TIME_ZONE })
async retain() {
  const executionId = randomUUID();
  try {
    const now = this.clock.now();
    await Promise.all([
      this.sessions.deleteRetained(addUtcDays(now, -30)),
      this.presence.deleteMinuteSamplesBefore(addUtcDays(now, -90)),
      this.presence.deleteDailySummariesBefore(
        addUtcMonths(operationalDateUtc(now), -24),
      ),
    ]);
  } catch {
    this.logger.error({ event: 'presence_retention_failed', executionId });
  }
}
```

Do not include exception objects that may carry Prisma parameters in the operational log. Retention repository calls must use `< cutoff`; repeated calls must be harmless.

- [ ] **Step 4: Write a failing deactivation-revocation test**

```ts
expect(transaction.lockParticipantStatus).toHaveBeenCalledWith('participant-1');
expect(transaction.updateParticipantStatus).toHaveBeenCalledWith('participant-1', false);
expect(transaction.revokeOpenSessions).toHaveBeenCalledWith(
  'participant-1',
  expect.any(Date),
);
expect(audit.record).toHaveBeenCalledTimes(1);
```

Also test that reactivation does not restore or create a session and a no-op status update does not revoke anything.

Add repository predicate tests proving session cleanup removes only rows with `endedAt < now - 30 days` or still-open rows with `expiresAt < now - 30 days`, minute cleanup uses `bucket < now - 90 days`, and daily cleanup uses `operationalDate < operationalDate(now) - 24 months`. Exact-cutoff rows remain until the next run.

- [ ] **Step 5: Revoke inside the existing admin transaction**

Add `AdminParticipantsRepository.revokeOpenSessions(userId, now)` using that repository's transaction-scoped Prisma client. Call it only when transitioning active → inactive, before the audit record. Set `endedAt: now` and `endReason: REVOKED`; never route this write through an independent Prisma transaction.

- [ ] **Step 6: Prove deactivation invalidates an issued JWT in E2E**

Create and log in a participant, authenticate an admin, deactivate the participant, then assert the participant cookie receives 401 from `/auth/me` and `/auth/heartbeat`. Reactivate and assert the old JWT remains invalid.

- [ ] **Step 7: Run focused scheduler/admin tests and E2E**

Run:

```bash
npm --workspace api test -- --runTestsByPath src/presence/specs/presence-scheduler.service.spec.ts src/admin/specs/admin-participants.service.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-participants.e2e-spec.ts
```

Expected: all tests PASS; deactivation leaves no authenticatable open session.

- [ ] **Step 8: Commit lifecycle automation**

```bash
git add apps/api/src/presence apps/api/src/app.module.ts apps/api/src/admin/admin-participants.repository.ts apps/api/src/admin/admin-participants.service.ts apps/api/src/admin/specs/admin-participants.service.spec.ts apps/api/test/admin-participants.e2e-spec.ts
git commit -m "feat: automate session and presence retention"
```

---

### Task 9: Expose Protected Presence Overview and History APIs

**Files:**
- Create: `apps/api/src/presence/presence-query.service.ts`
- Create: `apps/api/src/presence/specs/presence-query.service.spec.ts`
- Create: `apps/api/src/admin/admin-presence.controller.ts`
- Create: `apps/api/src/admin/dto/presence-history-query.dto.ts`
- Create: `apps/api/src/admin/dto/presence-response.dto.ts`
- Create: `apps/api/src/admin/specs/presence-history-query.dto.spec.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Create: `apps/api/test/admin-presence.e2e-spec.ts`

**Interfaces:**
- `GET /admin/presence/overview` returns the approved `PresenceOverview` shape.
- `GET /admin/presence/history` returns `{ period, timezone, granularity, items, meta }`.
- History uses required ISO `from`/`to`, inclusive/exclusive bounds, default daily granularity, and page size at most 500.

- [ ] **Step 1: Write failing query DTO tests**

```ts
it('defaults to daily page 1 and pageSize 50', async () => {
  const dto = plainToInstance(PresenceHistoryQueryDto, {
    from: '2026-08-01T03:00:00.000Z',
    to: '2026-08-22T03:00:00.000Z',
  });
  expect(await validate(dto)).toHaveLength(0);
  expect(dto).toMatchObject({ granularity: 'daily', page: 1, pageSize: 50 });
});

it.each([0, 501, 1.5])('rejects pageSize %p', async (pageSize) => {
  const errors = await validate(plainToInstance(PresenceHistoryQueryDto, {
    from: '2026-08-01T03:00:00.000Z', to: '2026-08-02T03:00:00.000Z', pageSize,
  }));
  expect(errors).not.toHaveLength(0);
});
```

- [ ] **Step 2: Implement DTO transformation without accepting ambiguous dates**

Require complete ISO 8601 timestamps with timezone (`Z` or explicit offset). Parse once in `PresenceQueryService`; reject malformed bounds, `from >= to`, minute spans over 90 days, daily spans over 24 calendar months, and `from` earlier than the corresponding retention cutoff derived from the injected `Clock`. Use `BadRequestException` messages naming the violated constraint.

- [ ] **Step 3: Write failing overview and history service tests**

Cover no samples, fresh sample at exactly 120 seconds, stale sample above 120 seconds, today's peak, overall peak, and zero fallbacks. Verify history calls repository with `gte: from`, `lt: to`, `skip: (page - 1) * pageSize`, and `take: pageSize`.

```ts
expect(await service.getOverview()).toEqual({
  status: 'DEGRADED',
  timezone: 'America/Sao_Paulo',
  heartbeatIntervalSeconds: 60,
  onlineWindowSeconds: 120,
  lastCollectedAt: null,
  onlineNow: 0,
  registeredParticipants: 0,
  newRegistrationsToday: 0,
  uniqueLoginsToday: 0,
  todayPeak: {
    onlineParticipants: 0, observedAt: null, registeredParticipantsAtPeak: 0,
  },
  overallPeak: {
    onlineParticipants: 0, observedAt: null, registeredParticipantsAtPeak: 0,
  },
});
```

- [ ] **Step 4: Add repository reads and implement response mapping**

Add repository methods for latest sample, today's summary, overall highest daily summary ordered by peak desc/peakAt asc, and paginated minute/daily rows. Minute rows query `bucket >= from AND bucket < to`. Daily rows convert both instant bounds with `ceilOperationalDateUtc` and query `operationalDate >= dailyFrom AND operationalDate < dailyTo`; this includes exactly those operational-day bucket starts inside `[from,to)`, even for partial-day input. Return these effective normalized bounds in `period`. Map every `Date` to ISO UTC strings in JSON. Daily `operationalDate` must serialize as `YYYY-MM-DD`, not midnight shifted by the server timezone.

- [ ] **Step 5: Implement a separate protected controller**

```ts
@ApiTags('Admin Presence')
@ApiSecurity('access-token-cookie')
@Controller('admin/presence')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPresenceController {
  @Get('overview') overview() { return this.queries.getOverview(); }
  @Get('history') history(@Query() query: PresenceHistoryQueryDto) {
    return this.queries.getHistory(query);
  }
}
```

Import `PresenceModule` into `AdminModule`, register the controller, and export only the query/CSV services needed by admin. GET requests inherit the current CSRF guard behavior and do not require a CSRF header.

- [ ] **Step 6: Add E2E authorization and range coverage**

Seed minute/daily aggregates directly, then prove unauthenticated and participant sessions receive 401/403, admin receives 200, stale overview says `DEGRADED`, `[from,to)` excludes exactly-at-`to`, invalid/oversized ranges return 400, and pagination metadata is stable.

- [ ] **Step 7: Run focused unit and E2E tests**

Run:

```bash
npm --workspace api test -- --runTestsByPath src/admin/specs/presence-history-query.dto.spec.ts src/presence/specs/presence-query.service.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-presence.e2e-spec.ts
```

Expected: all tests PASS and no response contains `userId`, `jti`, CPF, or email.

- [ ] **Step 8: Commit presence read APIs**

```bash
git add apps/api/src/presence apps/api/src/admin apps/api/test/admin-presence.e2e-spec.ts
git commit -m "feat: expose admin presence metrics"
```

---

### Task 10: Add Aggregate-Only CSV Export

**Files:**
- Modify: `apps/api/src/common/operational-time.ts`
- Modify: `apps/api/src/common/specs/operational-time.spec.ts`
- Create: `apps/api/src/presence/presence-csv.service.ts`
- Create: `apps/api/src/presence/specs/presence-csv.service.spec.ts`
- Modify: `apps/api/src/presence/presence-query.service.ts`
- Modify: `apps/api/src/presence/presence.module.ts`
- Modify: `apps/api/src/admin/admin-presence.controller.ts`
- Modify: `apps/api/test/admin-presence.e2e-spec.ts`

**Interfaces:**
- `GET /admin/presence/export.csv` reuses the history period/granularity validation without pagination.
- CSV begins with UTF-8 BOM, uses `;`, CRLF, deterministic filename, aggregate columns only, and São Paulo offsets.

- [ ] **Step 1: Write failing serializer tests for minute and daily rows**

```ts
expect(csv.charCodeAt(0)).toBe(0xfeff);
expect(csv).toContain(
  'inicio_periodo;participantes_online;participantes_cadastrados;pico_observado_em;ultima_coleta_em\r\n',
);
expect(csv).toContain('2026-08-21T12:00:00-03:00;150;160;');
expect(csv).not.toMatch(/cpf|email|userId|jti/i);
```

Also cover daily headers, semicolon/quote/newline escaping, empty export (header only), and a fixed Brasília offset produced from an input UTC timestamp.

- [ ] **Step 2: Run focused CSV/time tests and confirm missing behavior**

Run: `npm --workspace api test -- --runTestsByPath src/presence/specs/presence-csv.service.spec.ts src/common/specs/operational-time.spec.ts`

Expected: FAIL because the serializer/offset formatter does not exist.

- [ ] **Step 3: Add an explicit operational offset formatter**

Export `formatOperationalDateTime(date): string` using `Intl.DateTimeFormat('en-CA', { timeZone: OPERATIONAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' })`, normalize `GMT-03:00` to `-03:00`, and return `YYYY-MM-DDTHH:mm:ss-03:00`. Keep this formatter covered by fixed winter/summer dates even though São Paulo currently has no daylight-saving transition.

- [ ] **Step 4: Implement a streaming-safe bounded export service**

Validate the interval through the same query-service method as history, then fetch all aggregate rows in deterministic ascending order. The maximum windows cap the result to about 129,600 minute rows or 730 daily rows; serialize only known scalar fields through a dedicated `escapeCsvCell()`.

```ts
const MINUTE_HEADERS = [
  'inicio_periodo',
  'participantes_online',
  'participantes_cadastrados',
  'pico_observado_em',
  'ultima_coleta_em',
] as const;
```

Do not accept arbitrary column names or stringify ORM objects.

- [ ] **Step 5: Return exact download headers from the controller**

Use `@Res({ passthrough: true }) response: Response`, set `Content-Type: text/csv; charset=utf-8`, and:

```ts
const filename = `presenca-${query.granularity}-${period.fromDate}-${period.toDate}.csv`;
response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
return csv;
```

The filename dates come from validated normalized bounds and contain only ASCII digits/hyphens.

- [ ] **Step 6: Extend E2E export checks**

Assert status/headers/BOM/delimiter, ascending rows, exact `[from,to)` filtering, participant forbidden, and a scan for forbidden individual fields. Verify adjacent downloads do not duplicate the shared boundary row.

- [ ] **Step 7: Run focused and E2E export tests**

Run:

```bash
npm --workspace api test -- --runTestsByPath src/presence/specs/presence-csv.service.spec.ts src/common/specs/operational-time.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-presence.e2e-spec.ts
```

Expected: all tests PASS; decoded CSV contains aggregate data only.

- [ ] **Step 8: Commit CSV export**

```bash
git add apps/api/src/common apps/api/src/presence apps/api/src/admin/admin-presence.controller.ts apps/api/test/admin-presence.e2e-spec.ts
git commit -m "feat: export aggregate presence metrics"
```

---

### Task 11: Send Participant Heartbeats from the Authenticated Shell

**Files:**
- Create: `apps/web/src/features/presence/presence.service.ts`
- Create: `apps/web/src/hooks/use-presence-heartbeat.ts`
- Create: `apps/web/src/hooks/use-presence-heartbeat.spec.tsx`
- Modify: `apps/web/src/components/semcomp/participant-shell.tsx`
- Modify: `apps/web/src/components/semcomp/participant-shell.spec.tsx`

**Interfaces:**
- `sendHeartbeat(): Promise<void>` calls `POST /auth/heartbeat` through the existing CSRF-aware client.
- `usePresenceHeartbeat()` sends once on mount, repeats every 60 seconds in background, stays quiet on transient errors, and redirects on 401.
- Unmount cancels the query timer; closing a page never calls logout.

- [ ] **Step 1: Write fake-timer heartbeat tests**

```tsx
it('sends immediately and every 60 seconds, including background mode', async () => {
  vi.useFakeTimers();
  renderHeartbeatHook();
  await waitFor(() => expect(sendHeartbeat).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(120_000);
  expect(sendHeartbeat).toHaveBeenCalledTimes(3);
});

it('stops after unmount and does not logout on a transient failure', async () => {
  sendHeartbeat.mockRejectedValueOnce(new ApiError('indisponível', 503));
  const { unmount } = renderHeartbeatHook();
  await flushPromises();
  unmount();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(logout).not.toHaveBeenCalled();
  expect(sendHeartbeat).toHaveBeenCalledTimes(1);
});
```

Add a 401 case expecting `clearCsrfToken()` and `router.replace('/login')`, and prove no toast is emitted.

- [ ] **Step 2: Run the hook tests and confirm the hook is missing**

Run: `npm --workspace web test -- src/hooks/use-presence-heartbeat.spec.tsx`

Expected: FAIL because the service and hook do not exist.

- [ ] **Step 3: Implement the mutation request and query timer**

```ts
export async function sendHeartbeat() {
  await apiFetch<void>('/auth/heartbeat', { method: 'POST' });
  return true;
}

export function usePresenceHeartbeat() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['presence', 'heartbeat'],
    queryFn: sendHeartbeat,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      clearCsrfToken();
      router.replace('/login');
    }
  }, [query.error, router]);
}
```

Return a non-undefined sentinel from the query function because TanStack Query data cannot be `undefined`. Do not expose timer/error UI.

- [ ] **Step 4: Mount the hook exactly once per participant shell**

Call `usePresenceHeartbeat()` at the top of `ParticipantShell`; the shell is already a client component rendered only after the authenticated participant is loaded. Do not mount it in admin layouts or public auth pages.

- [ ] **Step 5: Run hook/shell tests and web checks**

Run:

```bash
npm --workspace web test -- src/hooks/use-presence-heartbeat.spec.tsx src/components/semcomp/participant-shell.spec.tsx
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: tests and typecheck PASS; unmount leaves no pending heartbeat call.

- [ ] **Step 6: Commit participant heartbeat**

```bash
git add apps/web/src/features/presence/presence.service.ts apps/web/src/hooks apps/web/src/components/semcomp/participant-shell.tsx apps/web/src/components/semcomp/participant-shell.spec.tsx
git commit -m "feat: send participant presence heartbeats"
```

---

### Task 12: Add Independent Presence Monitoring to the Admin Dashboard

**Files:**
- Create: `apps/web/src/features/presence/presence.types.ts`
- Modify: `apps/web/src/features/presence/presence.service.ts`
- Create: `apps/web/src/lib/http/download.ts`
- Create: `apps/web/src/lib/http/download.spec.ts`
- Create: `apps/web/src/app/admin/_components/presence-panel.tsx`
- Create: `apps/web/src/app/admin/_components/presence-panel.spec.tsx`
- Create: `apps/web/src/app/admin/_components/presence-history.tsx`
- Create: `apps/web/src/app/admin/_components/presence-history.spec.tsx`
- Modify: `apps/web/src/app/admin/dashboard-client.tsx`
- Modify: `apps/web/src/app/admin/dashboard-client.spec.tsx`

**Interfaces:**
- `fetchPresenceOverview()` polls independently every 30 seconds.
- `fetchPresenceHistory(filters)` and `downloadPresenceCsv(filters)` share one `PresenceFilters` encoder.
- Dashboard displays accessible current cards, degraded banner, historical table, pagination, and aggregate CSV download.

- [ ] **Step 1: Define frontend contracts identical to the API**

```ts
export type PresenceFilters = {
  from: string;
  to: string;
  granularity: 'minute' | 'daily';
};

export type PresenceOverview = {
  status: 'LIVE' | 'DEGRADED';
  timezone: 'America/Sao_Paulo';
  heartbeatIntervalSeconds: 60;
  onlineWindowSeconds: 120;
  lastCollectedAt: string | null;
  onlineNow: number;
  registeredParticipants: number;
  newRegistrationsToday: number;
  uniqueLoginsToday: number;
  todayPeak: PresencePeak;
  overallPeak: PresencePeak;
};
```

Define discriminated minute/daily history item types and the existing pagination shape rather than using `unknown` or type assertions in components.

- [ ] **Step 2: Write failing service/download tests**

Assert overview path, history query encoding, and that CSV download uses the exact same `from`, `to`, and `granularity`. The download helper must use `credentials: 'include'`, parse API error messages, derive the filename from `Content-Disposition`, create/revoke one object URL, and never parse the CSV as JSON.

- [ ] **Step 3: Implement query and download services**

Centralize:

```ts
function presenceParams(filters: PresenceFilters) {
  return new URLSearchParams({
    from: filters.from,
    to: filters.to,
    granularity: filters.granularity,
  });
}
```

`download.ts` may expose `downloadResponse(path, fallbackFilename)` but must reuse the same configured API base URL behavior as `request.ts`. Move/export the normalized API URL from one shared location if necessary instead of creating divergent defaults.

- [ ] **Step 4: Write failing overview panel tests**

Cover `LIVE`, `DEGRADED`, no collection timestamp, loading, error/retry, and background refresh. Assert the visible copy states "janela de 2 minutos" and stale data never receives the live indicator.

- [ ] **Step 5: Implement a self-contained presence query panel**

```ts
const presenceQuery = useQuery({
  queryKey: ['admin', 'presence', 'overview'],
  queryFn: fetchPresenceOverview,
  refetchInterval: 30_000,
  refetchIntervalInBackground: true,
  retry: false,
});
```

Render cards for online now, today's/overall peak with observation time, registered at peak, new registrations today, and unique logins today. The panel owns its loading/error/retry state so `DashboardClient`'s existing dashboard query can still render when presence fails.

- [ ] **Step 6: Write failing history/filter tests**

Use a default operational range of the last seven days, daily granularity, page 1, and page size 50. Test filter application, minute/daily columns, empty/error/retry states, next/previous pagination, and that download receives the currently applied—not partially typed—filters.

- [ ] **Step 7: Implement accessible history and CSV controls**

Use labeled `date` inputs for daily granularity and `datetime-local` inputs for minute granularity, a labeled granularity select, a real `<table>` with `<caption>` and header scopes, and buttons with pending/disabled states. Convert values as São Paulo time—not the browser's timezone—to explicit-offset ISO bounds; daily date bounds map to local midnight so their buckets are not dropped by normalization. Reset page to 1 when filters are applied. Keep the download query free of `page`/`pageSize`.

- [ ] **Step 8: Compose presence below the existing dashboard without coupling queries**

Add `<PresencePanel />` and `<PresenceHistory />` to `dashboard-client.tsx` after the existing operational sections. Do not merge the presence fetch into `fetchAdminDashboard()` or gate existing cards on it.

- [ ] **Step 9: Run frontend presence/dashboard tests and checks**

Run:

```bash
npm --workspace web test -- src/lib/http/download.spec.ts src/app/admin/_components/presence-panel.spec.tsx src/app/admin/_components/presence-history.spec.tsx src/app/admin/dashboard-client.spec.tsx
npm --workspace web run lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: tests, lint, and typecheck PASS; presence failure leaves existing dashboard metrics visible.

- [ ] **Step 10: Commit admin presence UI**

```bash
git add apps/web/src/features/presence apps/web/src/lib/http apps/web/src/app/admin
git commit -m "feat: show presence metrics in admin dashboard"
```

---

### Task 13: Update the 150-Participant Rehearsal, CI, Roadmap, and Final Verification

**Files:**
- Modify: `scripts/load/marco-9-load.mjs`
- Create: `scripts/load/marco-11-load.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/plan.md`
- Modify: `docs/plano-fase.md`
- Modify: `apps/api/README.md`
- Modify: `apps/web/README.md`
- Modify: `apps/api/.env.example`
- Modify: `.env.example`

**Interfaces:**
- Rehearsal registers and logs in 150 password-bearing participants, holds their sessions, heartbeats every 60 seconds, and verifies the aggregate count through the admin endpoint.
- Reports contain latency/status/resource aggregates but no participant/admin identifiers, password, cookie, CSRF, or JWT.
- CI runs the new auth/presence contract tests and labels images for Marco 11.

- [ ] **Step 1: Write failing load-script contract tests**

Use `node:test` with a stub HTTP server or exported request adapter. Assert registration sends `password`, participant login sends only email/password, each authenticated session heartbeats, a duplicate heartbeat for a person does not change expected participant cardinality, report schema includes heartbeat stats, and all generated password/session material is rejected by the sensitive-value scan.

```js
assert.equal(report.thresholds.expectedOnlineParticipants, 150);
assert.equal(report.thresholds.observedOnlineParticipants, 150);
assert.equal(report.operations.heartbeat.errors, 0);
assert.doesNotMatch(JSON.stringify(report), /participant-password|csrf|connect\.sid/i);
```

- [ ] **Step 2: Run script syntax/contracts and observe old auth behavior**

Run:

```bash
node --check scripts/load/marco-9-load.mjs
node --test scripts/load/cpf.test.mjs scripts/load/marco-11-load.test.mjs
```

Expected: new contract test FAIL because the script still registers/logs in with CPF/email and has no heartbeat scenario.

- [ ] **Step 3: Extend the rehearsal without leaking deterministic credentials**

Generate a valid per-participant test password in memory, add it to `sensitiveValues`, send it at registration, explicitly log out and back in with email/password so both flows are exercised, then blank it in `discardSessionMaterial()`. Add a heartbeat operation every 60 seconds for at least two intervals; use the existing concurrency limit and CSRF/origin headers.

After the collector has had a bounded opportunity to run, poll `/admin/presence/overview` with the admin session until fresh or timeout. Require `onlineNow === config.participants`, no valid heartbeat `429`, no duplicate presence bucket in an admin history query, and the existing CPU/memory/connection/error/latency thresholds. Rename the default report to `artifacts/marco-11-load-report.json` and bump its schema version.

- [ ] **Step 4: Update CI contract coverage**

Add the new Node load test and add the Task 2/4/7–10 focused contracts to the authentication/rate-limit contract step. Retain the existing `password-policy.spec.ts` because it protects the separate administrator policy. Keep the full unit, E2E, lint, and build jobs. Rename Docker tags from `marco9` to `marco11`; do not add AWS credentials or a live load run to CI.

- [ ] **Step 5: Reconcile operational documentation with the approved cutover**

In `docs/plan.md` and `docs/plano-fase.md`, replace every forward-looking claim that participants use CPF/email without password—including Marco 14—with email/password, while preserving CPF as required profile/registration data. Document the 8/64/72 participant policy, no recovery in this phase, persistent `jti`, heartbeat windows, retention, aggregate post-event CSV, and that Marco 12 still owns individual-domain exports. Add local environment/rehearsal instructions without embedding a participant production password.

- [ ] **Step 6: Run the complete automated verification**

Run:

```bash
npm --workspace api run prisma:validate
npm --workspace api run prisma:generate
npm --workspace api run lint:check
npm --workspace api test
npm --workspace api run test:e2e
npm --workspace api run build
npm --workspace web run lint
npm --workspace web test
npx tsc --noEmit -p apps/web/tsconfig.json
npm --workspace web run build
node --test scripts/load/cpf.test.mjs scripts/load/marco-11-load.test.mjs
node --check scripts/load/marco-9-load.mjs
git diff --check
```

Expected: every command exits 0. E2E requires the disposable test PostgreSQL with the new migration applied; never reset a non-disposable database.

- [ ] **Step 7: Execute the reduced local rehearsal and inspect evidence**

With local disposable API/web/PostgreSQL running, execute a reduced cohort first:

```bash
$env:LOAD_REDUCED='true'
$env:LOAD_HEARTBEAT_WINDOW_MS='130000'
node scripts/load/marco-9-load.mjs
```

Expected: report passes, heartbeat count is non-zero, observed online equals requested participants, no valid request gets 429, and the report contains no sensitive values. Review the JSON without committing `artifacts/`.

- [ ] **Step 8: Perform the Marco 11 acceptance review**

Manually verify in a disposable pre-event environment: participant registration immediately enters `/home`; old CPF/email participant login fails; admin login remains CPF/email/password; two tabs for one participant produce online count 1; logout/deactivation invalidates only persisted sessions; stale collection shows `DEGRADED`; minute/daily history and CSV agree at `[from,to)` boundaries; CSV opens correctly in a pt-BR spreadsheet and has no individual fields.

- [ ] **Step 9: Commit operations and documentation**

```bash
git add scripts/load/marco-9-load.mjs scripts/load/marco-11-load.test.mjs .github/workflows/ci.yml docs/plan.md docs/plano-fase.md apps/api/README.md apps/web/README.md apps/api/.env.example .env.example
git commit -m "chore: complete marco 11 operational validation"
```

---

## Definition of Done

- Participant registration is atomic and creates an authenticated persisted session; participant login is email/password only and CPF remains required/unique user data.
- Participant password policy is exactly 8–64 Unicode characters and at most 72 UTF-8 bytes, without composition requirements; admin policy remains unchanged.
- Every JWT has a validated persisted `jti`; logout, expiry, and deactivation end the appropriate sessions.
- Heartbeat and collection produce distinct participant presence, minute samples, daily/overall peaks, registration/login counts, and no behavioral or individual export data.
- Scheduler, concurrent upserts, retention, operational timezone, degraded-state logic, history bounds, pagination, and CSV format are covered by deterministic tests.
- Participant and admin frontends expose independent heartbeat/presence behavior with accessible loading/error/empty/retry states.
- The 150-participant rehearsal meets Marco 9 resource/latency/rate-limit limits while reporting exactly 150 distinct online participants.
- Prisma validation/generation, lint, unit tests, E2E, typecheck, builds, load-script contracts, and `git diff --check` all pass.

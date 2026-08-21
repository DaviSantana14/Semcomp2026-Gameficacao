# Marco 11 Auth and Daily Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace participant CPF/email login with email/password and deliver persisted sessions, heartbeat presence, daily/general operational summaries, and one aggregate post-event CSV.

**Architecture:** `UserSession.id` is also the JWT `jti`; one `PresenceDailySummary` row per São Paulo day stores the latest observation and preserves that day's peak. A minute cron updates that row atomically, while the admin API derives daily and general views without minute samples, pagination, or multiple granularities.

**Tech Stack:** NestJS 11, Prisma ORM 7.8, PostgreSQL 16, bcrypt 6, `@nestjs/schedule`, Next.js 16, React 19, TanStack Query 5, React Hook Form, Zod 4, Vitest 4, Jest 30.

## Global Constraints

- Operational timezone is exactly `America/Sao_Paulo`; timestamps persist in UTC and operational dates use PostgreSQL `date`.
- Participant login is email + password only; CPF remains required, normalized, unique user data and never acts as a credential.
- Participant passwords accept any Unicode characters and spaces, with 8–64 Unicode code points and at most 72 UTF-8 bytes; impose no composition rule and do not trim.
- Administrator login remains CPF + email + password with its existing 12–64-character and 72-byte policy.
- Use bcrypt v6 asynchronous APIs, automatic salt, cost 12, and exactly one real-or-dummy comparison for every authentication attempt.
- JWT/cookie duration remains 8 hours; `UserSession.id` is a random UUID and the exact JWT `jti`.
- Heartbeat interval is 60 seconds; online window is 120 seconds; count distinct active participant users and exclude administrators.
- Persist one daily summary only; there is no `PresenceSample`, minute history, `granularity`, or presence pagination.
- Retain ended/expired sessions for 30 days and daily summaries for 24 months.
- CSV contains one `GERAL` row plus filtered `DIARIO` rows, uses UTF-8 BOM, `;`, CRLF, and no individual identifiers.
- Heartbeat and collection never create `AdminAuditEvent` or `PointEvent` and never retain navigation, IP, user-agent, or typed content.
- Password recovery, legacy participant login, MFA, Redis, workers, behavioral analytics, and sophisticated charts are out of scope.
- Follow TDD: focused failing test, observed failure, minimal implementation, focused pass, and small commit.

## File Structure

- `apps/api/prisma/schema/users.prisma`: user/session relation and `UserSession`.
- `apps/api/prisma/schema/presence.prisma`: sole daily aggregate model.
- `apps/api/src/auth/password-hash.ts`: pure bcrypt mechanics and dummy constants.
- `apps/api/src/auth/participant-password-policy.ts`: exact 8/64/72 policy.
- `apps/api/src/auth/participant-password.service.ts`: participant role/policy verification.
- `apps/api/src/presence/sessions.repository.ts`: transaction-safe session persistence.
- `apps/api/src/presence/sessions.service.ts`: session lifecycle consumed by auth.
- `apps/api/src/presence/presence.repository.ts`: counts, daily upsert, reads, retention.
- `apps/api/src/presence/presence.service.ts`: collection, overview, daily history, export data.
- `apps/api/src/presence/presence-scheduler.service.ts`: minute collection and daily cleanup wrappers.
- `apps/api/src/presence/presence-csv.ts`: pure mixed-row CSV serializer.
- `apps/api/src/common/operational-time.ts`: São Paulo date boundaries and offset formatting.
- `apps/api/src/admin/admin-presence.controller.ts`: protected overview/history/export endpoints.
- `apps/web/src/hooks/use-presence-heartbeat.ts`: immediate `useEffect` heartbeat plus 60-second timer.
- `apps/web/src/features/presence/*`: frontend contracts, admin reads, and CSV download.
- `apps/web/src/app/admin/_components/presence-panel.tsx`: independent current/general overview.
- `apps/web/src/app/admin/_components/presence-history.tsx`: daily filters, table, and export.

---

### Task 1: Add the Minimal Session and Daily-Summary Schema

**Files:**
- Modify: `apps/api/prisma/schema/users.prisma`
- Create: `apps/api/prisma/schema/presence.prisma`
- Create: `apps/api/prisma/migrations/20260821120000_add_sessions_daily_presence/migration.sql`
- Create: `apps/api/src/common/specs/presence-schema-migration.spec.ts`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `UserSession`, `SessionEndReason`, and `PresenceDailySummary` for all later backend tasks.
- `UserSession.id` is the only session identifier and `PresenceDailySummary.operationalDate` is the only aggregate key.

- [ ] **Step 1: Write the failing migration contract test**

```ts
it('creates only session and daily summary persistence', () => {
  expect(sql).toContain('CREATE TABLE "UserSession"');
  expect(sql).toContain('CREATE TABLE "PresenceDailySummary"');
  expect(sql).not.toContain('PresenceSample');
  expect(sql).toContain('PRIMARY KEY ("operationalDate")');
  expect(sql).toContain('ON DELETE RESTRICT');
});

it('does not duplicate the session id as a jti column', () => {
  expect(sql).not.toMatch(/\"jti\"/);
  expect(sql).toContain('PRIMARY KEY ("id")');
});
```

- [ ] **Step 2: Run it and observe the missing migration**

Run: `npm --workspace api test -- --runTestsByPath src/common/specs/presence-schema-migration.spec.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the exact Prisma models**

```prisma
enum SessionEndReason {
  LOGOUT
  EXPIRED
  REVOKED
}

model UserSession {
  id         String            @id
  userId     String
  user       User              @relation(fields: [userId], references: [id], onDelete: Restrict)
  startedAt  DateTime
  lastSeenAt DateTime
  expiresAt  DateTime
  endedAt    DateTime?
  endReason  SessionEndReason?

  @@index([userId, lastSeenAt])
  @@index([endedAt, expiresAt])
  @@index([lastSeenAt])
  @@index([startedAt])
}

model PresenceDailySummary {
  operationalDate                         DateTime @id @db.Date
  lastObservedOnlineParticipants          Int
  registeredParticipantsAtLastObservation Int
  lastCollectedAt                         DateTime
  peakOnlineParticipants                  Int
  peakAt                                  DateTime?
  registeredParticipantsAtPeak            Int
  uniqueParticipantLogins                 Int
  newParticipantRegistrations             Int
  createdAt                               DateTime @default(now())
  updatedAt                               DateTime @updatedAt
}
```

Add `sessions UserSession[]` and `@@index([role, createdAt])` to `User`. The SQL migration must match the schema, add no `jti`, create no minute table, and contain no user update/delete.

- [ ] **Step 4: Install scheduling and validate the schema**

```bash
npm --workspace api install @nestjs/schedule
npm --workspace api run prisma:validate
npm --workspace api run prisma:generate
npm --workspace api test -- --runTestsByPath src/common/specs/presence-schema-migration.spec.ts
```

Expected: validation/generation succeed and the focused test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src/common/specs/presence-schema-migration.spec.ts apps/api/package.json package-lock.json
git commit -m "feat: add session and daily presence schema"
```

---

### Task 2: Add Participant Passwords Without a Third Hashing Provider

**Files:**
- Create: `apps/api/src/auth/password-hash.ts`
- Create: `apps/api/src/auth/participant-password-policy.ts`
- Create: `apps/api/src/auth/participant-password.service.ts`
- Create: `apps/api/src/auth/specs/participant-password-policy.spec.ts`
- Create: `apps/api/src/auth/specs/participant-password.service.spec.ts`
- Modify: `apps/api/src/auth/admin-password.service.ts`
- Modify: `apps/api/src/auth/specs/admin-password.service.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Produces `hashPassword(password): Promise<string>` and `comparePassword(candidate, hash): Promise<boolean>` as pure functions.
- Produces `ParticipantPasswordService.hash(password)` and `verify(password, user)` while preserving `AdminPasswordService` public methods.

- [ ] **Step 1: Write the participant policy boundary tests**

```ts
it.each(['a'.repeat(8), ' '.repeat(8), 'senha livre', 'é'.repeat(8)])(
  'accepts free-form password %p',
  (password) => expect(() => validateParticipantPassword(password)).not.toThrow(),
);

it.each(['a'.repeat(7), 'a'.repeat(65), 'é'.repeat(37)])(
  'rejects character or UTF-8 byte overflow',
  (password) => expect(() => validateParticipantPassword(password))
    .toThrow(ParticipantPasswordValidationError),
);
```

- [ ] **Step 2: Run and observe the missing policy**

Run: `npm --workspace api test -- --runTestsByPath src/auth/specs/participant-password-policy.spec.ts`

Expected: FAIL because the policy module is missing.

- [ ] **Step 3: Implement exact 8/64/72 validation**

```ts
export function validateParticipantPassword(password: string) {
  const characters = Array.from(password).length;
  if (characters < 8 || characters > 64 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new ParticipantPasswordValidationError('Invalid participant password.');
  }
}
```

- [ ] **Step 4: Test the one-comparison rule**

```ts
it.each([
  null,
  { role: 'ADMIN', isActive: true, passwordHash: '$2b$12$x' },
  { role: 'PARTICIPANT', isActive: false, passwordHash: '$2b$12$x' },
  { role: 'PARTICIPANT', isActive: true, passwordHash: null },
])('compares exactly once for invalid state', async (user) => {
  jest.spyOn(passwordHash, 'comparePassword').mockResolvedValue(false);
  await expect(service.verify('senha123', user as never)).resolves.toBe(false);
  expect(passwordHash.comparePassword).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Implement pure bcrypt mechanics and role services**

```ts
export const BCRYPT_COST = 12;
export const DUMMY_PASSWORD = 'semcomp-dummy-password';
export const DUMMY_PASSWORD_HASH =
  '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const hashPassword = (password: string) => hash(password, BCRYPT_COST);
export const comparePassword = (candidate: string, digest: string) =>
  compare(candidate, digest);
```

Each role service validates without throwing during login, substitutes `DUMMY_PASSWORD` for an invalid candidate and `DUMMY_PASSWORD_HASH` for invalid user state, invokes `comparePassword` exactly once, and returns true only when policy, role, active state, hash, and comparison all pass. Register only the two role services in `AuthModule`; `password-hash.ts` is not injectable.

- [ ] **Step 6: Run password regressions**

Run: `npm --workspace api test -- --runTestsByPath src/auth/specs/participant-password-policy.spec.ts src/auth/specs/participant-password.service.spec.ts src/auth/specs/password-policy.spec.ts src/auth/specs/admin-password.service.spec.ts`

Expected: all participant and administrator policy/service tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat: add participant password authentication"
```

---

### Task 3: Cut Backend Authentication Over to Persisted Sessions

**Files:**
- Create: `apps/api/src/presence/sessions.repository.ts`
- Create: `apps/api/src/presence/sessions.service.ts`
- Create: `apps/api/src/presence/presence.module.ts`
- Create: `apps/api/src/presence/specs/sessions.service.spec.ts`
- Modify: `apps/api/src/auth/dto/register.dto.ts`
- Modify: `apps/api/src/auth/dto/login.dto.ts`
- Modify: `apps/api/src/auth/dto/admin-login.dto.ts`
- Create: `apps/api/src/auth/specs/auth-dto.spec.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/jwt.strategy.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/users/users.repository.ts`
- Modify: `apps/api/src/common/request-context.ts`
- Modify: `apps/api/src/security/rate-limit-key.ts`
- Modify: `apps/api/src/security/app-throttler.guard.ts`
- Modify: `apps/api/src/auth/specs/auth.service.spec.ts`
- Modify: `apps/api/src/auth/specs/auth.controller.spec.ts`
- Create: `apps/api/src/auth/specs/jwt-session.strategy.spec.ts`
- Modify: `apps/api/src/security/rate-limit-key.spec.ts`
- Modify: `apps/api/src/security/app-throttler.guard.spec.ts`
- Modify: `apps/api/prisma/seed-config.ts`
- Modify: `apps/api/src/prisma/seed-config.spec.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/test/support/admin-e2e-harness.ts`
- Modify: `apps/api/test/support/e2e-database-cleanup.ts`
- Modify: `apps/api/src/common/specs/e2e-database-cleanup.spec.ts`
- Modify: `apps/api/test/app.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- DTOs become register `{ name; cpf; email; password }`, participant login `{ email; password }`, admin login `{ cpf; email; password }`.
- Produces `SessionsService.registerParticipant`, `start(userId, role, draft)`, `validate(id, userId)`, `heartbeat`, `end`, `expire`, and `deleteRetained`.
- JWT/request identity becomes `{ id; role; csrfToken; jti }`, where `jti === UserSession.id`.

- [ ] **Step 1: Write failing DTO and session tests**

```ts
expect(plainToInstance(LoginDto, {
  email: ' ADA@EXAMPLE.COM ', password: '        ',
})).toMatchObject({ email: 'ada@example.com', password: '        ' });

expect(createSessionDraft(now)).toMatchObject({
  id: expect.any(String),
  startedAt: now,
  lastSeenAt: now,
  expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
});
```

Cover invalid/missing/ended/expired/wrong-owner sessions and verify participant login never queries by CPF.

- [ ] **Step 2: Run focused tests and observe old contracts**

Run: `npm --workspace api test -- --runTestsByPath src/auth/specs/auth-dto.spec.ts src/auth/specs/auth.service.spec.ts src/presence/specs/sessions.service.spec.ts`

Expected: FAIL because DTOs and persisted session services do not match.

- [ ] **Step 3: Implement transaction-safe session persistence**

```ts
export type SessionDraft = {
  id: string;
  startedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};
```

`registerParticipant` creates user + nested session + `lastLoginAt` atomically and maps Prisma `P2002` to a neutral persistence conflict. `start` uses one transaction: `updateMany({ id, role, isActive: true })`, rejects zero rows, then creates the session. `validate` joins the active user. `heartbeat`/`end` use `updateMany` constrained by id, userId, open state, and future expiry. Expiration uses parameterized SQL to set `endedAt = expiresAt` and `EXPIRED`.

- [ ] **Step 4: Implement DTOs, issuance, strategy, heartbeat, and logout**

```ts
const id = randomUUID();
const csrfToken = randomBytes(32).toString('base64url');
const payload = { sub: userId, csrfToken, jti: id };
const accessToken = await this.jwt.signAsync(payload, { expiresIn: '8h' });
```

Registration/login persist the session before the controller sets its cookie. `JwtStrategy` requires non-empty `sub`, CSRF, and `jti`, then calls `sessions.validate(jti, sub)`. Add `POST /auth/heartbeat` with JWT + CSRF + allowed-origin guards and 204. Logout ends the current session before clearing its cookie.

- [ ] **Step 5: Align rate limiting, seeds, cleanup, and E2E fixtures**

Participant credential HMAC input is `['v2', route, normalizedEmail, null]`; admin/register include normalized CPF. Passwords never enter keys/logs. Demo mode hashes a documented non-secret local participant password; admin-only/rehearsal embeds none. Cleanup deletes `PresenceDailySummary`, then `UserSession`, then users. E2E login sends email/password.

- [ ] **Step 6: Run focused and E2E auth regressions**

```bash
npm --workspace api test -- --runTestsByPath src/auth/specs/auth-dto.spec.ts src/auth/specs/auth.service.spec.ts src/auth/specs/auth.controller.spec.ts src/presence/specs/sessions.service.spec.ts src/security/rate-limit-key.spec.ts src/security/app-throttler.guard.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/app.e2e-spec.ts
```

Expected: registration authenticates in one request, legacy login is 400, generic invalid login is 401, heartbeat is protected, and logout invalidates JWT reuse.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/api/prisma/seed-config.ts apps/api/prisma/seed.ts apps/api/test
git commit -m "feat: persist participant and admin sessions"
```

---

### Task 4: Update Participant Authentication Forms

**Files:**
- Modify: `apps/web/src/features/auth/auth.types.ts`
- Modify: `apps/web/src/features/auth/auth.service.ts`
- Modify: `apps/web/src/app/login/login-form.tsx`
- Modify: `apps/web/src/app/login/login-form.spec.tsx`
- Modify: `apps/web/src/app/cadastro/register-form.tsx`
- Create: `apps/web/src/app/cadastro/register-form.spec.tsx`
- Modify: `apps/web/src/app/login/admin/admin-login-form.spec.tsx`

**Interfaces:**
- `LoginPayload = { email; password }`, `RegisterPayload = { name; cpf; email; password }`, and independent `AdminLoginPayload = { cpf; email; password }`.
- `register()` returns `LoginResponse`, stores CSRF, and replaces the former register-then-login sequence.

- [ ] **Step 1: Write failing form tests**

```tsx
await user.type(screen.getByLabelText(/^e-?mail$/i), 'ada@example.com');
await user.type(screen.getByLabelText(/^senha$/i), '        ');
await user.click(screen.getByRole('button', { name: /entrar/i }));
expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: '        ' });
expect(screen.queryByLabelText(/^cpf$/i)).not.toBeInTheDocument();
```

Registration test fills name/CPF/email/password/confirmation, expects only `register`, CSRF storage, and `/home`; confirmation never enters payload. Assert no recovery link and preserve admin's 12-character minimum.

- [ ] **Step 2: Run and observe old CPF/register-login behavior**

Run: `npm --workspace web test -- src/app/login/login-form.spec.tsx src/app/cadastro/register-form.spec.tsx src/app/login/admin/admin-login-form.spec.tsx`

Expected: FAIL on the old participant fields and second login request.

- [ ] **Step 3: Implement matching Zod and payload contracts**

```ts
const participantPassword = z.string()
  .refine((value) => Array.from(value).length >= 8, 'Use pelo menos 8 caracteres.')
  .refine((value) => Array.from(value).length <= 64, 'Use no máximo 64 caracteres.')
  .refine((value) => new TextEncoder().encode(value).length <= 72,
    'A senha ultrapassa o limite de 72 bytes.');
```

Do not trim passwords. Use `new-password` for registration and `username`/`current-password` for login. Explain that automatic recovery is unavailable. Successful registration stores returned CSRF and redirects directly.

- [ ] **Step 4: Run frontend auth checks**

```bash
npm --workspace web test -- src/app/login/login-form.spec.tsx src/app/cadastro/register-form.spec.tsx src/app/login/admin/admin-login-form.spec.tsx
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: tests/typecheck pass and participant login contains no CPF.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth apps/web/src/app/login apps/web/src/app/cadastro
git commit -m "feat: use email and password for participants"
```

---

### Task 5: Collect One Atomic Daily Presence Summary

**Files:**
- Create: `apps/api/src/common/operational-time.ts`
- Create: `apps/api/src/common/specs/operational-time.spec.ts`
- Modify: `apps/api/src/ranking/ranking.service.ts`
- Create: `apps/api/src/presence/presence.repository.ts`
- Create: `apps/api/src/presence/presence.service.ts`
- Create: `apps/api/src/presence/presence-scheduler.service.ts`
- Create: `apps/api/src/presence/specs/presence.service.spec.ts`
- Create: `apps/api/src/presence/specs/presence-scheduler.service.spec.ts`
- Modify: `apps/api/src/presence/presence.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/admin/admin-participants.repository.ts`
- Modify: `apps/api/src/admin/admin-participants.service.ts`
- Create: `apps/api/test/presence-daily.e2e-spec.ts`

**Interfaces:**
- Produces `OPERATIONAL_TIME_ZONE`, `startOfOperationalDayUtc`, `operationalDateUtc`, `addUtcDays`, `addUtcMonths`, and `formatOperationalDateTime`.
- Produces `PresenceService.collect(now)`, `getOverview(now)`, `getDailyHistory(range)`, and `deleteRetained(now)`.

- [ ] **Step 1: Write timezone and daily-collection tests**

```ts
it.each([
  ['2026-08-21T02:59:59.999Z', '2026-08-20T03:00:00.000Z'],
  ['2026-08-21T03:00:00.000Z', '2026-08-21T03:00:00.000Z'],
])('finds São Paulo day start', (input, expected) => {
  expect(startOfOperationalDayUtc(new Date(input)).toISOString()).toBe(expected);
});

it('updates latest values but preserves the strictly greater peak', async () => {
  await service.collect(new Date('2026-08-21T15:00:05.000Z'));
  expect(repository.upsertDailySummary).toHaveBeenCalledWith(expect.objectContaining({
    operationalDate: new Date('2026-08-21T00:00:00.000Z'),
    observedAt: new Date('2026-08-21T15:00:05.000Z'),
  }));
});
```

Cover duplicate sessions, cutoff equality, admin/inactive exclusion, inactive inclusion in registered totals, and distinct daily participant logins.

- [ ] **Step 2: Run and observe missing presence implementation**

Run: `npm --workspace api test -- --runTestsByPath src/common/specs/operational-time.spec.ts src/presence/specs/presence.service.spec.ts`

Expected: FAIL because time helpers and presence service do not exist.

- [ ] **Step 3: Implement shared time helpers and refactor ranking**

Move ranking's existing `Intl.DateTimeFormat` timezone conversion into `operational-time.ts`. `operationalDateUtc(now)` returns UTC midnight carrying the São Paulo calendar date; `formatOperationalDateTime` returns `YYYY-MM-DDTHH:mm:ss-03:00`. Ranking outputs remain unchanged.

- [ ] **Step 4: Implement counts and the single daily upsert**

```sql
ON CONFLICT ("operationalDate") DO UPDATE SET
  "lastObservedOnlineParticipants" = EXCLUDED."lastObservedOnlineParticipants",
  "registeredParticipantsAtLastObservation" = EXCLUDED."registeredParticipantsAtLastObservation",
  "lastCollectedAt" = GREATEST("PresenceDailySummary"."lastCollectedAt", EXCLUDED."lastCollectedAt"),
  "peakOnlineParticipants" = GREATEST("PresenceDailySummary"."peakOnlineParticipants", EXCLUDED."peakOnlineParticipants"),
  "peakAt" = CASE WHEN EXCLUDED."peakOnlineParticipants" > "PresenceDailySummary"."peakOnlineParticipants" THEN EXCLUDED."peakAt" ELSE "PresenceDailySummary"."peakAt" END,
  "registeredParticipantsAtPeak" = CASE WHEN EXCLUDED."peakOnlineParticipants" > "PresenceDailySummary"."peakOnlineParticipants" THEN EXCLUDED."registeredParticipantsAtPeak" ELSE "PresenceDailySummary"."registeredParticipantsAtPeak" END,
  "uniqueParticipantLogins" = GREATEST("PresenceDailySummary"."uniqueParticipantLogins", EXCLUDED."uniqueParticipantLogins"),
  "newParticipantRegistrations" = GREATEST("PresenceDailySummary"."newParticipantRegistrations", EXCLUDED."newParticipantRegistrations"),
  "updatedAt" = CURRENT_TIMESTAMP
```

Use tagged `$executeRaw`; interpolate values only as parameters. Online count filters role participant, active user, open/future session, and `lastSeenAt >= now - 120s`. Daily counts use `[dayStart, nextDayStart)`.

`PresenceService.collect(now)` first calls `sessions.expire(now)`, then obtains all counts from the same captured `now` and performs the upsert. `deleteRetained(now)` deletes sessions older than 30 days through `SessionsService` and daily summaries older than `addUtcMonths(operationalDateUtc(now), -24)` through `PresenceRepository`.

- [ ] **Step 5: Add safe schedules, retention, and revocation**

```ts
@Cron('5 * * * * *', { name: 'presence-minute', waitForCompletion: true })
async collectMinute() { await this.runSafely('presence_collection_failed', () => this.presence.collect(new Date())); }

@Cron('0 15 3 * * *', {
  name: 'presence-retention', timeZone: OPERATIONAL_TIME_ZONE, waitForCompletion: true,
})
async retain() { await this.runSafely('presence_retention_failed', () => this.presence.deleteRetained(new Date())); }
```

`runSafely` logs only event + random execution ID. Retention uses strict `<` cutoffs: sessions 30 days, summaries 24 months. Admin deactivation calls transaction-scoped `revokeOpenSessions(id, now)` before its audit write; reactivation never restores sessions.

- [ ] **Step 6: Prove concurrency in PostgreSQL**

Run two upserts for the same date with peaks 3 and 5; assert one row with peak 5 and matching fields. Run an equal later peak; assert first `peakAt` remains while latest observation advances. Assert deactivation invalidates the old JWT.

- [ ] **Step 7: Run focused and E2E checks**

```bash
npm --workspace api test -- --runTestsByPath src/common/specs/operational-time.spec.ts src/ranking/specs/ranking.service.spec.ts src/presence/specs/presence.service.spec.ts src/presence/specs/presence-scheduler.service.spec.ts src/admin/specs/admin-participants.service.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/presence-daily.e2e-spec.ts test/admin-participants.e2e-spec.ts
```

Expected: all pass; one row/day, correct peak/tie, correct timezone, and revoked session rejected.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/common apps/api/src/ranking apps/api/src/presence apps/api/src/admin apps/api/src/app.module.ts apps/api/test
git commit -m "feat: collect daily presence summaries"
```

---

### Task 6: Expose Daily/General Admin APIs and Mixed CSV

**Files:**
- Create: `apps/api/src/admin/admin-presence.controller.ts`
- Create: `apps/api/src/admin/dto/presence-date-range.dto.ts`
- Create: `apps/api/src/admin/dto/presence-response.dto.ts`
- Create: `apps/api/src/admin/specs/presence-date-range.dto.spec.ts`
- Create: `apps/api/src/presence/presence-csv.ts`
- Create: `apps/api/src/presence/specs/presence-csv.spec.ts`
- Modify: `apps/api/src/presence/presence.service.ts`
- Modify: `apps/api/src/presence/presence.module.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Create: `apps/api/test/admin-presence.e2e-spec.ts`

**Interfaces:**
- Exposes protected `overview`, `history?from=YYYY-MM-DD&to=YYYY-MM-DD`, and `export.csv` with the same date validation.
- Produces `serializePresenceCsv(general, daily): string` with one `GERAL` and zero-or-more `DIARIO` rows.

- [ ] **Step 1: Write failing date/overview tests**

```ts
expect(parsePresenceRange({ from: '2026-08-01', to: '2026-08-22' }, now))
  .toEqual({ from: new Date('2026-08-01T00:00:00.000Z'), to: new Date('2026-08-22T00:00:00.000Z') });
expect(() => parsePresenceRange({ from: '2026-08-22', to: '2026-08-01' }, now))
  .toThrow(BadRequestException);
```

Cover real calendar dates, exact `[from,to)`, 24-month maximum, retention cutoff, no-today-row degraded state, fresh/stale 120-second boundary, overall peak tie order, all-time participant login count via `lastLoginAt`, and monitored-day count.

- [ ] **Step 2: Implement daily/general reads and protected controller**

```ts
@Controller('admin/presence')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPresenceController {
  @Get('overview') overview() { return this.presence.getOverview(new Date()); }
  @Get('history') history(@Query() query: PresenceDateRangeDto) {
    return this.presence.getDailyHistory(parsePresenceRange(query, new Date()));
  }
}
```

History returns `{ period, timezone, items }` ordered ascending, with no pagination/granularity. Overview matches the approved `PresenceOverview` contract and never labels stale values live.

- [ ] **Step 3: Write failing mixed CSV tests**

```ts
expect(csv.charCodeAt(0)).toBe(0xfeff);
expect(csv).toContain('tipo;periodo;online_ultima_coleta;pico_online;');
expect(csv.match(/^GERAL;/gm)).toHaveLength(1);
expect(csv.match(/^DIARIO;/gm)).toHaveLength(2);
expect(csv).not.toMatch(/cpf|email|userId|jti/i);
```

Cover CRLF, semicolon/quote escaping, São Paulo offset, empty daily range with general row, and deterministic ascending days.

- [ ] **Step 4: Implement pure serialization and download response**

Use the exact approved 11-column header. General comes from all retained summaries/user totals; daily rows obey `[from,to)`. Controller sets `text/csv; charset=utf-8` and `attachment; filename="presenca-YYYY-MM-DD-a-YYYY-MM-DD.csv"`.

- [ ] **Step 5: Run unit and E2E API tests**

```bash
npm --workspace api test -- --runTestsByPath src/admin/specs/presence-date-range.dto.spec.ts src/presence/specs/presence.service.spec.ts src/presence/specs/presence-csv.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-presence.e2e-spec.ts
```

Expected: participant forbidden, admin accepted, bounds correct, CSV aggregated and private.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin apps/api/src/presence apps/api/test/admin-presence.e2e-spec.ts
git commit -m "feat: expose daily presence summaries"
```

---

### Task 7: Add a Plain Effect-Based Participant Heartbeat

**Files:**
- Create: `apps/web/src/features/presence/presence.service.ts`
- Create: `apps/web/src/hooks/use-presence-heartbeat.ts`
- Create: `apps/web/src/hooks/use-presence-heartbeat.spec.tsx`
- Modify: `apps/web/src/components/semcomp/participant-shell.tsx`
- Modify: `apps/web/src/components/semcomp/participant-shell.spec.tsx`

**Interfaces:**
- `sendHeartbeat(signal): Promise<void>` uses the CSRF-aware client.
- `usePresenceHeartbeat()` sends immediately, repeats every 60 seconds, prevents overlap, aborts on unmount, silently ignores transient errors, and redirects on 401.

- [ ] **Step 1: Write fake-timer lifecycle tests**

```tsx
renderHook(() => usePresenceHeartbeat());
await waitFor(() => expect(sendHeartbeat).toHaveBeenCalledTimes(1));
await vi.advanceTimersByTimeAsync(120_000);
expect(sendHeartbeat).toHaveBeenCalledTimes(3);
```

Cover in-flight overlap skip, abort/interval cleanup, no logout/toast on 503, and CSRF clear + `/login` redirect on 401.

- [ ] **Step 2: Implement the effect without React Query**

```ts
useEffect(() => {
  let inFlight = false;
  let controller: AbortController | undefined;
  const beat = async () => {
    if (inFlight) return;
    inFlight = true;
    controller = new AbortController();
    try { await sendHeartbeat(controller.signal); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearCsrfToken(); router.replace('/login');
      }
    } finally { inFlight = false; }
  };
  void beat();
  const timer = window.setInterval(() => void beat(), 60_000);
  return () => { window.clearInterval(timer); controller?.abort(); };
}, [router]);
```

Mount the hook once at the top of authenticated `ParticipantShell`, never in admin/public screens.

- [ ] **Step 3: Run heartbeat checks**

```bash
npm --workspace web test -- src/hooks/use-presence-heartbeat.spec.tsx src/components/semcomp/participant-shell.spec.tsx
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: tests/typecheck pass and unmount leaves no timer/request.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/presence apps/web/src/hooks apps/web/src/components/semcomp
git commit -m "feat: send participant heartbeats"
```

---

### Task 8: Add the Daily and General Admin Dashboard

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
- `fetchPresenceOverview()` polls every 30 seconds independently of the old dashboard query.
- `fetchPresenceHistory({from,to})` and `downloadPresenceCsv({from,to})` share one date encoder.

- [ ] **Step 1: Define exact response types and failing service tests**

```ts
export type PresenceDateRange = { from: string; to: string };
export type PresenceOverview = {
  status: 'LIVE' | 'DEGRADED'; timezone: 'America/Sao_Paulo';
  heartbeatIntervalSeconds: 60; onlineWindowSeconds: 120;
  lastCollectedAt: string | null; onlineNow: number;
  registeredParticipants: number; uniqueParticipantsEverLogged: number;
  monitoredDays: number; today: PresenceDay; overallPeak: PresencePeak;
};
```

Assert paths contain only `from`/`to`; download uses credentials, reads `Content-Disposition`, creates/revokes one object URL, and does not parse CSV as JSON.

- [ ] **Step 2: Write failing panel/history interaction tests**

Cover LIVE/DEGRADED, last update/window copy, today/general cards, loading/error/retry, background refresh, default last-seven-day range, date validation, empty table, and download using applied rather than partially typed filters.

- [ ] **Step 3: Implement independent overview polling and daily table**

```ts
useQuery({
  queryKey: ['admin', 'presence', 'overview'],
  queryFn: fetchPresenceOverview,
  refetchInterval: 30_000,
  refetchIntervalInBackground: true,
  retry: false,
});
```

Use labeled `date` inputs, real table/caption/header scopes, no granularity or pagination controls, and pending/disabled download state. Add both components below existing dashboard sections without merging API queries.

- [ ] **Step 4: Run frontend dashboard checks**

```bash
npm --workspace web test -- src/lib/http/download.spec.ts src/app/admin/_components/presence-panel.spec.tsx src/app/admin/_components/presence-history.spec.tsx src/app/admin/dashboard-client.spec.tsx
npm --workspace web run lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: all pass and a presence failure leaves existing operational cards visible.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/presence apps/web/src/lib/http apps/web/src/app/admin
git commit -m "feat: show daily and general presence"
```

---

### Task 9: Update Load Rehearsal, CI, Roadmap, and Verify the Milestone

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
- Rehearsal holds 150 email/password sessions, heartbeats every 60 seconds, and verifies one daily row plus exactly 150 distinct online participants.
- Report contains aggregate latency/status/resource metrics and no password, identifiers, cookie, CSRF, or JWT.

- [ ] **Step 1: Write failing load contracts**

```js
assert.equal(report.thresholds.expectedOnlineParticipants, 150);
assert.equal(report.thresholds.observedOnlineParticipants, 150);
assert.equal(report.thresholds.dailyRowsForToday, 1);
assert.equal(report.operations.heartbeat.errors, 0);
```

Stub requests to assert register includes password, login includes email/password only, two heartbeat intervals execute, generated secrets enter the sensitive-value scan, and no minute-history endpoint is called.

- [ ] **Step 2: Run and observe old load behavior**

```bash
node --check scripts/load/marco-9-load.mjs
node --test scripts/load/cpf.test.mjs scripts/load/marco-11-load.test.mjs
```

Expected: new contract fails on old CPF/email login and absent heartbeat/daily checks.

- [ ] **Step 3: Implement the password/heartbeat rehearsal**

Generate per-participant test passwords in memory, register, explicitly logout/login to exercise both paths, heartbeat for at least 130 seconds, then poll admin overview/history until fresh or bounded timeout. Require 150 online, one current-day row, no valid 429, and preserve Marco 9 error/latency/CPU/memory/connection thresholds. Rename report to `artifacts/marco-11-load-report.json`, bump schema, blank credentials before serialization, and reject every captured sensitive value.

- [ ] **Step 4: Align CI and documentation**

CI retains full lint/tests/E2E/builds, adds new contract files, keeps administrator password-policy coverage, and renames image tags to `marco11`; it performs no live AWS load. Update every forward-looking participant-auth statement to email/password, document 8/64/72, no recovery, ID-as-jti, daily-only history, 30-day/24-month retention, and mixed aggregate CSV. Marco 12 still owns individual exports.

- [ ] **Step 5: Run the complete automated gate**

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

Expected: every command exits 0 against a disposable migrated test database.

- [ ] **Step 6: Run reduced rehearsal and acceptance review**

```powershell
$env:LOAD_REDUCED='true'
$env:LOAD_HEARTBEAT_WINDOW_MS='130000'
node scripts/load/marco-9-load.mjs
```

Verify register→home, legacy login rejection, unchanged admin login, one person across two tabs, logout/deactivation invalidation, degraded stale state, daily/general dashboard, one-row-per-day behavior, and CSV `GERAL` + filtered `DIARIO` rows without PII. Do not commit `artifacts/`.

- [ ] **Step 7: Commit**

```bash
git add scripts/load/marco-9-load.mjs scripts/load/marco-11-load.test.mjs .github/workflows/ci.yml docs/plan.md docs/plano-fase.md apps/api/README.md apps/web/README.md apps/api/.env.example .env.example
git commit -m "chore: validate marco 11 daily presence"
```

---

## Definition of Done

- Participant auth is email/password only with CPF retained as required unique profile data and exact 8/64/72 policy.
- Registration creates account + persisted session atomically; every JWT `jti` equals one `UserSession.id`.
- Logout, expiration, and deactivation end sessions; heartbeat is protected, quiet on transient frontend errors, and contains no behavioral telemetry.
- One row per operational day stores latest observation and preserves daily peak under concurrent replicas; general peak is derived from retained days.
- Admin exposes current/general overview, unpaginated daily history, and one mixed aggregate CSV; no minute persistence or API exists.
- Sessions retain 30 days and daily summaries 24 months.
- The 150-participant rehearsal reports exactly 150 distinct online people and one row for the current day within Marco 9 limits.
- Prisma, lint, unit, E2E, frontend, typecheck, builds, load contracts, and `git diff --check` pass.

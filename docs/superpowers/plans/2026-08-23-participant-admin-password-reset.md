# Participant Admin Password Reset Implementation Plan

> Substituído para a execução do Marco 13 por
> `../specs/2026-08-23-marco-13-specialized-admin-permissions-design.md` e
> `2026-08-23-marco-13-specialized-admin-permissions.md`. Os detalhes deste
> reset permanecem incorporados nos documentos completos.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an audited administrative participant-password reset that issues a 24-hour temporary password and forces the participant to choose a definitive password before accessing the application.

**Architecture:** Extend `User` with explicit pending-reset state, keep the administrative mutation in `AdminParticipantsService` so the credential update, session revocation, and audit event share one Prisma transaction, and keep the participant completion flow in `AuthService`. `JwtAuthGuard` will enforce the pending-reset restriction centrally using Nest route metadata; the Next.js app will provide a one-time administrative result dialog and a dedicated `/trocar-senha` page.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, bcrypt 6, Jest/Supertest, Next.js 16, React 19, TanStack Query 5, React Hook Form, Zod 4, Vitest/Testing Library.

## Global Constraints

- Generate the temporary password from exactly 18 cryptographically random bytes encoded as Base64URL, producing 24 ASCII characters.
- Temporary passwords expire exactly 24 hours after the committed administrative reset.
- Participant passwords remain 8–64 Unicode code points and at most 72 UTF-8 bytes, with no trim or composition rule.
- Never persist or log a temporary/definitive plaintext password; never place a password or hash in audit snapshots, metrics, URLs, toasts, or query caches.
- Resetting a password does not change `User.isActive`.
- Revoke every open participant session both when the admin resets the password and when the participant defines the definitive password.
- A pending reset permits only CSRF recovery, heartbeat, logout, and required-password completion; enforce this in the backend.
- Administrative reset limit: 20 attempts per 10 minutes per authenticated operator ID.
- Required-password completion limit: 5 attempts per 15 minutes per authenticated participant ID.
- Keep generic `Email ou senha inválidos.` responses for invalid, unknown, inactive, or expired participant login credentials.
- Use test-first red/green cycles for every production behavior and commit after each task.

---

## File Map

### Backend persistence and shared contracts

- Modify `apps/api/prisma/schema/users.prisma`: pending-reset state.
- Modify `apps/api/prisma/schema/audit.prisma`: password-reset audit operation.
- Create `apps/api/prisma/migrations/20260823120000_add_participant_password_reset/migration.sql`: PostgreSQL migration and state constraint.
- Create `apps/api/src/common/specs/participant-password-reset-migration.spec.ts`: migration contract.
- Create `apps/api/src/auth/participant-password-reset.ts`: temporary-password generation and TTL constants.
- Create `apps/api/src/auth/specs/participant-password-reset.spec.ts`: generator tests.
- Modify `apps/api/src/auth/participant-password.service.ts`: compare a candidate with a known participant hash.
- Modify `apps/api/src/audit/audit.service.ts`: allowlisted password-reset snapshots/metadata.
- Modify `apps/api/src/audit/audit-operation-matrix.spec.ts`: audit safety contract.
- Modify `apps/api/src/security/rate-limit-policy.decorator.ts`: named reset policies.
- Modify `apps/api/src/security/app-throttler.guard.ts`: policy values.
- Modify `apps/api/src/security/app-throttler.guard.spec.ts`: exact rate limits and ID trackers.

### Administrative backend

- Create `apps/api/src/admin/dto/reset-participant-password.dto.ts`: reset input validation.
- Create `apps/api/src/admin/dto/reset-participant-password-response.dto.ts`: one-time response contract.
- Modify `apps/api/src/admin/admin-participants.repository.ts`: row lock, credential update, and reset-state projection.
- Modify `apps/api/src/admin/admin-participants.service.ts`: transactional reset orchestration.
- Modify `apps/api/src/admin/admin.controller.ts`: reset endpoint.
- Modify `apps/api/src/admin/admin.module.ts`: password-service dependency.
- Modify `apps/api/src/auth/auth.module.ts`: export `ParticipantPasswordService` and `AllowedOriginGuard`.
- Create `apps/api/src/admin/specs/admin-participant-password-reset.service.spec.ts`: transaction, conflict, audit, and secret tests.
- Modify `apps/api/src/admin/specs/admin.controller.spec.ts`: controller delegation and guard metadata.
- Modify `apps/api/src/admin/specs/admin-participants.service.spec.ts`: detail projection.

### Authentication backend

- Create `apps/api/src/auth/allow-password-change-required.decorator.ts`: route metadata escape hatch.
- Modify `apps/api/src/auth/jwt-auth.guard.ts`: centralized forced-change denial.
- Create `apps/api/src/auth/specs/jwt-auth.guard.spec.ts`: allowed/denied route behavior.
- Modify `apps/api/src/presence/sessions.repository.ts`: carry reset state with session identity.
- Modify `apps/api/src/users/users.repository.ts`: carry reset state during participant authentication.
- Modify `apps/api/src/users/dto/user-response.dto.ts`: expose `passwordChangeRequired` without exposing expiry/hash.
- Modify `apps/api/src/common/request-context.ts`: authenticated reset-state fields.
- Modify `apps/api/src/auth/auth.service.ts`: expired temporary-login rejection and completion orchestration.
- Modify `apps/api/src/auth/auth.controller.ts`: session-state response and completion endpoint.
- Modify `apps/api/src/auth/dto/csrf-token-response.dto.ts`: `passwordChangeRequired` field.
- Create `apps/api/src/auth/dto/change-required-password.dto.ts`: definitive-password input.
- Create `apps/api/src/auth/participant-password-reset.repository.ts`: optimistic read plus locked completion transaction.
- Modify `apps/api/src/auth/specs/auth.service.spec.ts`: login and completion behavior.
- Modify `apps/api/src/auth/specs/auth.controller.spec.ts`: cookie clearing and route guards.
- Modify `apps/api/src/auth/specs/jwt-session.strategy.spec.ts`: reset state propagation.
- Modify `apps/api/src/users/specs/users.controller.spec.ts`: public user response.
- Create `apps/api/test/participant-password-reset.e2e-spec.ts`: complete security flow.

### Frontend transport and routing

- Modify `apps/web/src/lib/http/api-error.ts`: stable backend error code.
- Modify `apps/web/src/lib/http/request.ts`: parse `code` and message.
- Modify `apps/web/src/features/users/users.types.ts`: `passwordChangeRequired`.
- Modify `apps/web/src/features/auth/auth.types.ts`: session-state and completion contracts.
- Modify `apps/web/src/features/auth/auth.service.ts`: session-state fetch and definitive-password mutation.
- Modify `apps/web/src/lib/http/client.spec.ts`: error-code and CSRF lifecycle tests.
- Modify `apps/web/src/app/login/login-form.tsx`: forced-change redirect.
- Modify `apps/web/src/app/login/login-form.spec.tsx`: redirect contract.
- Modify `apps/web/src/hooks/use-auth.ts`: redirect protected pages on `PASSWORD_CHANGE_REQUIRED`.
- Create `apps/web/src/hooks/use-auth.spec.tsx`: direct-navigation redirect test.
- Modify `apps/web/src/proxy.ts`: protect `/trocar-senha` by cookie presence.
- Modify `apps/web/src/proxy.spec.ts`: route contract.
- Modify `apps/web/src/components/semcomp/participant-shell.spec.tsx`, `apps/web/src/app/ranking/ranking-client.spec.tsx`, and `apps/web/src/app/login/login-form.spec.tsx`: required `User` fixture field.

### Frontend screens

- Modify `apps/web/src/features/participants/participants.types.ts`: administrative reset state/response.
- Modify `apps/web/src/features/participants/participants.service.ts`: reset request.
- Modify `apps/web/src/features/admin-mutation-contracts.spec.ts`: reason and replacement contract.
- Modify `apps/web/src/app/admin/participantes/participants-client.spec.tsx`: reset-state list fixture.
- Create `apps/web/src/app/admin/participantes/[id]/participant-password-reset-card.tsx`: admin reset/result UI.
- Create `apps/web/src/app/admin/participantes/[id]/participant-password-reset-card.spec.tsx`: accessibility, conflict, one-time display, and copy tests.
- Modify `apps/web/src/app/admin/participantes/[id]/participant-detail-client.tsx`: mount credential card.
- Create `apps/web/src/app/trocar-senha/page.tsx`: dedicated route.
- Create `apps/web/src/app/trocar-senha/change-required-password-form.tsx`: definitive-password form.
- Create `apps/web/src/app/trocar-senha/change-required-password-form.spec.tsx`: form and redirect tests.
- Modify `docs/plan.md`: add the participant-reset deliverable and acceptance criteria to Marco 13.

---

### Task 1: Persist the pending-reset state

**Files:**
- Create: `apps/api/src/common/specs/participant-password-reset-migration.spec.ts`
- Create: `apps/api/prisma/migrations/20260823120000_add_participant_password_reset/migration.sql`
- Modify: `apps/api/prisma/schema/users.prisma`
- Modify: `apps/api/prisma/schema/audit.prisma`

**Interfaces:**
- Produces: `User.passwordResetRequired: boolean`, `User.passwordResetExpiresAt: Date | null`, and `AuditOperation.PARTICIPANT_PASSWORD_RESET` in generated Prisma types.
- Consumes: existing `User.passwordHash` and `User.passwordChangedAt`.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('participant password reset migration contract', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260823120000_add_participant_password_reset/migration.sql',
    ),
    'utf8',
  );

  it('stores only reset state and adds the audit operation', () => {
    expect(sql).toContain('ADD VALUE \'PARTICIPANT_PASSWORD_RESET\'');
    expect(sql).toContain('"passwordResetRequired" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('"passwordResetExpiresAt" TIMESTAMP(3)');
    expect(sql).toContain('User_password_reset_state_check');
    expect(sql).not.toMatch(/temporaryPassword|plainPassword/i);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --workspace api test -- participant-password-reset-migration.spec.ts`

Expected: FAIL with `ENOENT` for the missing migration.

- [ ] **Step 3: Add the schema fields, enum value, and SQL migration**

Add to `User`:

```prisma
passwordResetRequired  Boolean   @default(false)
passwordResetExpiresAt DateTime?
```

Add to `AuditOperation`:

```prisma
PARTICIPANT_PASSWORD_RESET
```

Create the migration:

```sql
ALTER TYPE "AuditOperation" ADD VALUE 'PARTICIPANT_PASSWORD_RESET';

ALTER TABLE "User"
ADD COLUMN "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

ALTER TABLE "User"
ADD CONSTRAINT "User_password_reset_state_check"
CHECK (
  ("passwordResetRequired" = false AND "passwordResetExpiresAt" IS NULL)
  OR
  ("passwordResetRequired" = true AND "passwordResetExpiresAt" IS NOT NULL)
);
```

- [ ] **Step 4: Generate Prisma types and verify GREEN**

Run:

```bash
npm --workspace api run prisma:generate
npm --workspace api run prisma:validate
npm --workspace api test -- participant-password-reset-migration.spec.ts
```

Expected: Prisma generation/validation exit 0 and the migration test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema/users.prisma apps/api/prisma/schema/audit.prisma apps/api/prisma/migrations/20260823120000_add_participant_password_reset/migration.sql apps/api/src/common/specs/participant-password-reset-migration.spec.ts
git commit -m "feat: persist participant password reset state"
```

---

### Task 2: Add reset primitives, audit allowlist, and rate policies

**Files:**
- Create: `apps/api/src/auth/participant-password-reset.ts`
- Create: `apps/api/src/auth/specs/participant-password-reset.spec.ts`
- Modify: `apps/api/src/auth/participant-password.service.ts`
- Modify: `apps/api/src/auth/specs/participant-password.service.spec.ts`
- Modify: `apps/api/src/audit/audit.service.ts`
- Modify: `apps/api/src/audit/audit-operation-matrix.spec.ts`
- Modify: `apps/api/src/security/rate-limit-policy.decorator.ts`
- Modify: `apps/api/src/security/app-throttler.guard.ts`
- Modify: `apps/api/src/security/app-throttler.guard.spec.ts`

**Interfaces:**
- Produces: `generateTemporaryParticipantPassword(random?): string`, `PARTICIPANT_PASSWORD_RESET_TTL_MS`, `ParticipantPasswordService.matchesHash(password, hash): Promise<boolean>`, audit snapshot support, and named policies `passwordReset`/`passwordChange`.
- Consumes: `validateParticipantPassword`, `comparePassword`, generated `AuditOperation.PARTICIPANT_PASSWORD_RESET`.

- [ ] **Step 1: Write failing generator, hash-match, audit, and policy tests**

```ts
describe('participant password reset primitives', () => {
  it('generates 24 Base64URL characters from 18 random bytes', () => {
    const random = jest.fn(() => Buffer.alloc(18, 255));
    const password = generateTemporaryParticipantPassword(random);
    expect(random).toHaveBeenCalledWith(18);
    expect(password).toHaveLength(24);
    expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(() => validateParticipantPassword(password)).not.toThrow();
  });
});
```

Add an audit matrix case whose `before`/`after` contain only `id`,
`passwordResetRequired`, and `passwordResetExpiresAt`, with metadata
`sessionsRevoked`. Add named-policy expectations of `20/600000` and
`5/900000`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- participant-password-reset.spec.ts participant-password.service.spec.ts audit-operation-matrix.spec.ts app-throttler.guard.spec.ts
```

Expected: FAIL because the generator, audit operation rule, and policies do not exist.

- [ ] **Step 3: Implement the reset primitive and hash comparison**

```ts
import { randomBytes } from 'node:crypto';

export const PARTICIPANT_TEMPORARY_PASSWORD_BYTES = 18;
export const PARTICIPANT_PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

export function generateTemporaryParticipantPassword(
  random: (size: number) => Buffer = randomBytes,
) {
  return random(PARTICIPANT_TEMPORARY_PASSWORD_BYTES).toString('base64url');
}
```

Add to `ParticipantPasswordService`:

```ts
async matchesHash(password: string, passwordHash: string) {
  validateParticipantPassword(password);
  return comparePassword(password, passwordHash);
}
```

- [ ] **Step 4: Add the exact audit contract**

Add a `ParticipantPasswordResetSnapshot` with `id`, boolean reset state, and
nullable date expiry; add a changed-event union for
`PARTICIPANT_PASSWORD_RESET`; allow only `sessionsRevoked: number` metadata;
register the operation in `operationRules`. Add `sessionsRevoked` to
`AuditMetadataSource`, its operation-specific rule, and the scalar metadata
allowlist. Do not add password-like fields to `pickScalarFields`.

- [ ] **Step 5: Add named rate policies**

Extend the policy names with `passwordReset` and `passwordChange`, then add:

```ts
passwordReset: { name: 'participant-password-reset', limit: 20, ttl: 10 * 60 * 1000 },
passwordChange: { name: 'participant-password-change', limit: 5, ttl: 15 * 60 * 1000 },
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: all focused suites PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/participant-password-reset.ts apps/api/src/auth/specs/participant-password-reset.spec.ts apps/api/src/auth/participant-password.service.ts apps/api/src/auth/specs/participant-password.service.spec.ts apps/api/src/audit/audit.service.ts apps/api/src/audit/audit-operation-matrix.spec.ts apps/api/src/security/rate-limit-policy.decorator.ts apps/api/src/security/app-throttler.guard.ts apps/api/src/security/app-throttler.guard.spec.ts
git commit -m "feat: add participant password reset contracts"
```

---

### Task 3: Implement the audited administrative reset endpoint

**Files:**
- Create: `apps/api/src/admin/dto/reset-participant-password.dto.ts`
- Create: `apps/api/src/admin/dto/reset-participant-password-response.dto.ts`
- Create: `apps/api/src/admin/specs/admin-participant-password-reset.service.spec.ts`
- Modify: `apps/api/src/admin/admin-participants.repository.ts`
- Modify: `apps/api/src/admin/admin-participants.service.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/admin/specs/admin.controller.spec.ts`
- Modify: `apps/api/src/admin/specs/admin-participants.service.spec.ts`

**Interfaces:**
- Produces: `AdminParticipantsService.resetPassword(id, dto, context)` and `POST /admin/participants/:id/password-reset` returning `{ temporaryPassword, expiresAt }`.
- Consumes: `ParticipantPasswordService.hash`, generator/TTL from Task 2, `AuditService.record`, and the `passwordReset` rate policy.

- [ ] **Step 1: Write failing DTO, service, and controller tests**

The service test must assert this exact sequence and secret boundary:

```ts
expect(passwords.hash.mock.invocationCallOrder[0]).toBeLessThan(
  repository.withTransaction.mock.invocationCallOrder[0],
);
expect(transaction.updateParticipantPasswordReset).toHaveBeenCalledWith(
  'participant-1',
  expect.objectContaining({
    passwordHash: '$2b$12$temporary',
    passwordResetRequired: true,
  }),
);
expect(audit.record).toHaveBeenCalledWith(
  transaction.auditWriter,
  expect.objectContaining({
    operation: AuditOperation.PARTICIPANT_PASSWORD_RESET,
    participantId: 'participant-1',
    metadata: { sessionsRevoked: 2 },
  }),
);
expect(JSON.stringify(audit.record.mock.calls)).not.toContain(
  'temporary-password',
);
```

Also test missing participant (`404`), active pending reset without
`replacePending` (`409` with `PASSWORD_RESET_ALREADY_PENDING`), explicit
replacement, inactive participant remaining inactive, and audit failure
propagating from the transaction callback.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- admin-participant-password-reset.service.spec.ts admin.controller.spec.ts admin-participants.service.spec.ts
```

Expected: FAIL because DTOs and `resetPassword` do not exist.

- [ ] **Step 3: Add DTOs**

```ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class ResetParticipantPasswordDto {
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @Length(10, 500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  replacePending = false;
}

export class ResetParticipantPasswordResponseDto {
  temporaryPassword!: string;
  expiresAt!: string;
}
```

Add Swagger properties with no real password example; use
`temporary-password-shown-once`.

- [ ] **Step 4: Add repository contracts**

Extend `participantSelect` with `passwordResetRequired` and
`passwordResetExpiresAt`. Add:

```ts
lockParticipantPasswordReset(id: string): Promise<{
  id: string;
  isActive: boolean;
  passwordResetRequired: boolean;
  passwordResetExpiresAt: Date | null;
} | null>;

updateParticipantPasswordReset(
  id: string,
  data: {
    passwordHash: string;
    passwordChangedAt: Date;
    passwordResetRequired: true;
    passwordResetExpiresAt: Date;
  },
): Promise<{
  id: string;
  passwordResetRequired: boolean;
  passwordResetExpiresAt: Date | null;
}>;
```

Implement the lock with `SELECT ... FROM "User" WHERE "id" = ${id} AND
"role" = 'PARTICIPANT'::"UserRole" FOR UPDATE` and reuse
`revokeOpenSessions`.

- [ ] **Step 5: Implement transactional reset orchestration**

Generate and hash before `withTransaction`; inside the callback lock the row,
reject an unexpired pending reset unless `replacePending` is true, update the
credential/reset fields, revoke sessions, and record the audit event. Throw:

```ts
new ConflictException({
  statusCode: 409,
  code: 'PASSWORD_RESET_ALREADY_PENDING',
  message: 'Já existe uma troca obrigatória de senha pendente.',
});
```

Return the plaintext only from the outer method after the transaction resolves.

- [ ] **Step 6: Expose the endpoint and dependencies**

Export `ParticipantPasswordService` and `AllowedOriginGuard` from `AuthModule`,
import `AuthModule` in `AdminModule`, and add:

```ts
@Post('participants/:id/password-reset')
@HttpCode(HttpStatus.OK)
@RateLimitPolicy('passwordReset')
@UseGuards(AllowedOriginGuard)
resetPassword(
  @Param('id') id: string,
  @Body() dto: ResetParticipantPasswordDto,
  @Req() request: AuthenticatedRequest,
) {
  return this.participants.resetPassword(
    id,
    dto,
    getAdminOperationContext(request),
  );
}
```

The existing controller-level `JwtAuthGuard`, `CsrfGuard`, `RolesGuard`, and
`@Roles(ADMIN)`, plus the method-level origin guard, remain the backend
authorization boundary until Marco 13 adds the
`participants.password.reset` capability.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: all focused suites PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/admin apps/api/src/auth/auth.module.ts
git commit -m "feat: add audited participant password reset"
```

---

### Task 4: Propagate reset state and enforce restricted sessions

**Files:**
- Create: `apps/api/src/auth/allow-password-change-required.decorator.ts`
- Create: `apps/api/src/auth/specs/jwt-auth.guard.spec.ts`
- Modify: `apps/api/src/auth/jwt-auth.guard.ts`
- Modify: `apps/api/src/presence/sessions.repository.ts`
- Modify: `apps/api/src/users/users.repository.ts`
- Modify: `apps/api/src/users/dto/user-response.dto.ts`
- Modify: `apps/api/src/common/request-context.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/dto/csrf-token-response.dto.ts`
- Modify: `apps/api/src/auth/specs/auth.service.spec.ts`
- Modify: `apps/api/src/auth/specs/auth.controller.spec.ts`
- Modify: `apps/api/src/auth/specs/jwt-session.strategy.spec.ts`
- Modify: `apps/api/src/users/specs/users.controller.spec.ts`

**Interfaces:**
- Produces: `passwordChangeRequired` in user/session responses,
  `@AllowPasswordChangeRequired()`, and `403 PASSWORD_CHANGE_REQUIRED` for all
  other authenticated routes.
- Consumes: persisted reset state from Task 1.

- [ ] **Step 1: Write failing login, response, and guard tests**

Cover:

```ts
await expect(guard.canActivate(restrictedContext)).rejects.toMatchObject({
  response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }),
});
await expect(guard.canActivate(allowedContext)).resolves.toBe(true);
```

Add service tests proving an expired temporary credential returns the same
`UnauthorizedException('Email ou senha inválidos.')` and does not start a
session, while an unexpired one returns `user.passwordChangeRequired === true`.
Add controller tests proving CSRF returns both fields.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- jwt-auth.guard.spec.ts auth.service.spec.ts auth.controller.spec.ts jwt-session.strategy.spec.ts users.controller.spec.ts
```

Expected: FAIL on missing reset-state fields/decorator.

- [ ] **Step 3: Propagate reset state through repositories and DTOs**

Add `passwordResetRequired` and `passwordResetExpiresAt` to
`userSummarySelect`, `SessionUserIdentity`, and participant-authentication
selects. Add this public DTO field:

```ts
@ApiProperty({ example: false })
passwordChangeRequired: boolean;
```

Map it from `data.passwordResetRequired ?? false`; keep
`passwordResetRequired?: boolean` in `UserResponseSource` so unrelated unit
fixtures remain source-compatible. Never expose `passwordResetExpiresAt` in
`UserResponseDto`.

- [ ] **Step 4: Reject expired temporary login generically**

After password verification and before `startAuthenticatedSession`, reject
when `candidate.passwordResetRequired` and the expiry is missing or not later
than `new Date()`. Do not introduce a distinct public login message.

- [ ] **Step 5: Add the metadata decorator and central guard**

```ts
export const ALLOW_PASSWORD_CHANGE_REQUIRED_KEY =
  'auth:allow-password-change-required';
export const AllowPasswordChangeRequired = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);
```

Make `JwtAuthGuard.canActivate` await `super.canActivate(context)`, then inspect
`request.user.passwordResetRequired`. If true and route/class metadata is not
allowed, throw:

```ts
new ForbiddenException({
  statusCode: 403,
  code: 'PASSWORD_CHANGE_REQUIRED',
  message: 'Defina uma nova senha para continuar.',
});
```

Keep the existing `handleRequest` unauthorized behavior.

- [ ] **Step 6: Allow only the required auth routes**

Annotate `csrf`, `heartbeat`, and `logout` with
`@AllowPasswordChangeRequired()`. Return:

```ts
{
  csrfToken: request.user.csrfToken,
  passwordChangeRequired: request.user.passwordResetRequired,
}
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: all focused suites PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth apps/api/src/presence/sessions.repository.ts apps/api/src/users apps/api/src/common/request-context.ts
git commit -m "feat: restrict sessions pending password change"
```

---

### Task 5: Complete the definitive-password flow

**Files:**
- Create: `apps/api/src/auth/dto/change-required-password.dto.ts`
- Create: `apps/api/src/auth/participant-password-reset.repository.ts`
- Create: `apps/api/src/auth/specs/participant-password-reset.repository.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/specs/auth.service.spec.ts`
- Modify: `apps/api/src/auth/specs/auth.controller.spec.ts`

**Interfaces:**
- Produces: `AuthService.changeRequiredPassword(userId, sessionId, dto)` and
  `POST /auth/password/change-required` returning `204` and clearing the cookie.
- Consumes: `ParticipantPasswordService.matchesHash/hash`, session revocation,
  the allowed-route decorator, and `passwordChange` policy.

- [ ] **Step 1: Write failing repository, service, and controller tests**

Cover valid completion, same-as-temporary rejection, invalid policy, expired
reset, replacement race, no pending reset, revocation of all sessions, cookie
clearing, and route guard metadata. The success assertion is:

```ts
expect(repository.completeRequiredPasswordChange).toHaveBeenCalledWith({
  participantId: 'participant-1',
  expectedPasswordHash: '$2b$12$temporary',
  newPasswordHash: '$2b$12$definitive',
  changedAt: expect.any(Date),
});
expect(result).toEqual({ status: 'changed', sessionsRevoked: 2 });
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- participant-password-reset.repository.spec.ts auth.service.spec.ts auth.controller.spec.ts
```

Expected: FAIL because the repository and endpoint do not exist.

- [ ] **Step 3: Add DTO and repository read contract**

```ts
import { IsString, Length } from 'class-validator';

export class ChangeRequiredPasswordDto {
  @IsString()
  @Length(8, 64)
  newPassword!: string;
}
```

Add `findPendingByParticipantId(id)` selecting only `id`, `passwordHash`,
`passwordResetRequired`, and `passwordResetExpiresAt` for a participant.

- [ ] **Step 4: Add the locked completion transaction**

`completeRequiredPasswordChange` must `SELECT ... FOR UPDATE`, then verify all
of these under the lock: participant role, reset still required, expiry still
future, and current `passwordHash === expectedPasswordHash`. On mismatch return
`{ status: 'invalid' }` without writing. On success update:

```ts
{
  passwordHash: newPasswordHash,
  passwordChangedAt: changedAt,
  passwordResetRequired: false,
  passwordResetExpiresAt: null,
}
```

Then revoke every open session for that user in the same transaction and return
`{ status: 'changed', sessionsRevoked: result.count }`.

- [ ] **Step 5: Implement service orchestration outside the transaction**

Read pending state, reject missing state with
`409 PASSWORD_CHANGE_NOT_REQUIRED`, end the current session and reject expired
state with `401 PASSWORD_RESET_INVALID`, reject `matchesHash(newPassword,
temporaryHash)` with `400 PASSWORD_MUST_CHANGE`, hash the new password, then
call the locked repository method. A repository `invalid` result means an admin
replaced the reset during bcrypt; end the current session and return
`401 PASSWORD_RESET_INVALID`. Map `ParticipantPasswordValidationError` from
either comparison or hashing to:

```ts
new BadRequestException({
  statusCode: 400,
  code: 'INVALID_PARTICIPANT_PASSWORD',
  message: 'A senha deve ter entre 8 e 64 caracteres e no máximo 72 bytes.',
});
```

- [ ] **Step 6: Expose the allowed endpoint**

```ts
@Post('password/change-required')
@HttpCode(HttpStatus.NO_CONTENT)
@AllowPasswordChangeRequired()
@RateLimitPolicy('passwordChange')
@UseGuards(JwtAuthGuard, CsrfGuard, AllowedOriginGuard)
async changeRequiredPassword(
  @Body() dto: ChangeRequiredPasswordDto,
  @Req() request: ControllerRequest,
  @Res({ passthrough: true }) response: Response,
) {
  await this.authService.changeRequiredPassword(
    request.user.id,
    request.user.jti,
    dto,
  );
  response.clearCookie('access_token', getClearAuthCookieOptions());
}
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: all focused suites PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat: require definitive participant password"
```

---

### Task 6: Prove the backend flow end to end

**Files:**
- Create: `apps/api/test/participant-password-reset.e2e-spec.ts`
- Modify: `apps/api/test/admin-authorization.e2e-spec.ts`

**Interfaces:**
- Produces: executable proof of reset, restriction, completion, audit safety,
  replacement conflict, and authorization.
- Consumes: API endpoints from Tasks 3–5 and `AdminE2eHarness`.

- [ ] **Step 1: Write the failing e2e scenario**

Use `describeDisposable` and `AdminE2eHarness`. The main test must perform:

```ts
const reset = await harness
  .post(`/admin/participants/${participant.id}/password-reset`, adminSession)
  .set('Origin', origin)
  .send({ reason: 'Participante solicitou suporte presencial' })
  .expect(200);
const temporaryPassword = (reset.body as { temporaryPassword: string })
  .temporaryPassword;

await harness.get('/users/me', oldParticipantSession).expect(401);

const temporaryLogin = await request(harness.app.getHttpServer())
  .post('/auth/login')
  .set('Origin', origin)
  .send({ email: participant.email, password: temporaryPassword })
  .expect(200);
expect(temporaryLogin.body.user.passwordChangeRequired).toBe(true);
```

Then assert `/users/me` returns `403/PASSWORD_CHANGE_REQUIRED`,
`/auth/csrf` remains available, completion returns `204`, the temporary session
is revoked, old/temporary passwords return generic `401`, the definitive
password logs in with `passwordChangeRequired: false`, and the audit JSON does
not contain either password/hash.

Add a second test for pending-reset `409`, explicit replacement, and the first
temporary password becoming invalid. Add the reset endpoint to the participant
authorization matrix and expect `403` with unchanged persisted state.

- [ ] **Step 2: Run e2e and verify RED**

Run: `npm --workspace api run test:e2e -- participant-password-reset.e2e-spec.ts`

Expected: FAIL until every endpoint behavior is wired to the real database.

- [ ] **Step 3: Fix only integration gaps exposed by e2e**

Limit edits to the files from Tasks 3–5. Do not weaken the assertions or expose
secrets for test convenience.

- [ ] **Step 4: Run e2e and focused unit tests and verify GREEN**

Run:

```bash
npm --workspace api run test:e2e -- participant-password-reset.e2e-spec.ts admin-authorization.e2e-spec.ts
npm --workspace api test -- participant-password-reset admin-participant-password-reset jwt-auth.guard auth.service auth.controller
```

Expected: both e2e suites and all focused unit suites PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test apps/api/src
git commit -m "test: cover participant password reset flow"
```

---

### Task 7: Add frontend transport, error codes, and redirects

**Files:**
- Modify: `apps/web/src/lib/http/api-error.ts`
- Modify: `apps/web/src/lib/http/request.ts`
- Modify: `apps/web/src/lib/http/client.spec.ts`
- Modify: `apps/web/src/features/users/users.types.ts`
- Modify: `apps/web/src/features/auth/auth.types.ts`
- Modify: `apps/web/src/features/auth/auth.service.ts`
- Modify: `apps/web/src/app/login/login-form.tsx`
- Modify: `apps/web/src/app/login/login-form.spec.tsx`
- Modify: `apps/web/src/hooks/use-auth.ts`
- Create: `apps/web/src/hooks/use-auth.spec.tsx`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/proxy.spec.ts`
- Modify: `apps/web/src/components/semcomp/participant-shell.spec.tsx`
- Modify: `apps/web/src/app/ranking/ranking-client.spec.tsx`

**Interfaces:**
- Produces: `ApiError.code`, `fetchSessionSecurity()`,
  `changeRequiredPassword()`, login redirect to `/trocar-senha`, and protected
  `/trocar-senha` routing.
- Consumes: backend response/error contracts from Tasks 3–5.

- [ ] **Step 1: Write failing transport and redirect tests**

Add a request test:

```ts
vi.mocked(fetch).mockResolvedValue(
  jsonResponse(
    { message: 'Defina uma nova senha.', code: 'PASSWORD_CHANGE_REQUIRED' },
    403,
  ),
);
await expect(apiFetch('/users/me')).rejects.toMatchObject({
  status: 403,
  code: 'PASSWORD_CHANGE_REQUIRED',
});
```

Add login expectation `/trocar-senha` when
`user.passwordChangeRequired === true`; add `useMe` hook redirect expectation
for direct protected-page access; add proxy expectations that a missing cookie
on `/trocar-senha` goes to `/login` and a present cookie is allowed.

- [ ] **Step 2: Run focused web tests and verify RED**

Run:

```bash
npm --workspace web test -- src/lib/http/client.spec.ts src/app/login/login-form.spec.tsx src/hooks/use-auth.spec.tsx src/proxy.spec.ts
```

Expected: FAIL because error codes and reset redirects are absent.

- [ ] **Step 3: Extend the transport contracts**

```ts
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

Parse `{ message?: string | string[]; code?: string }` in `request.ts` and
pass both values to `ApiError`. Add:

```ts
export type SessionSecurityResponse = {
  csrfToken: string;
  passwordChangeRequired: boolean;
};
export type ChangeRequiredPasswordPayload = { newPassword: string };
```

`fetchSessionSecurity` must call `apiFetch('/auth/csrf')`, install the returned
CSRF token, and return the response. `changeRequiredPassword` must POST the
payload, then call `clearCsrfToken()` only after success.

- [ ] **Step 4: Add reset-aware user and login routing**

Add required `passwordChangeRequired: boolean` to `User` and update the three
typed test fixtures. In `LoginForm`, route a participant with the flag to
`/trocar-senha`; keep admin routing unchanged.

- [ ] **Step 5: Redirect direct protected navigation from `useMe`**

Keep the query API unchanged, but use `useRouter`/`useEffect` inside `useMe` to
replace with `/trocar-senha` when the error is an `ApiError` whose code is
`PASSWORD_CHANGE_REQUIRED`. Do not redirect other `403` responses.

- [ ] **Step 6: Protect the new route in Next proxy**

Add `/trocar-senha/:path*` to the matcher and treat it like participant routes
when no access-token cookie exists.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: all focused web suites PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib apps/web/src/features/auth apps/web/src/features/users apps/web/src/app/login apps/web/src/hooks apps/web/src/proxy.ts apps/web/src/proxy.spec.ts apps/web/src/components/semcomp/participant-shell.spec.tsx apps/web/src/app/ranking/ranking-client.spec.tsx
git commit -m "feat: route temporary sessions to password change"
```

---

### Task 8: Build the administrative reset card and one-time result

**Files:**
- Modify: `apps/web/src/features/participants/participants.types.ts`
- Modify: `apps/web/src/features/participants/participants.service.ts`
- Modify: `apps/web/src/features/admin-mutation-contracts.spec.ts`
- Modify: `apps/web/src/app/admin/participantes/participants-client.spec.tsx`
- Create: `apps/web/src/app/admin/participantes/[id]/participant-password-reset-card.tsx`
- Create: `apps/web/src/app/admin/participantes/[id]/participant-password-reset-card.spec.tsx`
- Modify: `apps/web/src/app/admin/participantes/[id]/participant-detail-client.tsx`

**Interfaces:**
- Produces: `resetParticipantPassword(id, payload)` and
  `<ParticipantPasswordResetCard participant={...} />`.
- Consumes: `AdminParticipantDetail.passwordResetRequired`,
  `passwordResetExpiresAt`, the accessible shared `Dialog`, and the reset API.

- [ ] **Step 1: Write failing service and component tests**

Test that the service sends `{ reason, replacePending }`; the dialog requires a
10–500 character trimmed reason; pending state changes the action to
“Gerar outra senha”; double submit is blocked; `409` preserves the reason and
offers explicit replacement; success shows the password and expiry only in the
result dialog; copy calls `navigator.clipboard.writeText`; closing the result
removes the password from the DOM; the detail query is invalidated.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace web test -- src/features/admin-mutation-contracts.spec.ts "src/app/admin/participantes/[id]/participant-password-reset-card.spec.tsx"
```

Expected: FAIL because contracts/component do not exist.

- [ ] **Step 3: Add frontend participant contracts and service**

```ts
export type AdminParticipantPasswordResetResponse = {
  temporaryPassword: string;
  expiresAt: string;
};

export function resetParticipantPassword(
  id: string,
  payload: { reason: string; replacePending: boolean },
) {
  return apiFetch<AdminParticipantPasswordResetResponse>(
    `/admin/participants/${id}/password-reset`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}
```

Add reset state/expiry to `AdminParticipant` and update the participant-list
fixture with `passwordResetRequired: false` and
`passwordResetExpiresAt: null`.

- [ ] **Step 4: Implement an isolated reset card**

Use local component state, not `useMutation`, for the returned plaintext:

```ts
const [result, setResult] = useState<AdminParticipantPasswordResetResponse | null>(null);

async function submit(reason: string, replacePending: boolean) {
  const response = await resetParticipantPassword(participant.id, {
    reason: reason.trim(),
    replacePending,
  });
  setResult(response);
  await queryClient.invalidateQueries({
    queryKey: participantQueryKeys.detail(participant.id),
    exact: true,
  });
}

function closeResult() {
  setResult(null);
  setOpen(false);
}
```

Use the shared `Dialog` for focus trap/restore. Render the password only when
`result !== null`; do not toast it, put it in a URL, or add it to query data.
Clear both result and reason when the result dialog closes.

- [ ] **Step 5: Mount the card in participant detail**

Place it after the registration information and before reconciliation. Show
normal state or `Troca obrigatória até <formatted time>` without exposing any
credential.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: all focused suites PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/participants apps/web/src/features/admin-mutation-contracts.spec.ts apps/web/src/app/admin/participantes/participants-client.spec.tsx ':(literal)apps/web/src/app/admin/participantes/[id]'
git commit -m "feat: add participant password reset admin UI"
```

---

### Task 9: Build the required-password participant page

**Files:**
- Create: `apps/web/src/app/trocar-senha/page.tsx`
- Create: `apps/web/src/app/trocar-senha/change-required-password-form.tsx`
- Create: `apps/web/src/app/trocar-senha/change-required-password-form.spec.tsx`
- Modify: `apps/web/src/features/auth/auth.validation.ts`

**Interfaces:**
- Produces: `/trocar-senha` and a form that verifies session state, validates
  password/confirmation, completes the change, and routes to `/login`.
- Consumes: `AuthShell`, `participantPasswordSchema`,
  `fetchSessionSecurity`, `changeRequiredPassword`, and coded `ApiError`s.

- [ ] **Step 1: Write failing page/form tests**

Cover loading session state, `401` to `/login`, non-required state to `/home`,
password-policy messages, mismatched confirmation, `PASSWORD_MUST_CHANGE`,
`PASSWORD_RESET_INVALID`, double-submit prevention, and success toast plus
`router.replace('/login')`.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
npm --workspace web test -- src/app/trocar-senha/change-required-password-form.spec.tsx
```

Expected: FAIL because the route/form do not exist.

- [ ] **Step 3: Add shared definitive-password schema**

```ts
export const requiredPasswordChangeSchema = z
  .object({
    newPassword: participantPasswordSchema,
    confirmation: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmation, {
    path: ['confirmation'],
    message: 'As senhas precisam ser iguais.',
  });
```

- [ ] **Step 4: Implement the form behavior**

On mount call `fetchSessionSecurity()`. Redirect `401` to `/login`, redirect
`passwordChangeRequired: false` to `/home`, and render the form only when true.
Submit only `newPassword`; preserve both fields after errors. Map known codes to:

```ts
const passwordErrorCopy = {
  PASSWORD_MUST_CHANGE: 'Escolha uma senha diferente da temporária.',
  PASSWORD_RESET_INVALID: 'A senha temporária expirou ou foi substituída. Solicite outro reset.',
} as const;
```

On `204`, show `Senha definida. Entre novamente.` and replace `/login`.

- [ ] **Step 5: Create the page with existing auth visual language**

```tsx
export default function ChangeRequiredPasswordPage() {
  return (
    <AuthShell
      eyebrow="proteção da conta"
      title="Defina sua nova senha."
      description="A senha temporária libera somente esta etapa. Depois, entre novamente com sua senha definitiva."
    >
      <ChangeRequiredPasswordForm />
    </AuthShell>
  );
}
```

- [ ] **Step 6: Run focused test and verify GREEN**

Run the Step 2 command again.

Expected: form suite PASS.

- [ ] **Step 7: Run all web tests affected by auth navigation**

Run:

```bash
npm --workspace web test -- src/app/login src/app/trocar-senha src/hooks/use-auth.spec.tsx src/proxy.spec.ts src/lib/http/client.spec.ts
```

Expected: all selected suites PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/trocar-senha apps/web/src/features/auth/auth.validation.ts
git commit -m "feat: add required participant password change page"
```

---

### Task 10: Update Marco 13 and run the complete verification gate

**Files:**
- Modify: `docs/plan.md`
- Verify: all files changed in Tasks 1–9.

**Interfaces:**
- Produces: roadmap coverage and fresh evidence that schema, API, UI, tests,
  lint, and builds agree.
- Consumes: every previous task.

- [ ] **Step 1: Add the roadmap deliverable and criterion**

Add to Marco 13 tasks:

```md
- Permitir que somente o administrador geral redefina a senha de participante
  para uma credencial temporária de exibição única e validade de 24 horas,
  revogando sessões e exigindo troca antes de liberar as demais áreas.
- Auditar o reset sem registrar senha/hash; a senha definitiva é escolhida pelo
  participante e encerra novamente todas as sessões.
```

Add to acceptance criteria:

```md
- Reset de participante invalida a senha e as sessões anteriores; a senha
  temporária só libera a troca obrigatória e deixa de funcionar após a definição
  da senha definitiva.
```

- [ ] **Step 2: Run Prisma verification**

Run:

```bash
npm --workspace api run prisma:generate
npm --workspace api run prisma:validate
```

Expected: both commands exit 0.

- [ ] **Step 3: Run backend unit, lint, and build gates**

Run:

```bash
npm --workspace api test
npm --workspace api run lint:check
npm --workspace api run build
```

Expected: all Jest suites PASS, ESLint reports no errors, Nest build exits 0.

- [ ] **Step 4: Run backend e2e gate**

Run:

```bash
npm --workspace api run test:e2e -- participant-password-reset.e2e-spec.ts admin-authorization.e2e-spec.ts
```

Expected: both suites PASS against the configured disposable PostgreSQL test database.

- [ ] **Step 5: Run frontend test, lint, and build gates**

Run:

```bash
npm --workspace web test
npm --workspace web run lint
npm --workspace web run build
```

Expected: all Vitest suites PASS, ESLint reports no errors, Next.js production build exits 0.

- [ ] **Step 6: Inspect secrets and diff hygiene**

Run:

```bash
rg -n "temporaryPassword|passwordHash|newPassword" apps/api/src/audit apps/api/src/admin apps/web/src/app/admin/participantes
git diff --check
git status --short
```

Expected: matches are limited to typed request/response handling and explicit
tests that prove exclusion; no audit snapshot/log/metric contains a password or
hash; `git diff --check` exits 0; status lists only intended changes.

- [ ] **Step 7: Commit documentation and final integration adjustments**

```bash
git add docs/plan.md
git commit -m "docs: add participant password reset to marco 13"
```

- [ ] **Step 8: Record final evidence**

Run:

```bash
git status --short
git log -10 --oneline
```

Expected: clean status and one focused commit per task.

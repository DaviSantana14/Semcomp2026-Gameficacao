# Marco 13 Specialized Administrative Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the lean Marco 13: three backend-enforced administrative profiles, general-admin operator provisioning with one-time activation, and manual participant-password reset with forced definitive change.

**Architecture:** Keep `UserRole.ADMIN`, add only `AdminProfile`, and derive operator state from the existing `isActive` and `passwordHash` fields. Nest routes declare allowed profiles directly through one guard; Next.js uses the profile only to filter navigation. Operator lifecycle, activation, last-general protection, participant reset, session revocation, and audit writes use the repository/transaction patterns already present in the codebase.

**Tech Stack:** NestJS 11, Prisma 7.8 with PostgreSQL, bcrypt 6, class-validator 0.15, Jest/Supertest, Next.js 16 App Router with `proxy.ts`, React 19, TanStack Query 5, React Hook Form 7, Zod 4, Vitest/Testing Library.

## Global Constraints

- Administrative profiles are exactly `GENERAL`, `SHOP`, and `ACTIVITIES`; there are no custom capabilities or mixed profiles.
- Operator state is derived only from `isActive` and `passwordHash`; do not add an administrative-status enum.
- `GENERAL` has full access; `SHOP` has only shop administration; `ACTIVITIES` has only activities and codes.
- Backend profile guards are authoritative. Frontend navigation and `proxy.ts` are usability checks only.
- Activation codes expire after 1 hour, have at least 100 bits of entropy, are stored only as SHA-256 hashes, and are displayed once outside email/URL/log/metric/audit/query cache.
- Administrative passwords keep the existing 12–64 Unicode code-point and 72-byte UTF-8 policy with asynchronous bcrypt cost 12.
- Participant temporary passwords expire after 24 hours; definitive participant passwords keep the existing 8–64 Unicode code-point and 72-byte UTF-8 policy.
- Authenticated management mutations require a trimmed 10–500 character reason and request ID.
- The last active `GENERAL` with a password cannot be inactivated, reset, or moved to another profile, including under concurrent requests.
- Inactivation, identity/profile edits, and resets revoke affected sessions as defined by the specification.
- Shop/activity operational responses contain participant ID and name only, never CPF or email.
- Reuse the existing administrative mutation rate limit; add a named limit only for public activation.
- No operator deletion, custom permission editor, blocked/deactivated distinction, or all-routes/all-profiles e2e matrix.

---

### Task 1: Persist profiles, activations, and reset state and make sessions profile-aware

**Files:**
- Modify: `apps/api/prisma/schema/users.prisma`
- Create: `apps/api/prisma/migrations/20260823120000_add_marco13_admin_profiles/migration.sql`
- Create: `apps/api/src/common/specs/marco13-schema-migration.spec.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/prisma/seed-config.spec.ts`
- Modify: `apps/api/src/presence/sessions.repository.ts`
- Modify: `apps/api/src/presence/sessions.service.ts`
- Modify: `apps/api/src/presence/specs/sessions.service.spec.ts`
- Modify: `apps/api/src/common/request-context.ts`
- Modify: `apps/api/src/auth/jwt.strategy.ts`
- Modify: `apps/api/src/auth/specs/jwt-session.strategy.spec.ts`
- Modify: `apps/api/src/users/users.repository.ts`
- Modify: `apps/api/src/users/dto/user-response.dto.ts`
- Modify: `apps/api/src/users/specs/users.service.spec.ts`
- Modify: `apps/api/src/cli/set-admin-password.ts`
- Modify: `apps/api/src/cli/set-admin-password.spec.ts`
- Modify: `apps/api/test/support/admin-e2e-harness.ts`

**Interfaces:**
- Produces: Prisma `AdminProfile`, `AdminActivation`, participant reset fields, session identity `adminProfile`, and `/users/me.adminProfile`/`passwordChangeRequired`.
- Consumes: existing `UserRole`, `UserSession`, bcrypt bootstrap, and session validation.

- [ ] **Step 1: Write failing schema and identity tests**

The migration test must assert the enum/model/fields, backfill, foreign keys,
hash-only activation storage, and these checks:

```ts
expect(usersSchema).toContain('enum AdminProfile');
expect(usersSchema).toContain('GENERAL');
expect(usersSchema).toContain('SHOP');
expect(usersSchema).toContain('ACTIVITIES');
expect(usersSchema).toContain('model AdminActivation');
expect(usersSchema).not.toContain('enum AdminAccountStatus');
expect(migration).toContain('User_admin_profile_check');
expect(migration).toContain('User_participant_reset_state_check');
expect(migration).toContain("'GENERAL'::\"AdminProfile\"");
```

Session/user tests must prove that an active shop admin returns
`adminProfile: SHOP`, inactive admins fail session start/validation, participants
return `adminProfile: null`, and `passwordResetRequired` is exposed only as
`passwordChangeRequired`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- marco13-schema-migration seed-config sessions.service jwt-session users.service set-admin-password
```

Expected: FAIL because profile, activation, and reset contracts are absent.

- [ ] **Step 3: Add the minimal Prisma schema**

Add exactly:

```prisma
enum AdminProfile {
  GENERAL
  SHOP
  ACTIVITIES
}

model User {
  // existing fields remain
  adminProfile            AdminProfile?
  passwordResetRequired   Boolean           @default(false)
  passwordResetExpiresAt  DateTime?
  adminActivations        AdminActivation[] @relation("AdminActivationSubject")
  adminActivationsCreated AdminActivation[] @relation("AdminActivationCreator")

  @@index([role, adminProfile, isActive, createdAt])
}

model AdminActivation {
  id               String    @id @default(cuid())
  adminUserId      String
  codeHash         String    @unique
  expiresAt        DateTime
  usedAt           DateTime?
  revokedAt        DateTime?
  createdByAdminId String
  createdAt        DateTime  @default(now())
  adminUser        User      @relation("AdminActivationSubject", fields: [adminUserId], references: [id], onDelete: Restrict)
  createdByAdmin   User      @relation("AdminActivationCreator", fields: [createdByAdminId], references: [id], onDelete: Restrict)

  @@index([adminUserId, createdAt])
  @@index([expiresAt])
}
```

Do not add an account-status field or permission tables.

- [ ] **Step 4: Write the migration and safe seed backfill**

Backfill existing admins as general before adding the profile check:

```sql
UPDATE "User"
SET "adminProfile" = 'GENERAL'::"AdminProfile"
WHERE "role" = 'ADMIN'::"UserRole";

ALTER TABLE "User" ADD CONSTRAINT "User_admin_profile_check" CHECK (
  ("role" = 'PARTICIPANT'::"UserRole" AND "adminProfile" IS NULL)
  OR
  ("role" = 'ADMIN'::"UserRole" AND "adminProfile" IS NOT NULL)
);

ALTER TABLE "User" ADD CONSTRAINT "User_participant_reset_state_check" CHECK (
  ("role" = 'ADMIN'::"UserRole" AND "passwordResetRequired" = FALSE AND "passwordResetExpiresAt" IS NULL)
  OR
  ("role" = 'PARTICIPANT'::"UserRole" AND (
    ("passwordResetRequired" = TRUE AND "passwordResetExpiresAt" IS NOT NULL)
    OR ("passwordResetRequired" = FALSE AND "passwordResetExpiresAt" IS NULL)
  ))
);
```

The seed creates the initial admin with `adminProfile: GENERAL` and no password.
On rerun it may refresh identity/profile but must preserve existing
`passwordHash`, `passwordChangedAt`, and `isActive`.

- [ ] **Step 5: Extend session and response selects**

Add to `SessionUserIdentity`, request identity, and all relevant selects:

```ts
adminProfile: AdminProfile | null;
passwordResetRequired: boolean;
passwordResetExpiresAt: Date | null;
```

Keep the existing `isActive: true` session predicate. Return from the public
user DTO:

```ts
adminProfile: AdminProfile | null;
passwordChangeRequired: boolean;
```

Do not return reset expiry or activation state from `/users/me`.

- [ ] **Step 6: Keep bootstrap compatible**

The interactive `set-admin-password` command locks the matching general admin,
sets the password/timestamp, ensures `isActive: true`, and revokes current
sessions. It still receives the password without echo and never prints it.

- [ ] **Step 7: Run Prisma and focused GREEN gates**

Run:

```bash
npm --workspace api run prisma:generate
npm --workspace api run prisma:validate
npm --workspace api test -- marco13-schema-migration seed-config sessions.service jwt-session users.service set-admin-password
```

Expected: Prisma exits 0 and all selected suites PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma apps/api/src/common/specs/marco13-schema-migration.spec.ts apps/api/src/prisma apps/api/src/presence apps/api/src/auth/jwt.strategy.ts apps/api/src/auth/specs/jwt-session.strategy.spec.ts apps/api/src/users apps/api/src/cli apps/api/test/support/admin-e2e-harness.ts
git commit -m "feat: persist administrative profiles"
```

---

### Task 2: Enforce profiles directly on administrative routes and remove operational PII

**Files:**
- Create: `apps/api/src/auth/admin-profiles.decorator.ts`
- Create: `apps/api/src/auth/admin-profiles.guard.ts`
- Create: `apps/api/src/auth/specs/admin-profiles.guard.spec.ts`
- Create: `apps/api/src/auth/specs/admin-route-profiles.spec.ts`
- Modify: administrative controllers/modules under `apps/api/src/admin`
- Modify: `apps/api/src/actions/admin-actions.controller.ts`
- Modify: `apps/api/src/actions/actions.module.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.controller.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.module.ts`
- Modify: `apps/api/src/rewards/admin-rewards.controller.ts`
- Modify: `apps/api/src/rewards/rewards.module.ts`
- Modify: `apps/api/src/audit/audit.controller.ts`
- Modify: `apps/api/src/audit/audit.module.ts`
- Modify: `apps/api/src/exports/admin-exports.controller.ts`
- Modify: `apps/api/src/exports/exports.module.ts`
- Modify: `apps/api/src/security/security-http-metrics.controller.ts`
- Modify: `apps/api/src/security/security.module.ts`
- Modify: `apps/api/src/security/app-throttler.guard.ts`
- Modify: `apps/api/src/security/app-throttler.guard.spec.ts`
- Modify: `apps/api/src/actions/dto/reusable-code-history-response.dto.ts`
- Modify: `apps/api/src/claim-codes/dto/code-redemption-response.dto.ts`
- Modify: `apps/api/src/claim-codes/dto/claim-code-history-response.dto.ts`
- Modify: affected action/code/reward repositories and controller tests.

**Interfaces:**
- Produces: `@AdminProfiles(...profiles)`, `AdminProfilesGuard`, complete route profile declarations, and operational participant `{ id, name }` responses.
- Consumes: Task 1 `adminProfile` on the database-backed request identity.

- [ ] **Step 1: Write failing guard and route-architecture tests**

Guard tests cover absent user, participant, null profile, denied profile, and
allowed profile. The architecture test reflects over every request-mapped method
of administrative controllers and fails if class+method metadata resolves to an
empty profile list.

Representative expectations:

```ts
expect(canActivate(requestAs('GENERAL'), ['GENERAL'])).toBe(true);
expect(() => canActivate(requestAs('SHOP'), ['GENERAL'])).toThrow(
  ForbiddenException,
);
expect(canActivate(requestAs('SHOP'), ['GENERAL', 'SHOP'])).toBe(true);
```

Add DTO/repository tests asserting serialized shop/code rows contain no `email`
or `cpf`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- admin-profiles.guard admin-route-profiles admin-actions claim-codes admin-rewards app-throttler
```

Expected: FAIL because the profile guard and minimized contracts do not exist.

- [ ] **Step 3: Implement the decorator and fail-closed guard**

```ts
export const ADMIN_PROFILES_KEY = 'admin:profiles';
export const AdminProfiles = (...profiles: AdminProfile[]) =>
  SetMetadata(ADMIN_PROFILES_KEY, profiles);
```

`AdminProfilesGuard` reads class/method metadata with `getAllAndOverride`. When a
declaration exists, require `role === ADMIN`, non-null profile, and inclusion in
the list. Failure returns:

```ts
new ForbiddenException({
  statusCode: 403,
  code: 'ADMIN_PROFILE_REQUIRED',
  message: 'Você não tem permissão para acessar este recurso.',
});
```

Register the guard in each owning feature module, following the current
`RolesGuard` provider pattern.

- [ ] **Step 4: Apply the three route groups**

Use exactly:

```ts
@AdminProfiles(AdminProfile.GENERAL)
// dashboard, participants, adjustments, movements, reconciliation,
// audit, presence, security metrics, PII exports, operator management

@AdminProfiles(AdminProfile.GENERAL, AdminProfile.SHOP)
// reward catalog and redemption transitions

@AdminProfiles(AdminProfile.GENERAL, AdminProfile.ACTIVITIES)
// actions, reusable codes, claim codes, batches, and artifacts
```

Keep `JwtAuthGuard`, `CsrfGuard`, and existing named bulk/export rate limits.
Remove broad `@Roles(UserRole.ADMIN)` declarations from administrative routes.
Update `AppThrottlerGuard` so the presence of `ADMIN_PROFILES_KEY` selects the
existing `admin-mutation` policy for mutations; otherwise removing `@Roles`
would accidentally downgrade those routes to the participant limit.

- [ ] **Step 5: Remove CPF/email from operational responses**

Change action/code/shop operational participant contracts and Prisma selects to:

```ts
participant: { id: string; name: string };
```

Apply the same shape for every profile; do not branch the response by caller.
General admins still obtain full data through `/admin/participants` and PII
exports.

- [ ] **Step 6: Run focused GREEN tests**

Run the Step 2 command.

Expected: selected suites PASS and the architecture test reports no unprotected
administrative route.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "feat: enforce administrative profiles"
```

---

### Task 3: Implement operator management, activation, audit, and the single new rate limit

**Files:**
- Create: `apps/api/src/admin/admin-activation-code.ts`
- Create: `apps/api/src/admin/specs/admin-activation-code.spec.ts`
- Create: `apps/api/src/admin/admin-operators.repository.ts`
- Create: `apps/api/src/admin/admin-operators.service.ts`
- Create: `apps/api/src/admin/admin-operators.controller.ts`
- Create: `apps/api/src/admin/admin-activation.controller.ts`
- Create: `apps/api/src/admin/specs/admin-operators.repository.spec.ts`
- Create: `apps/api/src/admin/specs/admin-operators.service.spec.ts`
- Create: `apps/api/src/admin/specs/admin-operators.controller.spec.ts`
- Create: `apps/api/src/admin/specs/admin-activation.controller.spec.ts`
- Create: `apps/api/src/admin/dto/create-admin-operator.dto.ts`
- Create: `apps/api/src/admin/dto/update-admin-operator.dto.ts`
- Create: `apps/api/src/admin/dto/update-admin-operator-status.dto.ts`
- Create: `apps/api/src/admin/dto/reset-admin-operator-activation.dto.ts`
- Create: `apps/api/src/admin/dto/activate-admin.dto.ts`
- Create: `apps/api/src/admin/dto/admin-operators-query.dto.ts`
- Create: `apps/api/src/admin/dto/admin-operator-response.dto.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/audit/audit.service.ts`
- Modify: `apps/api/src/audit/audit-operation-matrix.spec.ts`
- Modify: `apps/api/src/audit/audit.service.spec.ts`
- Modify: `apps/api/prisma/schema/audit.prisma`
- Modify: Task 1 migration SQL for audit enum values.
- Modify: `apps/api/src/security/rate-limit-policy.decorator.ts`
- Modify: `apps/api/src/security/app-throttler.guard.ts`
- Modify: `apps/api/src/security/app-throttler.guard.spec.ts`

**Interfaces:**
- Produces: operator list/create/update/status/reset APIs, public `POST /auth/admin/activate`, one-hour activation result, last-general protection, six safe audit operations, and `activation` rate policy.
- Consumes: Task 1 schema/session fields, Task 2 `GENERAL` guard, `AdminPasswordService`, transactional audit writer, and existing session revocation pattern.

- [ ] **Step 1: Write failing primitive, service, controller, audit, and rate tests**

Cover code format/hash/60-minute TTL, DTO normalization/reason, generic uniqueness
conflict, create/edit/inactivate/reactivate/reset, session revocation, pending-code
replacement, invalid activation states, concurrent code use, and last-general
concurrency. Audit serialization must omit code/password/hash/CPF/email.

Exact derived state assertions:

```ts
expect(toOperatorState({ isActive: true, passwordHash: null })).toBe('PENDING_ACTIVATION');
expect(toOperatorState({ isActive: true, passwordHash: 'hash' })).toBe('ACTIVE');
expect(toOperatorState({ isActive: false, passwordHash: 'hash' })).toBe('INACTIVE');
```

Rate tests expect only:

```ts
activation: { name: 'admin-activation', limit: 5, ttl: 15 * 60_000 }
```

and prove other authenticated mutations still use the existing admin policy.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- admin-activation-code admin-operators admin-activation audit-operation-matrix app-throttler
```

Expected: FAIL because operator APIs and activation contracts are absent.

- [ ] **Step 3: Implement activation-code primitives**

Use the 32-symbol alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 20 symbols, and
rejection sampling. Format four groups of five. Export:

```ts
export const ADMIN_ACTIVATION_TTL_MS = 60 * 60 * 1000;
export function createAdminActivationCode(): string;
export function normalizeAdminActivationCode(code: string): string;
export function hashAdminActivationCode(code: string): string;
```

Normalization removes spaces/hyphens and uppercases. Hash the normalized value
with SHA-256. Reject invalid alphabet/length before lookup.

- [ ] **Step 4: Implement repository transactions**

The repository lists only admin users and never selects password/code hashes for
responses. Mutation methods lock the target with `SELECT ... FOR UPDATE`, revoke
open sessions, and revoke pending activations. Before inactivating/resetting or
moving an active general, lock all active generals with passwords in ID order:

```sql
SELECT "id"
FROM "User"
WHERE "role" = 'ADMIN'::"UserRole"
  AND "adminProfile" = 'GENERAL'::"AdminProfile"
  AND "isActive" = TRUE
  AND "passwordHash" IS NOT NULL
ORDER BY "id"
FOR UPDATE;
```

Reject if the target is the only returned ID. Activation consumption locks the
activation and subject, then rechecks unused/unrevoked/unexpired code, matching
CPF/email, active subject, and null password.

The last-general rejection is stable:

```ts
new ConflictException({
  statusCode: 409,
  code: 'LAST_ACTIVE_GENERAL_ADMIN',
  message: 'É necessário manter ao menos um administrador geral ativo.',
});
```

- [ ] **Step 5: Implement lifecycle service and routes**

Expose:

```text
GET    /admin/operators
POST   /admin/operators
PATCH  /admin/operators/:id
PATCH  /admin/operators/:id/status
POST   /admin/operators/:id/activation-reset
POST   /auth/admin/activate
```

Management routes require `GENERAL`; public activation uses `AllowedOriginGuard`
and `RateLimitPolicy('activation')`. Create/reset returns
`{ operator, activationCode, expiresAt }` once. Status accepts only
`{ isActive: boolean, reason }`. Editing identity/profile and inactivation revoke
sessions; reactivation preserves the existing password. Reset clears password,
sets active, revokes sessions/codes, and issues a new code. Activation returns
`204` and no session.

Map response state without persistence:

```ts
export function toOperatorState(input: {
  isActive: boolean;
  passwordHash: string | null;
}): 'PENDING_ACTIVATION' | 'ACTIVE' | 'INACTIVE' {
  if (!input.isActive) return 'INACTIVE';
  return input.passwordHash === null ? 'PENDING_ACTIVATION' : 'ACTIVE';
}
```

- [ ] **Step 6: Add minimal audit contracts**

Add entity `ADMIN_OPERATOR` and operations:

```text
ADMIN_OPERATOR_CREATED
ADMIN_OPERATOR_UPDATED
ADMIN_OPERATOR_STATUS_CHANGED
ADMIN_OPERATOR_ACTIVATION_RESET
ADMIN_OPERATOR_ACTIVATED
PARTICIPANT_PASSWORD_RESET
```

Operator snapshots permit ID, display name, profile, active flag, and timestamps.
Participant-reset snapshots permit only participant ID, required flag, and
nullable expiry. Metadata permits only `sessionsRevoked`. Activation uses a
fixed safe reason; management uses the supplied 10–500 character reason.

- [ ] **Step 7: Register dependencies without a new domain module**

Keep repository/services/controllers in `AdminModule`. Export
`AdminPasswordService` from `AuthModule` and import `AuthModule` into
`AdminModule`; `AuthModule` does not import `AdminModule`, so no cycle is created.
Register `AdminActivationController` in `AdminModule` even though its route path
is `/auth/admin/activate`.

- [ ] **Step 8: Run focused GREEN tests**

Run the Step 2 command.

Expected: selected suites PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/admin apps/api/src/auth/auth.module.ts apps/api/src/audit apps/api/src/security apps/api/prisma
git commit -m "feat: manage and activate admin operators"
```

---

### Task 4: Build profile-aware navigation, operator management, and public activation UI

**Files:**
- Modify: `apps/web/src/features/users/users.types.ts`
- Modify: all typed `User` fixtures.
- Create: `apps/web/src/features/auth/admin-profile-routes.ts`
- Create: `apps/web/src/features/auth/admin-profile-routes.spec.ts`
- Create: `apps/web/src/features/operators/operators.types.ts`
- Create: `apps/web/src/features/operators/operators.service.ts`
- Create: `apps/web/src/features/operators/operators.service.spec.ts`
- Create: `apps/web/src/app/admin/operadores/page.tsx`
- Create: `apps/web/src/app/admin/operadores/operators-client.tsx`
- Create: `apps/web/src/app/admin/operadores/operators-client.spec.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-form-dialog.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-status-dialog.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-activation-result-dialog.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-activation-result-dialog.spec.tsx`
- Modify: `apps/web/src/app/admin/_components/admin-shell.tsx`
- Modify: `apps/web/src/app/admin/_components/admin-shell.spec.tsx`
- Modify: `apps/web/src/features/auth/auth.types.ts`
- Modify: `apps/web/src/features/auth/auth.service.ts`
- Modify: `apps/web/src/features/auth/auth.validation.ts`
- Create: `apps/web/src/app/ativar-admin/page.tsx`
- Create: `apps/web/src/app/ativar-admin/admin-activation-form.tsx`
- Create: `apps/web/src/app/ativar-admin/admin-activation-form.spec.tsx`
- Modify: `apps/web/src/app/login/admin/admin-login-form.tsx`
- Modify: `apps/web/src/app/login/admin/admin-login-form.spec.tsx`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/proxy.spec.ts`

**Interfaces:**
- Produces: frontend `AdminProfile`, static profile route map, `/admin/operadores`, one-time activation result dialog, `/ativar-admin`, and profile-specific post-login landing.
- Consumes: Task 1 user response and Task 3 operator/activation APIs.

- [ ] **Step 1: Write failing navigation, service, and form tests**

Assert exact navigation:

```ts
expect(firstAdminRoute('GENERAL')).toBe('/admin');
expect(firstAdminRoute('SHOP')).toBe('/admin/lojinha');
expect(firstAdminRoute('ACTIVITIES')).toBe('/admin/atividades');
```

Render each profile and assert only permitted links. Add operator service payload
tests, reason validation, create/edit/status/reset behavior, last-general error,
double-submit prevention, activation form validation, and public proxy access.
One-time result tests assert closing removes the code from DOM and state and that
it never reaches toast/router/query cache.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace web test -- src/features/auth/admin-profile-routes.spec.ts src/app/admin/_components/admin-shell.spec.tsx src/features/operators src/app/admin/operadores src/app/ativar-admin src/app/login/admin/admin-login-form.spec.tsx src/proxy.spec.ts
```

Expected: FAIL because profile navigation and operator features are absent.

- [ ] **Step 3: Add frontend profile and operator contracts**

```ts
export type AdminProfile = 'GENERAL' | 'SHOP' | 'ACTIVITIES';

export type User = {
  // existing fields
  adminProfile: AdminProfile | null;
  passwordChangeRequired: boolean;
};

export type AdminOperatorState = 'PENDING_ACTIVATION' | 'ACTIVE' | 'INACTIVE';

export type OperatorActivationResult = {
  operator: AdminOperator;
  activationCode: string;
  expiresAt: string;
};
```

`AdminOperator` contains ID, identity, profile, derived state, activation expiry,
login/password timestamps, and create/update timestamps. Do not add a capability
array.

- [ ] **Step 4: Filter navigation directly by profile**

Use a static map where general sees all areas plus Operadores, shop sees only
Lojinha, and activities sees Atividades/Códigos. Direct navigation to an area
outside the profile redirects to `firstAdminRoute(profile)`. Admin login uses the
same helper. Backend `403` remains the real boundary.

```ts
export function firstAdminRoute(profile: AdminProfile) {
  return {
    GENERAL: '/admin',
    SHOP: '/admin/lojinha',
    ACTIVITIES: '/admin/atividades',
  }[profile];
}
```

- [ ] **Step 5: Implement operator management with local secret state**

Use existing card/dialog/pagination patterns. Every mutation collects reason.
Create/reset execute imperatively and store the secret only in:

```ts
const [activationResult, setActivationResult] =
  useState<OperatorActivationResult | null>(null);

function closeActivationResult() {
  setActivationResult(null);
}
```

Invalidate list data using responses that omit the code. Display derived states
“Aguardando ativação”, “Ativo”, and “Inativo”.

- [ ] **Step 6: Implement public activation**

`activateAdmin` posts code/CPF/email/password with `skipCsrf: true` and installs
no session token. `/ativar-admin` has code, CPF, email, password, confirmation,
never reads query parameters, and on `204` resets then routes to `/login/admin`.
Add a link from admin login.

- [ ] **Step 7: Keep proxy optimistic**

Allow `/ativar-admin` without a cookie. Do not decode JWT/profile or add profile
authorization to `proxy.ts`.

- [ ] **Step 8: Run focused GREEN tests**

Run the Step 2 command.

Expected: all selected suites PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat: add operator administration flows"
```

---

### Task 5: Implement administrative participant reset and restricted temporary sessions

**Files:**
- Create: `apps/api/src/auth/participant-temporary-password.ts`
- Create: `apps/api/src/auth/specs/participant-temporary-password.spec.ts`
- Create: `apps/api/src/auth/allow-password-change-required.decorator.ts`
- Modify: `apps/api/src/auth/jwt-auth.guard.ts`
- Modify: `apps/api/src/auth/specs/jwt-auth.guard.spec.ts`
- Create: `apps/api/src/auth/dto/change-required-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/specs/auth.service.spec.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/specs/auth.controller.spec.ts`
- Modify: `apps/api/src/presence/sessions.repository.ts`
- Modify: `apps/api/src/admin/admin-participants.repository.ts`
- Modify: `apps/api/src/admin/admin-participants.service.ts`
- Modify: `apps/api/src/admin/specs/admin-participants.service.spec.ts`
- Create: `apps/api/src/admin/dto/reset-participant-password.dto.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/admin/specs/admin.controller.spec.ts`
- Modify: participant list/detail response DTOs.
- Modify: `apps/api/src/audit/audit.service.ts`
- Modify: `apps/api/src/audit/audit.service.spec.ts`

**Interfaces:**
- Produces: one-time 24-hour participant credential, `POST /admin/participants/:id/password-reset`, restricted temporary sessions, reset-aware CSRF, and `POST /auth/password/change-required`.
- Consumes: Task 1 reset fields, Task 2 general-only route guard, Task 3 audit enum, participant password service, and existing session revocation.

- [ ] **Step 1: Write failing reset, guard, and completion tests**

Cover generator policy/entropy, participant missing, pending conflict, explicit
replacement, 24-hour expiry, session revocation, audit exclusion, temporary
login, blocked normal routes, allowed CSRF/logout/change, expired/replaced state,
same temporary password, invalid definitive password, successful change, and
normal re-login.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- participant-temporary-password admin-participants jwt-auth.guard auth.service auth.controller audit.service
```

Expected: FAIL because reset/restriction endpoints are absent.

- [ ] **Step 3: Implement temporary credential and reset transaction**

Export:

```ts
export const PARTICIPANT_TEMPORARY_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;
export function createParticipantTemporaryPassword(): string;
```

Generate 20 characters with at least 100 bits of entropy and validate through
the existing participant password policy. DTO is:

```ts
export class ResetParticipantPasswordDto {
  @IsString() @Length(10, 500) reason!: string;
  @IsBoolean() replacePending!: boolean;
}
```

Hash before the transaction. Under participant row lock, recheck role/pending
state, update hash/reset flag/exact expiry, revoke open sessions, and write
`PARTICIPANT_PASSWORD_RESET`. Return `{ temporaryPassword, expiresAt }` once.

- [ ] **Step 4: Expose general-only reset**

Add `POST /admin/participants/:id/password-reset` under `GENERAL`. Pending
without replacement returns stable `409 PASSWORD_RESET_PENDING`. Participant
list/detail adds required flag and expiry, never the password/hash. Reuse the
existing authenticated admin mutation limit.

- [ ] **Step 5: Restrict temporary sessions globally**

`@AllowPasswordChangeRequired()` marks only CSRF, logout, and definitive change.
After authentication, `JwtAuthGuard` rejects every other route with:

```ts
new ForbiddenException({
  statusCode: 403,
  code: 'PASSWORD_CHANGE_REQUIRED',
  message: 'Defina uma nova senha para continuar.',
});
```

Participant authentication/session lookup rejects a reset whose expiry is not
future. CSRF returns `{ csrfToken, passwordChangeRequired }`.

- [ ] **Step 6: Implement definitive change transaction**

Validate new password, compare it to the temporary hash, hash before write, then
lock/recheck expected hash/required/expiry. On success set definitive hash,
clear reset fields, update `passwordChangedAt`, revoke all sessions, return
`204`, and clear cookie. Same credential returns `400 PASSWORD_MUST_CHANGE`;
expiry/replacement race returns `401 PASSWORD_RESET_INVALID`.

- [ ] **Step 7: Run focused GREEN tests**

Run the Step 2 command.

Expected: selected suites PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth apps/api/src/presence apps/api/src/admin apps/api/src/audit
git commit -m "feat: reset participant passwords manually"
```

---

### Task 6: Build participant reset and required-change frontend flows

**Files:**
- Modify: `apps/web/src/lib/http/api-error.ts`
- Modify: `apps/web/src/lib/http/request.ts`
- Modify: `apps/web/src/lib/http/client.spec.ts`
- Modify: `apps/web/src/features/participants/participants.types.ts`
- Modify: `apps/web/src/features/participants/participants.service.ts`
- Modify: `apps/web/src/features/auth/auth.types.ts`
- Modify: `apps/web/src/features/auth/auth.service.ts`
- Modify: `apps/web/src/features/auth/auth.validation.ts`
- Modify: `apps/web/src/hooks/use-auth.ts`
- Create: `apps/web/src/hooks/use-auth.spec.tsx`
- Modify: `apps/web/src/app/login/login-form.tsx`
- Modify: `apps/web/src/app/login/login-form.spec.tsx`
- Create: `apps/web/src/app/admin/participantes/[id]/participant-password-reset-card.tsx`
- Create: `apps/web/src/app/admin/participantes/[id]/participant-password-reset-card.spec.tsx`
- Modify: `apps/web/src/app/admin/participantes/[id]/participant-detail-client.tsx`
- Create: `apps/web/src/app/trocar-senha/page.tsx`
- Create: `apps/web/src/app/trocar-senha/change-required-password-form.tsx`
- Create: `apps/web/src/app/trocar-senha/change-required-password-form.spec.tsx`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/proxy.spec.ts`

**Interfaces:**
- Produces: coded API errors, general-only reset card, one-time temporary-password dialog, `/trocar-senha`, and reset-aware redirects.
- Consumes: Task 4 `adminProfile`, Task 5 reset/CSRF/change endpoints.

- [ ] **Step 1: Write failing transport, card, form, and navigation tests**

Cover `ApiError.code`, reset payload/replacement, general-only card, reason
validation, double-submit, one-time password copy/clear, pending state, login
redirect to `/trocar-senha`, direct coded-403 redirect, session loading/401,
password/confirmation policy, known errors, success to login, and proxy cookie
routing.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace web test -- src/lib/http/client.spec.ts src/hooks/use-auth.spec.tsx src/app/login/login-form.spec.tsx "src/app/admin/participantes/[id]/participant-password-reset-card.spec.tsx" src/app/trocar-senha src/proxy.spec.ts
```

Expected: FAIL because coded reset flows are absent.

- [ ] **Step 3: Add coded errors and transport**

Parse backend `code` into `ApiError`. Add:

```ts
resetParticipantPassword(id, { reason, replacePending });
fetchSessionSecurity();
changeRequiredPassword({ newPassword });
```

Only successful definitive change clears client CSRF. Extend participant types
with reset flag/expiry.

- [ ] **Step 4: Implement one-time reset card**

Render only when `user.adminProfile === 'GENERAL'`. Store
`{ temporaryPassword, expiresAt }` only in local component state. Closing clears
result and reason before restoring focus. Never toast the password or add it to
query data/URL.

- [ ] **Step 5: Implement required-change page and redirects**

`/trocar-senha` calls session security: `401 -> /login`, flag false -> `/home`,
flag true -> form. Submit only the new password. Map `PASSWORD_MUST_CHANGE` and
`PASSWORD_RESET_INVALID`. On `204`, show confirmation and replace `/login`.
Participant login with the flag also routes to `/trocar-senha`; `useMe` redirects
only coded `PASSWORD_CHANGE_REQUIRED`, not every `403`.

- [ ] **Step 6: Update proxy optimistically**

Require a cookie for `/trocar-senha`; keep backend session state authoritative.

- [ ] **Step 7: Run focused GREEN tests**

Run the Step 2 command.

Expected: selected suites PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat: add forced participant password change"
```

---

### Task 7: Prove only the critical Marco 13 flows end to end

**Files:**
- Create: `apps/api/test/marco13-admin-profiles.e2e-spec.ts`
- Create: `apps/api/test/participant-password-reset.e2e-spec.ts`
- Modify: `apps/api/test/support/admin-e2e-harness.ts`
- Modify: `apps/api/test/admin-authorization.e2e-spec.ts`

**Interfaces:**
- Produces: representative direct-API authorization evidence and complete sensitive-flow evidence without an all-routes/all-profiles matrix.
- Consumes: Tasks 1–6.

- [ ] **Step 1: Add explicit-profile e2e fixtures**

Add a helper that creates `GENERAL`, `SHOP`, or `ACTIVITIES` with explicit active
state/password. Do not let generic login silently activate inactive/pending users.

- [ ] **Step 2: Write the representative profile and operator suite**

One scenario must:

1. create and activate one user of each profile;
2. prove shop can mutate a reward and receives `403` for one activity route and
   one participant route;
3. prove activities can mutate an action/code and receives `403` for one shop
   route and one participant route;
4. snapshot tables around denied mutations and prove no write;
5. prove operational responses omit CPF/email;
6. prove expired/reused/concurrent activation failure;
7. prove inactivation/reset session revocation;
8. prove concurrent last-general removal leaves one available general;
9. serialize audit events and prove no code/password/hash.

- [ ] **Step 3: Write the participant reset suite**

Perform reset, old-session failure, temporary login, blocked normal route,
allowed CSRF/change, definitive change, temporary-session revocation, old/temp
password failure, and definitive login. Add one test for pending conflict,
explicit replacement, and expiry.

- [ ] **Step 4: Run e2e and verify RED/GREEN integration**

Run:

```bash
npm --workspace api run test:e2e -- marco13-admin-profiles.e2e-spec.ts participant-password-reset.e2e-spec.ts admin-authorization.e2e-spec.ts
```

Expected: first run exposes any integration gaps; after fixing production wiring
without weakening assertions, all three suites PASS.

- [ ] **Step 5: Run architecture/focused regression tests**

Run:

```bash
npm --workspace api test -- admin-route-profiles admin-operators admin-activation admin-participants jwt-auth.guard auth.service
npm --workspace web test -- src/app/admin/_components/admin-shell.spec.tsx src/app/admin/operadores src/app/ativar-admin src/app/trocar-senha
```

Expected: selected API and web suites PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test apps/api/src apps/web/src
git commit -m "test: cover critical marco 13 flows"
```

---

### Task 8: Align documentation and run the complete verification gate

**Files:**
- Modify: `docs/plan.md`
- Verify: `docs/superpowers/specs/2026-08-23-marco-13-specialized-admin-permissions-design.md`
- Verify: `docs/superpowers/specs/2026-08-23-participant-admin-password-reset-design.md`
- Verify: `docs/superpowers/plans/2026-08-23-participant-admin-password-reset.md`
- Verify: all files changed in Tasks 1–7.

**Interfaces:**
- Produces: roadmap status, canonical-document consistency, and fresh full-suite/build evidence.
- Consumes: every prior task.

- [ ] **Step 1: Verify documentation consistency**

Confirm roadmap/spec/plan all say: direct profile authorization; no capability
matrix; no administrative-status enum; existing admin mutation limit plus only
activation-specific limit; representative e2e coverage; and eight implementation
tasks. Confirm old participant-reset documents point to these canonical files.

- [ ] **Step 2: Run Prisma and full API gates**

Run:

```bash
npm --workspace api run prisma:generate
npm --workspace api run prisma:validate
npm --workspace api test
npm --workspace api run lint:check
npm --workspace api run build
npm --workspace api run test:e2e -- marco13-admin-profiles.e2e-spec.ts participant-password-reset.e2e-spec.ts admin-authorization.e2e-spec.ts
```

Expected: every command exits 0 and all Jest/e2e suites PASS.

- [ ] **Step 3: Run full web gates**

Run:

```bash
npm --workspace web test
npm --workspace web run lint
npm --workspace web run build
```

Expected: all Vitest suites PASS, ESLint has no errors, and Next production build
exits 0.

- [ ] **Step 4: Inspect authorization and secret hygiene**

Run:

```bash
rg -n "AdminCapability|CapabilitiesGuard|AdminAccountStatus" apps docs/plan.md docs/superpowers/specs/2026-08-23-marco-13-specialized-admin-permissions-design.md
rg -n "activationCode|temporaryPassword|passwordHash|codeHash" apps/api/src/audit apps/web/src/app/admin apps/web/src/features
git diff --check
```

Expected: first search returns no matches; secret matches are limited to typed
in-memory handling and exclusion tests, never audit/log/URL/query cache; diff
check exits 0.

- [ ] **Step 5: Mark Marco 13 implemented only now**

After Steps 2–4 pass, add `Status: ✅ implementado.` below the Marco 13 heading.
Do not mark it earlier.

- [ ] **Step 6: Commit documentation/status**

```bash
git add docs/plan.md
git commit -m "docs: mark marco 13 implemented"
```

- [ ] **Step 7: Record final evidence**

Run:

```bash
git status --short
git log -10 --oneline
```

Expected: clean worktree and one focused commit per task.

# Marco 13 Specialized Administrative Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete Marco 13: backend-enforced specialized administrative permissions, general-admin operator provisioning and lifecycle management, one-time administrative activation, and audited manual participant-password reset with forced definitive change.

**Architecture:** Keep `UserRole.ADMIN` as the administrative identity boundary and add a nullable administrative profile/status to `User`. Resolve a static profile-to-capability matrix on every database-backed session request, enforce capabilities with Nest metadata/guard primitives, and keep Next.js navigation filtering as a usability layer only. Operator lifecycle and both reset flows use locked Prisma transactions that combine state changes, session revocation, activation invalidation, and audit persistence.

**Tech Stack:** NestJS 11, Prisma 7.8 with PostgreSQL, bcrypt 6, class-validator 0.15, Jest/Supertest, Next.js 16 App Router with `proxy.ts`, React 19, TanStack Query 5, React Hook Form 7, Zod 4, Vitest/Testing Library.

## Global Constraints

- Administrative profiles are exactly `GENERAL`, `SHOP`, and `ACTIVITIES`; custom permissions and mixed profiles are out of scope.
- Only `GENERAL` can create/manage operators, reset participant passwords, view PII-bearing administrative areas, adjust balances, reconcile, read audit/security/presence, and export PII.
- Activation codes expire after exactly 60 minutes, contain at least 100 bits of entropy, are stored only as SHA-256 hashes, are displayed once, are never emailed, and never appear in URLs, logs, metrics, audit JSON, or query caches.
- Administrative passwords preserve the existing policy: 12–64 Unicode code points and at most 72 UTF-8 bytes, hashed asynchronously with bcrypt cost 12.
- Participant passwords preserve the existing policy: 8–64 Unicode code points and at most 72 UTF-8 bytes; temporary reset credentials expire after exactly 24 hours.
- Every administrative mutation requires a trimmed 10–500 character reason and a request ID.
- The last active `GENERAL` administrator cannot be blocked, deactivated, reset, or changed to another profile, including under concurrent requests.
- Blocking, deactivation, profile change, and password/activation reset revoke affected sessions in the same transaction as the state mutation and audit insert.
- Backend capabilities are authoritative. Next `proxy.ts`, hidden links, and client redirects are never authorization boundaries.
- Shop/activity operational responses expose participant ID and display name only, never CPF or email.
- No operator is physically deleted in Marco 13.

---

### Task 1: Persist administrative profiles, lifecycle state, activation records, and participant reset state

**Files:**
- Modify: `apps/api/prisma/schema/users.prisma`
- Create: `apps/api/prisma/migrations/20260823120000_add_marco13_admin_permissions/migration.sql`
- Create: `apps/api/src/common/specs/marco13-schema-migration.spec.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/prisma/seed-config.spec.ts`

**Interfaces:**
- Produces: Prisma enums `AdminProfile`, `AdminAccountStatus`; model `AdminActivation`; `User.adminProfile`, `User.adminAccountStatus`, `User.passwordResetRequired`, and `User.passwordResetExpiresAt`.
- Consumes: existing `UserRole`, `User`, `UserSession`, and seed administrator identity.

- [ ] **Step 1: Write the failing schema/migration tests**

Create a test that reads the schema fragments and migration SQL and asserts all
of the following literal contracts:

```ts
expect(usersSchema).toContain('enum AdminProfile');
expect(usersSchema).toContain('GENERAL');
expect(usersSchema).toContain('SHOP');
expect(usersSchema).toContain('ACTIVITIES');
expect(usersSchema).toContain('enum AdminAccountStatus');
expect(usersSchema).toContain('PENDING_ACTIVATION');
expect(usersSchema).toContain('model AdminActivation');
expect(usersSchema).toContain('codeHash');
expect(usersSchema).toContain('passwordResetRequired');
expect(migration).toContain('User_admin_identity_check');
expect(migration).toContain('User_admin_password_state_check');
expect(migration).toContain('User_participant_reset_state_check');
expect(migration).toContain("'GENERAL'::\"AdminProfile\"");
```

Extend the seed config test to assert that the seed writes
`adminProfile: GENERAL` and chooses `PENDING_ACTIVATION` when the seed carries no
password.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm --workspace api test -- marco13-schema-migration seed-config
```

Expected: FAIL because the enums, fields, model, migration, and seed values do
not exist.

- [ ] **Step 3: Add the Prisma contracts**

Add these enums and fields to `users.prisma`:

```prisma
enum AdminProfile {
  GENERAL
  SHOP
  ACTIVITIES
}

enum AdminAccountStatus {
  PENDING_ACTIVATION
  ACTIVE
  BLOCKED
  DEACTIVATED
}

model User {
  // existing fields remain
  adminProfile             AdminProfile?
  adminAccountStatus       AdminAccountStatus?
  passwordResetRequired    Boolean             @default(false)
  passwordResetExpiresAt   DateTime?
  adminActivations         AdminActivation[]   @relation("AdminActivationSubject")
  adminActivationsCreated  AdminActivation[]   @relation("AdminActivationCreator")

  @@index([role, adminProfile, adminAccountStatus, createdAt])
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

- [ ] **Step 4: Write the data migration and database constraints**

The SQL must create both enums/table, add nullable fields first, backfill every
existing admin, then add these checks:

```sql
UPDATE "User"
SET "adminProfile" = 'GENERAL'::"AdminProfile",
    "adminAccountStatus" = CASE
      WHEN "passwordHash" IS NULL THEN 'PENDING_ACTIVATION'::"AdminAccountStatus"
      ELSE 'ACTIVE'::"AdminAccountStatus"
    END
WHERE "role" = 'ADMIN'::"UserRole";

ALTER TABLE "User" ADD CONSTRAINT "User_admin_identity_check" CHECK (
  ("role" = 'PARTICIPANT'::"UserRole" AND "adminProfile" IS NULL AND "adminAccountStatus" IS NULL)
  OR
  ("role" = 'ADMIN'::"UserRole" AND "adminProfile" IS NOT NULL AND "adminAccountStatus" IS NOT NULL)
);

ALTER TABLE "User" ADD CONSTRAINT "User_admin_password_state_check" CHECK (
  "role" = 'PARTICIPANT'::"UserRole"
  OR ("adminAccountStatus" IN ('ACTIVE', 'BLOCKED') AND "passwordHash" IS NOT NULL)
  OR ("adminAccountStatus" IN ('PENDING_ACTIVATION', 'DEACTIVATED') AND "passwordHash" IS NULL)
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

Create foreign keys with `ON DELETE RESTRICT`, the Prisma-declared indexes, and
the unique index for `codeHash`. Do not create a unique plaintext-code column.

- [ ] **Step 5: Update seed behavior**

Set the initial administrator create fields explicitly:

```ts
const adminUser = {
  ...admin,
  role: UserRole.ADMIN,
  adminProfile: AdminProfile.GENERAL,
  adminAccountStatus: AdminAccountStatus.PENDING_ACTIVATION,
} satisfies Prisma.UserCreateInput;
```

In `upsertUser`, use these administrative fields in `create`, but preserve an
existing administrator's `adminAccountStatus`, `passwordHash`, and
`passwordChangedAt` in `update`. The idempotent seed may refresh display
identity and keep the initial profile `GENERAL`; it must never downgrade an
already active bootstrap administrator to `PENDING_ACTIVATION`. Never add a seed
password.

- [ ] **Step 6: Validate Prisma and run GREEN tests**

Run:

```bash
npm --workspace api run prisma:generate
npm --workspace api run prisma:validate
npm --workspace api test -- marco13-schema-migration seed-config
```

Expected: Prisma commands exit 0 and focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/src/common/specs/marco13-schema-migration.spec.ts apps/api/src/prisma/seed-config.spec.ts
git commit -m "feat: persist marco 13 admin identities"
```

---

### Task 2: Add the static capability matrix and fail-closed Nest guard

**Files:**
- Create: `apps/api/src/auth/admin-capability.ts`
- Create: `apps/api/src/auth/admin-capability.spec.ts`
- Create: `apps/api/src/auth/require-capabilities.decorator.ts`
- Create: `apps/api/src/auth/capabilities.guard.ts`
- Create: `apps/api/src/auth/specs/capabilities.guard.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Produces: `AdminCapability`, `ADMIN_PROFILE_CAPABILITIES`, `capabilitiesForProfile(profile)`, `hasAdminCapabilities(profile, required)`, `@RequireCapabilities(...)`, `CapabilitiesGuard`.
- Consumes: Prisma `AdminProfile` and authenticated request identity.

- [ ] **Step 1: Write failing matrix and guard tests**

Assert exact grants for all three profiles, that `GENERAL` owns every declared
capability, and that no capability appears twice. Guard cases must cover missing
user, participant, null profile, missing one of multiple required capabilities,
and successful `SHOP`/`ACTIVITIES` requests.

```ts
expect(capabilitiesForProfile(AdminProfile.SHOP)).toEqual([
  'REWARD_READ',
  'REWARD_WRITE',
]);
expect(capabilitiesForProfile(AdminProfile.ACTIVITIES)).toEqual([
  'ACTION_READ',
  'ACTION_WRITE',
  'CLAIM_CODE_READ',
  'CLAIM_CODE_WRITE',
]);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- admin-capability capabilities.guard
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the capability source of truth**

Define this exact union:

```ts
export const ADMIN_CAPABILITIES = [
  'ADMIN_OVERVIEW_READ',
  'PARTICIPANT_READ',
  'PARTICIPANT_STATUS_WRITE',
  'PARTICIPANT_PASSWORD_RESET',
  'PARTICIPANT_BALANCE_WRITE',
  'MOVEMENT_READ',
  'RECONCILIATION_WRITE',
  'REWARD_READ',
  'REWARD_WRITE',
  'ACTION_READ',
  'ACTION_WRITE',
  'CLAIM_CODE_READ',
  'CLAIM_CODE_WRITE',
  'AUDIT_READ',
  'PRESENCE_READ',
  'SECURITY_METRICS_READ',
  'PII_EXPORT',
  'OPERATOR_MANAGE',
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export const ADMIN_PROFILE_CAPABILITIES = {
  GENERAL: ADMIN_CAPABILITIES,
  SHOP: ['REWARD_READ', 'REWARD_WRITE'],
  ACTIVITIES: [
    'ACTION_READ',
    'ACTION_WRITE',
    'CLAIM_CODE_READ',
    'CLAIM_CODE_WRITE',
  ],
} as const satisfies Record<AdminProfile, readonly AdminCapability[]>;
```

Return readonly copies and require every requested capability with `every`, not
`some`.

- [ ] **Step 4: Implement decorator and guard**

```ts
export const CAPABILITIES_KEY = 'admin:capabilities';
export const RequireCapabilities = (...capabilities: AdminCapability[]) =>
  SetMetadata(CAPABILITIES_KEY, capabilities);
```

The guard reads handler/class metadata with `getAllAndOverride`. When metadata
is absent or empty it returns true so participant controllers remain unaffected.
When metadata exists, require `request.user.role === 'ADMIN'`, a non-null
profile, and all capabilities. Failure throws:

```ts
new ForbiddenException({
  statusCode: 403,
  code: 'CAPABILITY_REQUIRED',
  message: 'Você não tem permissão para acessar este recurso.',
});
```

- [ ] **Step 5: Register guard dependencies and run GREEN tests**

Register the guard as an injectable provider in `AuthModule`; each feature
module that owns an administrative controller registers `CapabilitiesGuard`
just as it currently registers `RolesGuard`. The capability constants and
decorator are direct TypeScript imports and do not require a Nest provider.
Run the Step 2 command.

Expected: focused suites PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat: add administrative capability guard"
```

---

### Task 3: Make sessions, login, bootstrap, and `/users/me` profile-aware

**Files:**
- Modify: `apps/api/src/common/request-context.ts`
- Modify: `apps/api/src/presence/sessions.repository.ts`
- Modify: `apps/api/src/presence/sessions.service.ts`
- Modify: `apps/api/src/presence/specs/sessions.service.spec.ts`
- Modify: `apps/api/src/auth/admin-password.service.ts`
- Modify: `apps/api/src/auth/specs/admin-password.service.spec.ts`
- Modify: `apps/api/src/auth/jwt.strategy.ts`
- Modify: `apps/api/src/auth/specs/jwt-session.strategy.spec.ts`
- Modify: `apps/api/src/users/users.repository.ts`
- Modify: `apps/api/src/users/dto/user-response.dto.ts`
- Modify: `apps/api/src/users/specs/users.service.spec.ts`
- Modify: `apps/api/src/cli/set-admin-password.ts`
- Modify: `apps/api/src/cli/set-admin-password.spec.ts`
- Modify: `apps/api/test/support/admin-e2e-harness.ts`

**Interfaces:**
- Produces: authenticated identities with `adminProfile`, `adminAccountStatus`, `capabilities`, and `passwordChangeRequired`; admin session acceptance only for `ACTIVE` accounts; emergency bootstrap promotes the seeded general administrator to `ACTIVE`.
- Consumes: Task 1 schema and Task 2 capability mapper.

- [ ] **Step 1: Write failing authentication/session tests**

Add cases proving:

```ts
expect(await repository.startSession(pendingId, 'ADMIN', draft)).toBeNull();
expect(await repository.startSession(blockedId, 'ADMIN', draft)).toBeNull();
expect((await repository.startSession(activeShopId, 'ADMIN', draft))?.adminProfile)
  .toBe('SHOP');
expect(validated?.adminAccountStatus).toBe('ACTIVE');
expect(response.capabilities).toEqual(['REWARD_READ', 'REWARD_WRITE']);
```

Also prove that changing an active session's stored status to `BLOCKED` makes the
next JWT validation return unauthorized, and that the bootstrap command sets
`adminProfile = GENERAL`, `adminAccountStatus = ACTIVE`, and
`passwordChangedAt` without logging the password.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- sessions.service admin-password jwt-session users.service set-admin-password
```

Expected: FAIL on missing status/profile/capability contracts.

- [ ] **Step 3: Extend session identity and database filters**

Add to `SessionUserIdentity` and `AuthenticatedUserIdentity`:

```ts
adminProfile: AdminProfile | null;
adminAccountStatus: AdminAccountStatus | null;
passwordResetRequired: boolean;
passwordResetExpiresAt: Date | null;
```

Include these fields in `userSummarySelect`. For an admin session, require
`role: ADMIN` and `adminAccountStatus: ACTIVE`; for a participant session,
require `role: PARTICIPANT` and `isActive: true`. Apply the same predicate in
`findValidSessionWithUser` so database changes are effective on the next
request.

- [ ] **Step 4: Update password verification and bootstrap**

Replace the admin-password eligibility condition with:

```ts
if (
  user?.role === 'ADMIN' &&
  user.adminAccountStatus === 'ACTIVE' &&
  user.passwordHash !== null
) {
  canAuthenticate = true;
  passwordHash = user.passwordHash;
}
```

`UsersRepository.setAdminPassword` must lock the matching general admin, update
the hash, set `adminAccountStatus: ACTIVE`, and revoke existing sessions. Keep
interactive no-echo input unchanged.

- [ ] **Step 5: Extend user response without trusting JWT grants**

Return:

```ts
adminProfile: AdminProfile | null;
capabilities: AdminCapability[];
passwordChangeRequired: boolean;
```

Compute capabilities from the current `adminProfile` through Task 2's matrix;
participants receive `[]`. Map `passwordResetRequired` to the public name
`passwordChangeRequired` and never expose reset expiry on `/users/me`.

- [ ] **Step 6: Update e2e factories and run GREEN tests**

When `loginForE2e` prepares an admin, set `adminProfile: GENERAL` and
`adminAccountStatus: ACTIVE`. Run the Step 2 command.

Expected: focused suites PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common apps/api/src/presence apps/api/src/auth apps/api/src/users apps/api/src/cli apps/api/test/support/admin-e2e-harness.ts
git commit -m "feat: make admin sessions profile aware"
```

---

### Task 4: Extend audit contracts for operators and participant reset

**Files:**
- Modify: `apps/api/prisma/schema/audit.prisma`
- Modify: `apps/api/prisma/migrations/20260823120000_add_marco13_admin_permissions/migration.sql`
- Modify: `apps/api/src/audit/audit.service.ts`
- Modify: `apps/api/src/audit/audit-operation-matrix.spec.ts`
- Modify: `apps/api/src/audit/audit.service.spec.ts`
- Modify: `apps/api/src/audit/audit.repository.ts`
- Modify: `apps/api/src/audit/dto/audit-event-response.dto.ts`
- Modify: `apps/api/src/audit/dto/list-audit-events.dto.ts`

**Interfaces:**
- Produces: `ADMIN_OPERATOR` audit entity and six Marco 13 operations with strict safe-field contracts.
- Consumes: existing transactional `AuditRepository` writer and request IDs.

- [ ] **Step 1: Write failing audit matrix and secret-exclusion tests**

Parameterize the six operations and assert accepted entity/participant shapes.
For every operation pass a source containing `activationCode`, `temporaryPassword`,
`passwordHash`, `cpf`, and `email`, serialize the created event, and assert none
of those keys or values remain.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- audit-operation-matrix audit.service
```

Expected: FAIL because Prisma enums and service rules are absent.

- [ ] **Step 3: Add enum values to schema and migration**

Add:

```prisma
enum AuditEntityType {
  // existing values
  ADMIN_OPERATOR
}

enum AuditOperation {
  // existing values
  ADMIN_OPERATOR_CREATED
  ADMIN_OPERATOR_UPDATED
  ADMIN_OPERATOR_STATUS_CHANGED
  ADMIN_OPERATOR_ACTIVATION_RESET
  ADMIN_OPERATOR_ACTIVATED
  PARTICIPANT_PASSWORD_RESET
}
```

The migration uses `ALTER TYPE ... ADD VALUE` before any transaction can write
the values.

- [ ] **Step 4: Add exact audit rules and sanitizers**

Operator snapshots allow only:

```ts
const operatorRule = {
  required: {
    id: 'string',
    name: 'string',
    adminProfile: 'string',
    adminAccountStatus: 'string',
  },
  optional: {
    activationExpiresAt: 'date',
    passwordChangedAt: 'nullableDate',
  },
} satisfies ObjectRule;
```

Participant reset snapshots allow `id`, `passwordResetRequired`, and nullable
`passwordResetExpiresAt`. Add only `sessionsRevoked` as numeric metadata for
reset/status operations. Extend `entityTypeLabel` with “Operador”.

- [ ] **Step 5: Run Prisma generation and GREEN tests**

Run:

```bash
npm --workspace api run prisma:generate
npm --workspace api test -- audit-operation-matrix audit.service audit.repository
```

Expected: focused suites PASS and generated enums compile.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/src/audit
git commit -m "feat: audit marco 13 identity operations"
```

---

### Task 5: Add high-entropy one-time activation-code primitives

**Files:**
- Create: `apps/api/src/operators/admin-activation-code.ts`
- Create: `apps/api/src/operators/admin-activation-code.spec.ts`

**Interfaces:**
- Produces: `createAdminActivationCode()`, `normalizeAdminActivationCode(code)`, `hashAdminActivationCode(code)`, `ADMIN_ACTIVATION_TTL_MS`.
- Consumes: Node `crypto.randomBytes` and `createHash` only.

- [ ] **Step 1: Write failing deterministic primitive tests**

Inject random bytes into the generator and assert alphabet, four groups of five,
separator-insensitive normalization, case normalization, stable SHA-256 hex,
and 60-minute TTL:

```ts
expect(ADMIN_ACTIVATION_TTL_MS).toBe(60 * 60 * 1000);
expect(createAdminActivationCode(fixedBytes)).toMatch(
  /^[A-HJ-NP-Z2-9]{5}(?:-[A-HJ-NP-Z2-9]{5}){3}$/,
);
expect(normalizeAdminActivationCode('abcde-fghjk-mnpqr-stuvw'))
  .toBe('ABCDEFGHJKMNPQRSTUVW');
expect(hashAdminActivationCode(code)).toMatch(/^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm --workspace api test -- admin-activation-code`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement generation, normalization, and hashing**

Use alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Generate 20 symbols with
rejection sampling so modulo bias is not introduced. Format at indices
5/10/15. Normalization removes ASCII spaces and hyphens, then uppercases;
reject any other character or length before hashing. Hash only the normalized
20-character code:

```ts
export const hashAdminActivationCode = (code: string) =>
  createHash('sha256').update(normalizeAdminActivationCode(code), 'ascii').digest('hex');
```

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command.

Expected: suite PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/operators/admin-activation-code.ts apps/api/src/operators/admin-activation-code.spec.ts
git commit -m "feat: generate one-time admin activation codes"
```

---

### Task 6: Implement the transactional operator repository

**Files:**
- Create: `apps/api/src/operators/operators.module.ts`
- Create: `apps/api/src/operators/admin-operators.repository.ts`
- Create: `apps/api/src/operators/admin-operators.repository.spec.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Produces: paginated operator reads and locked methods for create, update, status change, activation reset, activation consumption, session revocation, pending-code revocation, ordered active-general locking, and transactional audit writer.
- Consumes: Task 1 models, Task 4 `AuditRepository`, Task 5 code hashes.

- [ ] **Step 1: Write failing repository contract tests**

Mock `PrismaService` and prove that `withTransaction` binds the audit writer,
`lockOperator` uses `SELECT ... FOR UPDATE`, active-general checks execute under
the same transaction, and all list/detail selects omit `passwordHash` and
`codeHash`.

Required public signatures:

```ts
findOperatorPage(filter: OperatorPageFilter): Promise<{ rows: OperatorRow[]; total: number }>;
findOperatorById(id: string): Promise<OperatorRow | null>;
withTransaction<T>(callback: (repository: AdminOperatorsRepository) => Promise<T>): Promise<T>;
lockOperator(id: string): Promise<LockedOperator | null>;
lockActivationByHash(codeHash: string): Promise<LockedActivation | null>;
lockActiveGeneralIds(): Promise<string[]>;
revokePendingActivations(adminUserId: string, now: Date): Promise<number>;
revokeOpenSessions(adminUserId: string, now: Date): Promise<number>;
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm --workspace api test -- admin-operators.repository`

Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement safe read contracts**

`OperatorRow` selects only ID, name, CPF, email, profile, status,
`lastLoginAt`, `passwordChangedAt`, creation/update timestamps, and the newest
pending activation expiry. Search matches name, CPF, and email only for the
general-admin endpoint. Default ordering is `createdAt desc, id desc`.

- [ ] **Step 4: Implement row locks and mutation primitives**

Use Prisma interactive transactions and parameterized raw SQL:

```ts
const rows = await this.client.$queryRaw<LockedOperator[]>(Prisma.sql`
  SELECT "id", "name", "cpf", "email", "adminProfile",
         "adminAccountStatus", "passwordHash", "passwordChangedAt"
  FROM "User"
  WHERE "id" = ${id} AND "role" = 'ADMIN'::"UserRole"
  FOR UPDATE
`);
```

`lockActivationByHash` uses `FOR UPDATE OF activation, subject` to lock both the
activation and subject user. `lockActiveGeneralIds` selects every
`GENERAL/ACTIVE` administrator ordered by ID and locks those rows in that stable
order. This prevents two concurrent requests from each removing a different
general administrator after observing the other. Mutation helpers must accept
explicit `now`; none calls `new Date()` internally. Catch Prisma `P2002` and
throw the existing `PersistenceUniqueConstraintError`.

- [ ] **Step 5: Implement activation/session atomic helpers**

Pending means `usedAt IS NULL AND revokedAt IS NULL`; expiry is checked by the
service under lock. Revocation updates all pending records regardless of expiry.
Session revocation sets `endedAt = now` and `endReason = REVOKED` only for open,
unexpired sessions. Activation consumption updates one locked row with `usedAt`
and updates the subject to `ACTIVE` with the supplied password hash and
`passwordChangedAt`.

- [ ] **Step 6: Register the shared operators module and run GREEN tests**

Create `OperatorsModule` with `AuditModule` imported,
`AdminOperatorsRepository` provided, and the repository exported. Import
`OperatorsModule` from both `AdminModule` and `AuthModule`; this keeps public
activation and authenticated management on one repository without making the
two feature modules depend on each other. Run the Step 2 command.

Expected: suite PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/operators apps/api/src/admin/admin.module.ts apps/api/src/auth/auth.module.ts
git commit -m "feat: add transactional operator repository"
```

---

### Task 7: Build general-admin operator lifecycle APIs

**Files:**
- Create: `apps/api/src/admin/admin-operators.service.ts`
- Create: `apps/api/src/admin/specs/admin-operators.service.spec.ts`
- Create: `apps/api/src/admin/admin-operators.controller.ts`
- Create: `apps/api/src/admin/specs/admin-operators.controller.spec.ts`
- Create: `apps/api/src/admin/dto/create-admin-operator.dto.ts`
- Create: `apps/api/src/admin/dto/update-admin-operator.dto.ts`
- Create: `apps/api/src/admin/dto/update-admin-operator-status.dto.ts`
- Create: `apps/api/src/admin/dto/reset-admin-operator-activation.dto.ts`
- Create: `apps/api/src/admin/dto/admin-operators-query.dto.ts`
- Create: `apps/api/src/admin/dto/admin-operator-response.dto.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

**Interfaces:**
- Produces: `GET/POST /admin/operators`, `GET/PATCH /admin/operators/:id`, `PATCH /admin/operators/:id/status`, and `POST /admin/operators/:id/activation-reset`.
- Consumes: `OPERATOR_MANAGE`, shared `OperatorsModule`, activation primitives, repository transactions, audit writer, and operation context.

- [ ] **Step 1: Write failing DTO, service, and controller tests**

Cover normalization, enum validation, reason length, uniqueness mapping, every
allowed/denied status transition, profile-change session revocation, activation
replacement, and one-time response shape. Assert all mutation routes use
`JwtAuthGuard`, `CsrfGuard`, `AllowedOriginGuard`, `CapabilitiesGuard`, and
`OPERATOR_MANAGE`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- admin-operators create-admin-operator update-admin-operator
```

Expected: FAIL because lifecycle API files do not exist.

- [ ] **Step 3: Implement DTO contracts**

Create uses:

```ts
export class CreateAdminOperatorDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Matches(/^\d{11}$/) cpf!: string;
  @IsEmail() email!: string;
  @IsEnum(AdminProfile) adminProfile!: AdminProfile;
  @IsString() @Length(10, 500) reason!: string;
}
```

Update makes name/CPF/email/profile optional but requires reason and at least one
actual change. Status accepts only `ACTIVE`, `BLOCKED`, or `DEACTIVATED` plus
reason. Reset accepts only reason. Query supports page, limit, search, profile,
and status using the existing pagination conventions.

- [ ] **Step 4: Implement create and activation issuance**

Generate code/hash before the transaction. Inside one transaction create the
`ADMIN/PENDING_ACTIVATION` user, create `AdminActivation` with
`expiresAt = now + ADMIN_ACTIVATION_TTL_MS`, and record
`ADMIN_OPERATOR_CREATED`. Return the plaintext code only from service stack
memory:

```ts
return {
  operator: mapOperator(created),
  activationCode: code,
  expiresAt: expiresAt.toISOString(),
};
```

Map uniqueness to generic `409` text that does not identify CPF versus email.

- [ ] **Step 5: Implement last-active-general and transitions**

Before any mutation that removes active-general access, call
`lockActiveGeneralIds()` while the target row is locked. Reject when the locked
set contains the target and has length one. Throw:

```ts
new ConflictException({
  statusCode: 409,
  code: 'LAST_ACTIVE_GENERAL_ADMIN',
  message: 'É necessário manter ao menos um administrador geral ativo.',
});
```

Enforce exact transitions from the specification. `ACTIVE -> BLOCKED` retains
hash; `BLOCKED -> ACTIVE` requires a retained hash; deactivation clears hash and
revokes codes; pending/deactivated cannot transition directly to active. Profile
change revokes sessions. Every changed state writes one audit event in the same
transaction; no-op update/status requests return `409 OPERATOR_STATUS_TRANSITION_INVALID`.

- [ ] **Step 6: Implement activation reset**

Generate a fresh code before the transaction. Under lock, apply the last-general
guard, revoke sessions/codes, clear password, set `PENDING_ACTIVATION`, create
the one-hour activation, and record `ADMIN_OPERATOR_ACTIVATION_RESET` with only
status/profile/expiry and `sessionsRevoked`. Return plaintext once.

- [ ] **Step 7: Expose capability-protected routes**

At controller class level use:

```ts
@Controller('admin/operators')
@UseGuards(
  JwtAuthGuard,
  CsrfGuard,
  AllowedOriginGuard,
  CapabilitiesGuard,
)
@RequireCapabilities('OPERATOR_MANAGE')
```

Pass `getAdminOperationContext(request)` to every mutation. Add Swagger response
types without example codes/passwords.

- [ ] **Step 8: Run GREEN tests and commit**

Run the Step 2 command; expect PASS.

```bash
git add apps/api/src/admin
git commit -m "feat: manage administrative operators"
```

---

### Task 8: Implement public one-time administrative activation

**Files:**
- Create: `apps/api/src/auth/dto/activate-admin.dto.ts`
- Create: `apps/api/src/auth/admin-activation.service.ts`
- Create: `apps/api/src/auth/specs/admin-activation.service.spec.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/specs/auth.controller.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/common/request-context.ts`

**Interfaces:**
- Produces: `POST /auth/admin/activate` returning `204` and consuming exactly one valid activation.
- Consumes: shared `OperatorsModule` repository/activation lock, admin password service, activation hash, audit service, origin guard, request ID.

- [ ] **Step 1: Write failing activation tests**

Cover valid activation, unknown/malformed/expired/used/revoked code, CPF mismatch,
email mismatch, wrong account status, invalid password, and concurrent
consumption. Every invalid identity/code state must produce the same:

```ts
{
  statusCode: 401,
  code: 'OPERATOR_ACTIVATION_INVALID',
  message: 'Código ou identidade de ativação inválidos.',
}
```

Assert the audit JSON lacks code, hash, CPF, email, and password.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- admin-activation auth.controller
```

Expected: FAIL because endpoint/service are absent.

- [ ] **Step 3: Add DTO and password-error mapping**

The DTO contains code, 11-digit CPF, email, and password. Normalize code through
Task 5 and email to lowercase. Map `AdminPasswordValidationError` to generic
`400` administrative password policy text; do not perform a database write.

- [ ] **Step 4: Implement race-safe activation**

Normalize/hash the submitted code and validate/hash every policy-valid password
before the write transaction, regardless of whether a candidate activation
exists. In the locked transaction
re-check hash, pending/unexpired/unused/unrevoked state, normalized CPF/email,
subject `PENDING_ACTIVATION`, and null current password. Then mark activation
used, set password/status/timestamp, revoke any other pending codes, and record
`ADMIN_OPERATOR_ACTIVATED` using the subject user as actor and the fixed audit
reason “Ativação administrativa concluída pelo operador.” Any failed re-check
returns the generic invalid response. Malformed code input follows the same
generic failure contract and never reaches a database mutation.

- [ ] **Step 5: Expose the endpoint**

```ts
@Post('admin/activate')
@HttpCode(HttpStatus.NO_CONTENT)
@UseGuards(AllowedOriginGuard)
@RateLimitPolicy('activation')
activateAdmin(
  @Body() dto: ActivateAdminDto,
  @Req() request: RequestWithRequestId,
) {
  return this.adminActivationService.activate(dto, request.requestId!);
}
```

No cookie or session is issued.

- [ ] **Step 6: Register activation dependencies**

Import `OperatorsModule` and `AuditModule` in `AuthModule`, provide
`AdminActivationService`, and keep `AdminModule` out of `AuthModule.imports`.
This is the dependency boundary that prevents an auth/admin module cycle.

- [ ] **Step 7: Run GREEN tests and commit**

Run the Step 2 command; expect PASS.

```bash
git add apps/api/src/auth apps/api/src/common/request-context.ts
git commit -m "feat: activate administrative operators once"
```

---

### Task 9: Add profile/domain-specific rate-limit policies

**Files:**
- Modify: `apps/api/src/security/rate-limit-policy.decorator.ts`
- Modify: `apps/api/src/security/app-throttler.guard.ts`
- Modify: `apps/api/src/security/app-throttler.guard.spec.ts`
- Modify: `apps/api/src/security/rate-limit-key.spec.ts`
- Modify: operator/reset/domain controllers as each policy is introduced.

**Interfaces:**
- Produces: named policies `activation`, `operatorMutation`, `participantPasswordReset`, `shopMutation`, and `activitiesMutation` with operator-ID/HMAC tracking.
- Consumes: existing `export` and `bulk` policy precedence and rate-limit key service.

- [ ] **Step 1: Write failing policy-selection tests**

Assert exact policy contracts:

```ts
activation: { name: 'admin-activation', limit: 5, ttl: 15 * 60_000 },
operatorMutation: { name: 'operator-mutation', limit: 10, ttl: 60_000 },
participantPasswordReset: { name: 'participant-password-reset', limit: 5, ttl: 60_000 },
shopMutation: { name: 'shop-mutation', limit: 30, ttl: 60_000 },
activitiesMutation: { name: 'activities-mutation', limit: 20, ttl: 60_000 },
```

Prove activation uses credential HMAC, authenticated mutations use user ID,
bulk/export remain more specific, and no tracker contains raw CPF/email.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --workspace api test -- app-throttler rate-limit-key`

Expected: FAIL on unknown policy names.

- [ ] **Step 3: Extend policy metadata and route selection**

Add the five names to `RATE_LIMIT_POLICY_NAMES` and exact entries to
`NAMED_RATE_LIMIT_POLICIES`. Add `/auth/admin/activate` to credential routes so
CPF+email use the HMAC tracker. Preserve “explicit named policy first” and
existing `bulk`/`export` annotations on their routes.

- [ ] **Step 4: Annotate mutations**

Use `operatorMutation` on operator create/update/status/reset,
`participantPasswordReset` on participant reset, `shopMutation` on reward
catalog/redemption mutations, and `activitiesMutation` on action/code mutations
that do not already have stricter `bulk`/`export` policies.

- [ ] **Step 5: Run tests and commit**

Run the Step 2 command; expect PASS.

```bash
git add apps/api/src/security apps/api/src/admin apps/api/src/actions apps/api/src/claim-codes apps/api/src/rewards apps/api/src/auth
git commit -m "feat: rate limit specialized admin operations"
```

---

### Task 10: Replace broad admin roles with route capabilities and minimize operational PII

**Files:**
- Modify: all administrative controllers under `apps/api/src/admin`
- Modify: `apps/api/src/actions/admin-actions.controller.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.controller.ts`
- Modify: `apps/api/src/rewards/admin-rewards.controller.ts`
- Modify: `apps/api/src/audit/audit.controller.ts`
- Modify: `apps/api/src/exports/admin-exports.controller.ts`
- Modify: `apps/api/src/security/security-http-metrics.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/actions/actions.module.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.module.ts`
- Modify: `apps/api/src/rewards/rewards.module.ts`
- Modify: `apps/api/src/audit/audit.module.ts`
- Modify: `apps/api/src/exports/exports.module.ts`
- Modify: `apps/api/src/security/security.module.ts`
- Modify: `apps/api/src/actions/dto/reusable-code-history-response.dto.ts`
- Modify: `apps/api/src/claim-codes/dto/code-redemption-response.dto.ts`
- Modify: `apps/api/src/claim-codes/dto/claim-code-history-response.dto.ts`
- Modify: reward/code/action repositories that select participant email/CPF.
- Create: `apps/api/src/auth/specs/admin-route-capabilities.spec.ts`
- Modify: affected controller/repository tests.

**Interfaces:**
- Produces: complete route-to-capability enforcement and PII-minimized shop/activity response contracts.
- Consumes: Task 2 guard/decorator and Task 9 named policies.

- [ ] **Step 1: Write the failing route architecture test**

Reflect over every request-mapped method in the listed administrative
controllers. Resolve class/method `CAPABILITIES_KEY` and assert a non-empty exact
capability set. Maintain this expected route map in the test:

```ts
const expected = {
  AdminController: ['ADMIN_OVERVIEW_READ', 'PARTICIPANT_READ', 'MOVEMENT_READ', 'PARTICIPANT_STATUS_WRITE'],
  AdminAdjustmentsController: ['PARTICIPANT_BALANCE_WRITE'],
  AdminReconciliationController: ['RECONCILIATION_WRITE'],
  AdminPresenceController: ['PRESENCE_READ'],
  AdminActionsController: ['ACTION_READ', 'ACTION_WRITE'],
  ClaimCodesController: ['CLAIM_CODE_READ', 'CLAIM_CODE_WRITE'],
  AdminRewardsController: ['REWARD_READ', 'REWARD_WRITE'],
  AuditController: ['AUDIT_READ'],
  AdminExportsController: ['PII_EXPORT'],
  SecurityHttpMetricsController: ['SECURITY_METRICS_READ'],
  AdminOperatorsController: ['OPERATOR_MANAGE'],
} as const;
```

Add response tests proving shop/activity DTOs omit `email` and `cpf`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- admin-route-capabilities admin-actions claim-codes admin-rewards admin.controller
```

Expected: FAIL because controllers still depend on `RolesGuard/ADMIN` and DTOs
contain PII.

- [ ] **Step 3: Migrate route declarations**

Keep `JwtAuthGuard` and `CsrfGuard`, replace `RolesGuard`/`@Roles(ADMIN)` with
`CapabilitiesGuard` and exact read/write decorators. Route methods that mix
read/write in one controller receive method-level capabilities. Exports remain
`PII_EXPORT`; code artifact downloads stay `CLAIM_CODE_READ` plus existing
`export` rate limit. Replace `RolesGuard` providers with `CapabilitiesGuard` in
every owning feature module; do not make those modules import `AuthModule` only
to obtain the guard.

- [ ] **Step 4: Minimize operational PII**

Change code/shop operational participant projections to:

```ts
participant: { id: string; name: string };
```

Remove email/CPF from Prisma selects, DTOs, Swagger classes, frontend-facing
serialized rows, and focused fixtures. Do not create profile-dependent response
branches. General administrators obtain full PII only through participant
management and PII exports.

- [ ] **Step 5: Run focused and architecture tests**

Run the Step 2 command.

Expected: all selected suites PASS and every mapped admin route has a declared
capability.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "feat: enforce specialized admin route permissions"
```

---

### Task 11: Prove the operator lifecycle and authorization matrix end to end

**Files:**
- Create: `apps/api/test/admin-operators.e2e-spec.ts`
- Create: `apps/api/test/admin-capability-matrix.e2e-spec.ts`
- Modify: `apps/api/test/support/admin-e2e-harness.ts`
- Modify: `apps/api/test/admin-authorization.e2e-spec.ts`

**Interfaces:**
- Produces: database-backed proof of activation/lifecycle concurrency and profile access/denial through direct API calls.
- Consumes: Tasks 1–10.

- [ ] **Step 1: Extend the harness for explicit profiles**

Add:

```ts
createAdminIdentity(input: {
  cpf: string;
  email: string;
  name: string;
  profile: AdminProfile;
  status?: AdminAccountStatus;
}): Promise<User>;
```

`login` must no longer silently convert blocked/pending accounts to active; add
a separate `activateFixtureAdmin` helper for setup.

- [ ] **Step 2: Write lifecycle e2e tests and verify RED**

Create one test per flow: create+activate all profiles; expired/reused/replaced
code; two concurrent activation submissions; block/unblock; deactivate; reset;
profile change; uniqueness conflict; last active general; two concurrent
last-general removals. Assert session revocation and audit secret exclusion.

Run:

```bash
npm --workspace api run test:e2e -- admin-operators.e2e-spec.ts
```

Expected: at least one integration assertion FAIL before wiring gaps are fixed.

- [ ] **Step 3: Write the direct-API capability matrix**

Use a table of representative routes for every capability. For each
`GENERAL/SHOP/ACTIVITIES` session call allowed reads/mutations and denied routes.
For denied mutations snapshot the affected tables first and assert they are
unchanged after `403 CAPABILITY_REQUIRED`. Explicitly check shop/activity
responses have no serialized email/CPF.

- [ ] **Step 4: Run matrix e2e and close integration gaps**

Run:

```bash
npm --workspace api run test:e2e -- admin-capability-matrix.e2e-spec.ts admin-authorization.e2e-spec.ts
```

Expected: all suites PASS. Fix only production integration mismatches; do not
weaken route expectations.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test apps/api/src
git commit -m "test: prove marco 13 operator permissions"
```

---

### Task 12: Add frontend capability contracts and specialized admin navigation

**Files:**
- Modify: `apps/web/src/features/users/users.types.ts`
- Create: `apps/web/src/features/auth/admin-capabilities.ts`
- Create: `apps/web/src/features/auth/admin-capabilities.spec.ts`
- Modify: `apps/web/src/app/admin/_components/admin-shell.tsx`
- Modify: `apps/web/src/app/admin/_components/admin-shell.spec.tsx`
- Modify: `apps/web/src/app/login/admin/admin-login-form.tsx`
- Modify: `apps/web/src/app/login/admin/admin-login-form.spec.tsx`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/proxy.spec.ts`
- Update: all typed `User` fixtures.

**Interfaces:**
- Produces: frontend `AdminProfile`, `AdminCapability`, `ADMIN_ROUTE_ACCESS`, `firstAdminRoute(user)`, filtered navigation, and profile-specific post-login landing.
- Consumes: backend `/users/me` capability response.

- [ ] **Step 1: Write failing route/navigation tests**

Assert:

```ts
expect(firstAdminRoute(general)).toBe('/admin');
expect(firstAdminRoute(shop)).toBe('/admin/lojinha');
expect(firstAdminRoute(activities)).toBe('/admin/atividades');
```

Render `AdminShell` for each profile and assert exact links. Directly rendering
an unavailable path must call `router.replace(firstAdminRoute(user))` before
children are shown. Login redirects to the same helper result. Proxy tests must
continue checking only presence of `access_token`, never profile/capability.

- [ ] **Step 2: Run focused web tests and verify RED**

Run:

```bash
npm --workspace web test -- src/features/auth/admin-capabilities.spec.ts src/app/admin/_components/admin-shell.spec.tsx src/app/login/admin/admin-login-form.spec.tsx src/proxy.spec.ts
```

Expected: FAIL because contracts/map do not exist.

- [ ] **Step 3: Add shared frontend contracts**

Mirror backend string unions and extend `User`:

```ts
export type AdminProfile = 'GENERAL' | 'SHOP' | 'ACTIVITIES';
export type User = {
  // existing fields
  adminProfile: AdminProfile | null;
  capabilities: AdminCapability[];
  passwordChangeRequired: boolean;
};
```

Define route requirements for every admin area and derive visible navigation
from `user.capabilities.includes(required)`. Add Operadores with
`OPERATOR_MANAGE`.

- [ ] **Step 4: Update shell/login routing**

Do not infer capabilities from profile in components; use the backend array.
Profile is display data and a fallback consistency check. Redirect an
authenticated admin with no permitted route to `/login/admin` after clearing
client CSRF state.

- [ ] **Step 5: Keep proxy optimistic only**

Add `/ativar-admin` and `/trocar-senha` matcher coverage in their respective
tasks, but do not decode JWT or add capability checks to `proxy.ts`.

- [ ] **Step 6: Run GREEN tests and commit**

Run the Step 2 command; expect PASS.

```bash
git add apps/web/src/features apps/web/src/app/admin apps/web/src/app/login/admin apps/web/src/proxy.ts apps/web/src/proxy.spec.ts
git commit -m "feat: specialize administrative navigation"
```

---

### Task 13: Build general-admin operator management UI with one-time code display

**Files:**
- Create: `apps/web/src/features/operators/operators.types.ts`
- Create: `apps/web/src/features/operators/operators.service.ts`
- Create: `apps/web/src/features/operators/operators.service.spec.ts`
- Create: `apps/web/src/features/operators/operator-query-keys.ts`
- Create: `apps/web/src/app/admin/operadores/page.tsx`
- Create: `apps/web/src/app/admin/operadores/operators-client.tsx`
- Create: `apps/web/src/app/admin/operadores/operators-client.spec.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-form-dialog.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-form-dialog.spec.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-status-dialog.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-activation-result-dialog.tsx`
- Create: `apps/web/src/app/admin/operadores/operator-activation-result-dialog.spec.tsx`

**Interfaces:**
- Produces: paginated operator management and local-memory-only activation result handling.
- Consumes: Task 7 APIs, shared dialogs/pagination/status badge/reason patterns, and TanStack Query.

- [ ] **Step 1: Write failing service and component tests**

Cover list filters; create/edit/status/reset payloads; 10–500 reason validation;
last-general error; status transition errors; double-submit prevention; cache
invalidation; copy button; focus trap/restore; and code removal from DOM/state
on close. Assert activation code is never passed to `toast`, URL/router, query
cache, or component props after result close.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace web test -- src/features/operators "src/app/admin/operadores"
```

Expected: FAIL because feature files do not exist.

- [ ] **Step 3: Add exact API contracts**

```ts
export type AdminOperator = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  adminProfile: 'GENERAL' | 'SHOP' | 'ACTIVITIES';
  adminAccountStatus: 'PENDING_ACTIVATION' | 'ACTIVE' | 'BLOCKED' | 'DEACTIVATED';
  activationExpiresAt: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperatorActivationResult = {
  operator: AdminOperator;
  activationCode: string;
  expiresAt: string;
};
```

Service functions map one-to-one to Task 7 routes and use `apiFetch`.

- [ ] **Step 4: Implement list and mutations**

Only render the route for users with `OPERATOR_MANAGE`. Use status/profile
filters and existing pagination controls. Every mutation collects reason in an
accessible dialog. Map stable API codes to actionable Portuguese copy without
revealing uniqueness fields.

- [ ] **Step 5: Keep plaintext result out of TanStack Query**

Create/reset calls execute imperatively and store the response only in the
client component:

```ts
const [activationResult, setActivationResult] =
  useState<OperatorActivationResult | null>(null);

function closeActivationResult() {
  setActivationResult(null);
}
```

Invalidate operator list/detail with a response that omits the code; never use
the activation result as mutation/query data. Closing the result dialog clears
it before restoring focus.

- [ ] **Step 6: Run GREEN tests and commit**

Run the Step 2 command; expect PASS.

```bash
git add apps/web/src/features/operators apps/web/src/app/admin/operadores
git commit -m "feat: add operator management interface"
```

---

### Task 14: Build the public administrative activation page

**Files:**
- Modify: `apps/web/src/features/auth/auth.types.ts`
- Modify: `apps/web/src/features/auth/auth.service.ts`
- Modify: `apps/web/src/features/auth/auth.validation.ts`
- Create: `apps/web/src/app/ativar-admin/page.tsx`
- Create: `apps/web/src/app/ativar-admin/admin-activation-form.tsx`
- Create: `apps/web/src/app/ativar-admin/admin-activation-form.spec.tsx`
- Modify: `apps/web/src/app/login/admin/admin-login-form.tsx`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/proxy.spec.ts`

**Interfaces:**
- Produces: public `/ativar-admin` form and `activateAdmin(payload)` transport.
- Consumes: Task 8 endpoint, existing `AuthShell`, admin password schema, and generic API errors.

- [ ] **Step 1: Write failing form/proxy tests**

Cover code normalization, CPF/email/password/confirmation validation, no
search-param code consumption, generic invalid-code error, double-submit,
success form clearing, success navigation to `/login/admin`, and no CSRF/session
installation. Proxy must allow `/ativar-admin` without cookie.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace web test -- src/app/ativar-admin src/proxy.spec.ts
```

Expected: FAIL because route and transport do not exist.

- [ ] **Step 3: Add validation and transport**

Use the same admin password byte/code-point rules as login and require exact
confirmation. `activateAdmin` posts with `skipCsrf: true`, expects `void`, and
does not call `setCsrfToken`.

- [ ] **Step 4: Implement accessible activation form**

Inputs are `code`, `cpf`, `email`, `password`, and `confirmation`; code uses
`autoComplete="one-time-code"`. On success call `reset()`, show
“Acesso ativado. Entre com sua senha.”, and replace `/login/admin`. Add an
activation link to admin login. Do not read `useSearchParams`.

- [ ] **Step 5: Run GREEN tests and commit**

Run the Step 2 command; expect PASS.

```bash
git add apps/web/src/features/auth apps/web/src/app/ativar-admin apps/web/src/app/login/admin apps/web/src/proxy.ts apps/web/src/proxy.spec.ts
git commit -m "feat: add one-time admin activation page"
```

---

### Task 15: Add participant reset primitives and transactional admin reset

**Files:**
- Create: `apps/api/src/auth/participant-temporary-password.ts`
- Create: `apps/api/src/auth/specs/participant-temporary-password.spec.ts`
- Modify: `apps/api/src/admin/admin-participants.repository.ts`
- Modify: `apps/api/src/admin/admin-participants.service.ts`
- Modify: `apps/api/src/admin/specs/admin-participants.service.spec.ts`
- Create: `apps/api/src/admin/dto/reset-participant-password.dto.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/admin/specs/admin.controller.spec.ts`
- Modify: `apps/api/src/admin/dto/admin-participant-response.dto.ts`
- Modify: `apps/api/src/admin/dto/admin-participant-detail-response.dto.ts`

**Interfaces:**
- Produces: 20-character temporary password generator, participant reset state in admin responses, and `POST /admin/participants/:id/password-reset`.
- Consumes: Task 1 reset fields, `PARTICIPANT_PASSWORD_RESET`, participant password service, transactional audit writer, and Task 9 reset rate limit.

- [ ] **Step 1: Write failing primitive/service/controller tests**

Assert generated passwords are exactly 20 characters, satisfy participant
policy, use at least 100 bits of entropy, and contain no ambiguous whitespace.
Service cases: participant missing, pending conflict, explicit replacement,
hash failure with no write, transaction rollback, session revocation, 24-hour
expiry, and audit secret exclusion. Controller must require the reset
capability/policy/guards.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- participant-temporary-password admin-participants admin.controller
```

Expected: FAIL on missing reset functionality.

- [ ] **Step 3: Implement generator and DTO**

Use rejection sampling with an unambiguous alphabet and export:

```ts
export const PARTICIPANT_TEMPORARY_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;
export function createParticipantTemporaryPassword(): string;
```

DTO:

```ts
export class ResetParticipantPasswordDto {
  @IsString() @Length(10, 500) reason!: string;
  @IsBoolean() replacePending!: boolean;
}
```

- [ ] **Step 4: Add locked repository mutation**

Read pending fields/password hash, hash the generated credential before the
transaction, then under `SELECT ... FOR UPDATE` re-check role/pending state.
Update hash, `passwordChangedAt`, required flag, and exact 24-hour expiry; revoke
open sessions; record `PARTICIPANT_PASSWORD_RESET` in the same transaction.
Return only reset state and session count from repository.

- [ ] **Step 5: Implement service/controller response**

Pending without replacement throws:

```ts
new ConflictException({
  statusCode: 409,
  code: 'PASSWORD_RESET_PENDING',
  message: 'Já existe uma troca de senha pendente para este participante.',
});
```

On success return `{ temporaryPassword, expiresAt }` from service memory. Add
reset state/expiry to general-admin participant list/detail, never the password.
Endpoint uses `PARTICIPANT_PASSWORD_RESET` and
`RateLimitPolicy('participantPasswordReset')`.

- [ ] **Step 6: Run GREEN tests and commit**

Run the Step 2 command; expect PASS.

```bash
git add apps/api/src/auth apps/api/src/admin
git commit -m "feat: reset participant passwords administratively"
```

---

### Task 16: Restrict temporary participant sessions and require definitive password change

**Files:**
- Create: `apps/api/src/auth/allow-password-change-required.decorator.ts`
- Modify: `apps/api/src/auth/jwt-auth.guard.ts`
- Modify: `apps/api/src/auth/specs/jwt-auth.guard.spec.ts`
- Create: `apps/api/src/auth/dto/change-required-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/specs/auth.service.spec.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/specs/auth.controller.spec.ts`
- Modify: `apps/api/src/presence/sessions.repository.ts`
- Modify: `apps/api/src/security/rate-limit-policy.decorator.ts`
- Modify: `apps/api/src/security/app-throttler.guard.ts`

**Interfaces:**
- Produces: global restricted-session behavior, reset-aware CSRF response, and `POST /auth/password/change-required`.
- Consumes: participant pending reset state loaded by Task 3 and reset hash/expiry from Task 15.

- [ ] **Step 1: Write failing guard/service/controller tests**

Prove temporary login succeeds with `passwordChangeRequired: true`; all guarded
routes return `403 PASSWORD_CHANGE_REQUIRED` except CSRF, logout, and definitive
change. Cover expired reset, replaced reset during bcrypt, same-as-temporary
password, invalid definitive password, successful change, session revocation,
and normal re-login. An expired temporary password must fail login with the
normal generic participant-login error, and an already-issued restricted
session must fail validation after its reset expiry.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace api test -- jwt-auth.guard auth.service auth.controller
```

Expected: FAIL because restricted-session policy/endpoint are absent.

- [ ] **Step 3: Add opt-in metadata and global restriction in `JwtAuthGuard`**

`@AllowPasswordChangeRequired()` sets metadata. After Passport authentication,
if `request.user.passwordResetRequired` is true and metadata is absent, throw:

```ts
new ForbiddenException({
  statusCode: 403,
  code: 'PASSWORD_CHANGE_REQUIRED',
  message: 'Defina uma nova senha para continuar.',
});
```

Apply the decorator only to `GET /auth/csrf`, `POST /auth/logout`, and
`POST /auth/password/change-required`. Heartbeat remains blocked.

Extend participant authentication selects with reset required/expiry. Reject a
temporary credential whose reset expiry is not in the future. Add the same
future-expiry predicate to database-backed session validation so an expired
restricted JWT becomes unusable on its next request.

- [ ] **Step 4: Add reset-aware CSRF and definitive DTO**

CSRF returns `{ csrfToken, passwordChangeRequired }`. DTO contains only
`newPassword` and relies on service byte/code-point validation.

- [ ] **Step 5: Implement race-safe definitive change**

Read pending hash/expiry, reject missing/expired state generically, compare the
new password with the temporary hash, hash the new password, then lock the
participant and re-check old expected hash/expiry/required state. On success set
new hash, clear reset fields, set `passwordChangedAt`, and revoke all sessions in
the same transaction. Replacement race returns `401 PASSWORD_RESET_INVALID`;
same credential returns `400 PASSWORD_MUST_CHANGE`. Clear the auth cookie after
`204`.

- [ ] **Step 6: Add named `passwordChange` rate limit and run GREEN tests**

Policy is 5 attempts per 15 minutes keyed by authenticated user ID. Run the
Step 2 command.

Expected: focused suites PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth apps/api/src/presence apps/api/src/security
git commit -m "feat: require definitive participant password"
```

---

### Task 17: Build participant reset admin UI and required-change page

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
- Create: `apps/web/src/app/admin/participantes/[id]/participant-password-reset-card.tsx`
- Create: `apps/web/src/app/admin/participantes/[id]/participant-password-reset-card.spec.tsx`
- Modify: `apps/web/src/app/admin/participantes/[id]/participant-detail-client.tsx`
- Create: `apps/web/src/app/trocar-senha/page.tsx`
- Create: `apps/web/src/app/trocar-senha/change-required-password-form.tsx`
- Create: `apps/web/src/app/trocar-senha/change-required-password-form.spec.tsx`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/proxy.spec.ts`

**Interfaces:**
- Produces: coded API errors, general-only participant reset card, one-time temporary-password display, `/trocar-senha`, and reset-aware redirects.
- Consumes: Tasks 15–16 endpoints/contracts and capability-aware user model.

- [ ] **Step 1: Write failing transport/navigation/component tests**

Cover `ApiError.code`, login redirect to `/trocar-senha`, direct protected-route
redirect after `PASSWORD_CHANGE_REQUIRED`, reset card visibility only with the
capability, reason/replacement flow, one-time password clearing/copy, pending
state, required-change password/confirmation validation, known coded errors,
success logout behavior, and proxy cookie routing.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --workspace web test -- src/lib/http/client.spec.ts src/hooks/use-auth.spec.tsx src/app/login/login-form.spec.tsx "src/app/admin/participantes/[id]/participant-password-reset-card.spec.tsx" src/app/trocar-senha src/proxy.spec.ts
```

Expected: FAIL on missing code/flows.

- [ ] **Step 3: Add coded errors and reset-aware transport**

Parse `{ message?: string | string[]; code?: string }` into `ApiError`. Add
`fetchSessionSecurity`, `resetParticipantPassword`, and
`changeRequiredPassword`; clear CSRF only after successful definitive change.
Add reset fields to participant DTOs.

- [ ] **Step 4: Implement reset card with local secret state**

Require `PARTICIPANT_PASSWORD_RESET`. Collect reason and explicit replacement.
Store `{ temporaryPassword, expiresAt }` only in local state, copy on demand,
and clear password/reason before closing. Invalidate only participant detail
data, whose response cannot contain plaintext.

- [ ] **Step 5: Implement required-change route**

On mount call `fetchSessionSecurity`: `401 -> /login`, false flag -> `/home`,
true -> render form. Submit only `newPassword`. Map `PASSWORD_MUST_CHANGE` and
`PASSWORD_RESET_INVALID` to specific Portuguese guidance. On `204`, clear local
CSRF, show success, and replace `/login`.

- [ ] **Step 6: Update login, hook, and proxy behavior**

Participant login with `passwordChangeRequired` routes to `/trocar-senha`.
`useMe` redirects only coded `PASSWORD_CHANGE_REQUIRED`, not every `403`.
Proxy treats `/trocar-senha` as participant-protected and leaves
`/ativar-admin` public.

- [ ] **Step 7: Run GREEN tests and commit**

Run the Step 2 command; expect PASS.

```bash
git add apps/web/src
git commit -m "feat: complete participant password reset flow"
```

---

### Task 18: Run complete e2e gates, update Marco 13 documentation, and retire the partial plan

**Files:**
- Create: `apps/api/test/participant-password-reset.e2e-spec.ts`
- Modify: `apps/api/test/admin-authorization.e2e-spec.ts`
- Modify: `docs/plan.md`
- Verify: `docs/superpowers/specs/2026-08-23-participant-admin-password-reset-design.md`
- Verify: `docs/superpowers/plans/2026-08-23-participant-admin-password-reset.md`
- Verify: all files changed in Tasks 1–17.

**Interfaces:**
- Produces: executable end-to-end proof, one canonical Marco 13 plan, roadmap traceability, and clean build/test evidence.
- Consumes: every prior task.

- [ ] **Step 1: Write the participant reset e2e suite**

Perform reset, old-session rejection, temporary login, blocked normal routes,
allowed CSRF/change/logout routes, definitive change, temporary-session
revocation, old/temporary password rejection, and definitive login. Add tests
for expiry, pending conflict, explicit replacement, concurrent replacement, and
participant/admin-profile authorization. Serialize audit rows and prove neither
plaintext/hash appears.

- [ ] **Step 2: Run all Marco 13 e2e suites**

Run:

```bash
npm --workspace api run test:e2e -- admin-operators.e2e-spec.ts admin-capability-matrix.e2e-spec.ts participant-password-reset.e2e-spec.ts admin-authorization.e2e-spec.ts
```

Expected: all suites PASS against the disposable PostgreSQL test database.

- [ ] **Step 3: Close the roadmap only after verification**

Verify that Marco 13 still lists the three profiles, general-admin operator
creation, one-hour activation, last-active-general protection, operator
lifecycle/reset, participant temporary reset/forced change, capability matrix,
data minimization, rate limits, audit, direct-API tests, and links to the complete
documents. Only after every verification command below passes, add
`Status: ✅ implementado.` immediately below the Marco 13 heading.

- [ ] **Step 4: Verify the superseded notices without deleting history**

Assert each old participant-reset document still carries a notice pointing to:

`2026-08-23-marco-13-specialized-admin-permissions-design.md` and
`2026-08-23-marco-13-specialized-admin-permissions.md`, stating that the reset
details remain incorporated in those complete documents.

- [ ] **Step 5: Run Prisma, API unit, lint, and build gates**

Run:

```bash
npm --workspace api run prisma:generate
npm --workspace api run prisma:validate
npm --workspace api test
npm --workspace api run lint:check
npm --workspace api run build
```

Expected: all commands exit 0; all Jest suites PASS.

- [ ] **Step 6: Run web test, lint, and production build gates**

Run:

```bash
npm --workspace web test
npm --workspace web run lint
npm --workspace web run build
```

Expected: all Vitest suites PASS, ESLint reports no errors, and Next production
build exits 0.

- [ ] **Step 7: Run authorization/secret/diff hygiene checks**

Run:

```bash
rg -n "@Roles\(UserRole\.ADMIN\)|RolesGuard" apps/api/src/admin apps/api/src/actions/admin-actions.controller.ts apps/api/src/claim-codes/claim-codes.controller.ts apps/api/src/rewards/admin-rewards.controller.ts apps/api/src/audit apps/api/src/exports apps/api/src/security/security-http-metrics.controller.ts
rg -n "activationCode|temporaryPassword|passwordHash|codeHash" apps/api/src/audit apps/web/src/app/admin apps/web/src/features
git diff --check
git status --short
```

Expected: no broad-role guard remains on administrative routes; secret matches
are limited to typed in-memory request/response handling and explicit exclusion
tests; no logs/audit/URL/query-cache persistence; diff check exits 0; status
contains only intended files.

- [ ] **Step 8: Commit documentation and final integration adjustments**

```bash
git add docs/plan.md apps/api/test/participant-password-reset.e2e-spec.ts apps/api/test/admin-authorization.e2e-spec.ts
git commit -m "docs: complete marco 13 implementation coverage"
```

- [ ] **Step 9: Record final evidence**

Run:

```bash
git status --short
git log -20 --oneline
```

Expected: clean status and focused commits for all 18 tasks.

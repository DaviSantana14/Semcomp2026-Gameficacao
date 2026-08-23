# Marco 13 — Specialized Administrative Permissions Design

## Purpose

Allow the event organization to delegate shop and activity/code operations
without granting access to participant management, balances, audit, security,
or other general-administration areas. A general administrator can provision
and manage every administrative profile. The same milestone also provides the
manual participant-password reset required by the no-email support model.

This specification supersedes the scope boundary of
`2026-08-23-participant-admin-password-reset-design.md`. That document remains
valid for the participant-reset details, but the present document is the source
of truth for the complete Marco 13.

## Confirmed product decisions

- The existing `UserRole.ADMIN` remains the broad identity class. Specialized
  authorization is represented by a separate administrative profile.
- There are exactly three profiles in Marco 13: `GENERAL`, `SHOP`, and
  `ACTIVITIES`. Custom permissions and mixed profiles are outside scope.
- A `GENERAL` administrator can create users in all three profiles, including
  other general administrators.
- New operators receive a one-time activation code that expires after one hour.
  The plaintext code is shown once to the creating general administrator and is
  never sent by email.
- The operator opens the public activation page over HTTPS, pastes the code,
  confirms CPF and email, and defines their own administrative password. The
  code is not placed in a URL and never works as a later login credential.
- Administrative password reset invalidates the previous password, revokes all
  sessions, invalidates any previous activation code, and issues a fresh
  one-hour activation code.
- A participant password reset produces a one-time-displayed temporary password
  valid for 24 hours. It revokes existing sessions and permits only the required
  definitive-password change before normal participant access resumes.
- The last active `GENERAL` administrator cannot be blocked, deactivated, or
  changed to another profile. A newly provisioned general administrator counts
  only after completing activation.
- Administrative authorization is enforced by backend capabilities. Frontend
  navigation filtering and redirects are usability measures only.

## Considered approaches

### 1. Expand `UserRole`

Replace `ADMIN` with role values such as `GENERAL_ADMIN`, `SHOP_OPERATOR`, and
`ACTIVITIES_OPERATOR`. This is simple conceptually, but the current API, session
layer, tests, seed, and frontend all use `ADMIN` as the participant/admin
boundary. Expanding it would create a broad compatibility migration and would
still leave route code tied to role names instead of business capabilities.

### 2. Keep `ADMIN` and add a profile-to-capability matrix — selected

Keep `UserRole.ADMIN`, add `AdminProfile`, and resolve capabilities from a
single static matrix. Existing login/session behavior keeps its broad role
contract, while controllers declare the capability they require. Permission
changes take effect on the next request because the current profile is loaded
from the database during session validation, not trusted from stale JWT claims.

### 3. Store arbitrary permissions in the database

Create permission tables and an editor for per-user grants. This offers maximum
flexibility but adds policy versioning, invalid combinations, a much larger UI,
and harder auditing. The event has three stable operational profiles, so this
is unnecessary for Marco 13.

## Authorization model

### Profiles

`AdminProfile` is nullable on `User`: participants have `null`; every
administrative user has one of `GENERAL`, `SHOP`, or `ACTIVITIES`.

`AdminAccountStatus` is also nullable on `User` and has four states:

- `PENDING_ACTIVATION`: no valid administrative password; a code may be pending.
- `ACTIVE`: may authenticate and hold sessions.
- `BLOCKED`: temporarily denied; password is retained so an explicit unblock can
  restore access.
- `DEACTIVATED`: denied indefinitely; password and pending activation are
  removed. Returning the user requires a new activation.

`isActive` remains the participant status flag. Administrative authentication
and session validation use `adminAccountStatus === ACTIVE` instead.

### Capabilities

Capabilities are application constants, not database rows:

- `ADMIN_OVERVIEW_READ`
- `PARTICIPANT_READ`
- `PARTICIPANT_STATUS_WRITE`
- `PARTICIPANT_PASSWORD_RESET`
- `PARTICIPANT_BALANCE_WRITE`
- `MOVEMENT_READ`
- `RECONCILIATION_WRITE`
- `REWARD_READ`
- `REWARD_WRITE`
- `ACTION_READ`
- `ACTION_WRITE`
- `CLAIM_CODE_READ`
- `CLAIM_CODE_WRITE`
- `AUDIT_READ`
- `PRESENCE_READ`
- `SECURITY_METRICS_READ`
- `PII_EXPORT`
- `OPERATOR_MANAGE`

The fixed matrix is:

| Area | `GENERAL` | `SHOP` | `ACTIVITIES` |
| --- | --- | --- | --- |
| Overview, presence, security | Full | None | None |
| Participants and status | Full | None | None |
| Participant password reset | Full | None | None |
| Points/XP adjustments and reconciliation | Full | None | None |
| Shop catalog and redemption transitions | Full | Full | None |
| Activities and reusable codes | Full | None | Full |
| Claim-code generation, status, artifacts, and history | Full | None | Full |
| Audit log | Full | None | None |
| PII-bearing exports | Full | None | None |
| Operator management | Full | None | None |

Shop and activity/code views return only the participant ID and display name
needed for in-person operation. They do not return CPF or email. General
administrators retain the existing participant-management views for full PII.

### Backend enforcement

`@RequireCapabilities(...)` stores capability metadata and
`CapabilitiesGuard` resolves the current `adminProfile` through the shared
matrix. Protected controllers keep `JwtAuthGuard` and `CsrfGuard`; capability
checks replace `@Roles(UserRole.ADMIN)` for administrative routes.

The guard fails closed when the user is absent, is not `ADMIN`, has no profile,
or lacks any required capability. A missing capability declaration on a route
inside an administrative controller is caught by an architecture test. This
prevents a new endpoint from silently inheriting broad admin access.

The JWT continues to carry only the session identity. Profile and account status
come from the database-backed session lookup on every request, so a profile
change, block, or deactivation is effective immediately even before cookie
expiry.

## Persistence design

### User additions

`User` receives:

- `adminProfile AdminProfile?`
- `adminAccountStatus AdminAccountStatus?`
- `passwordResetRequired Boolean @default(false)`
- `passwordResetExpiresAt DateTime?`

The migration backfills every existing `ADMIN` as `GENERAL` and sets status to
`ACTIVE` only when `passwordHash` exists; otherwise it uses
`PENDING_ACTIVATION`. Participants retain null administrative fields.

Database checks enforce:

- `ADMIN` rows have non-null profile and account status.
- `PARTICIPANT` rows have null profile and account status.
- `ACTIVE` or `BLOCKED` administrators have a password hash.
- `PENDING_ACTIVATION` or `DEACTIVATED` administrators have no password hash.
- participant reset fields are set only for participants and are either both
  present/required or both cleared.

### Activation records

`AdminActivation` stores one record per issued code:

- `id`
- `adminUserId`
- `codeHash` (unique SHA-256 digest)
- `expiresAt`
- `usedAt`
- `revokedAt`
- `createdByAdminId`
- `createdAt`

The plaintext code uses 20 characters from an unambiguous uppercase alphabet,
formatted as four groups of five for copying. Formatting separators are removed
before hashing. The generated entropy is at least 100 bits. Only the hash is
stored. Issuing a code revokes every still-pending code for that operator in the
same transaction.

Activation lookup, consumption, and user update are protected by a transaction
and row lock. A race between two submissions produces one success and one
generic failure. Expired, used, revoked, mismatched-identity, inactive, and
unknown codes return the same public error.

### Concurrency-sensitive administration

Operator profile/status mutations lock the target row. Operations that could
remove an active general administrator also lock active-general candidates and
count them inside the transaction. The mutation is rejected with
`409 LAST_ACTIVE_GENERAL_ADMIN` when the target is the only active general
administrator.

All session revocations, password clearing, activation replacement, status
changes, and audit inserts for an operator mutation occur in the same database
transaction. Password hashing happens before opening the transaction.

## Operator lifecycle

### Create

`POST /admin/operators` requires `OPERATOR_MANAGE`, name, CPF, email, profile,
and a 10–500 character reason. It creates an `ADMIN` in
`PENDING_ACTIVATION`, issues a one-hour code, audits the creation, and returns:

```json
{
  "operator": { "id": "...", "profile": "SHOP", "status": "PENDING_ACTIVATION" },
  "activationCode": "ABCDE-FGHJK-MNPQR-STUVW",
  "expiresAt": "2026-08-23T18:00:00.000Z"
}
```

The code appears only in this response and is never persisted in plaintext,
logged, placed in a metric label, query cache, toast, or URL.

### Activate

`POST /auth/admin/activate` is public but origin-checked and rate-limited. It
accepts `code`, `cpf`, `email`, and `password`. The service normalizes CPF/email,
validates the existing 12–64 character/72-byte administrative password policy,
hashes with the existing asynchronous bcrypt service, then consumes the code in
a transaction. Success sets status to `ACTIVE`, sets `passwordChangedAt`, marks
the activation used, audits activation without secrets, and returns `204`.
There is no automatic login.

### Manage identity/profile

`PATCH /admin/operators/:id` requires `OPERATOR_MANAGE` and a reason. It can
correct name, CPF, email, or profile. CPF/email uniqueness conflicts remain
generic. A profile change revokes all sessions. Changing the last active general
administrator to another profile is forbidden.

### Block, unblock, and deactivate

`PATCH /admin/operators/:id/status` accepts `BLOCKED`, `ACTIVE`, or
`DEACTIVATED` plus a reason.

- `ACTIVE -> BLOCKED` revokes all sessions and retains the password.
- `BLOCKED -> ACTIVE` restores access with the same password.
- Any non-deactivated state may become `DEACTIVATED`; this revokes sessions,
  clears the password, and revokes pending activation codes.
- Direct transition from `PENDING_ACTIVATION` or `DEACTIVATED` to `ACTIVE` is
  rejected; activation is required.
- The last-active-general guard applies before blocking or deactivation.

No administrative account is physically deleted in Marco 13.

### Reset administrative password

`POST /admin/operators/:id/activation-reset` requires `OPERATOR_MANAGE` and a
reason. It clears the password, sets `PENDING_ACTIVATION`, revokes all sessions
and previous codes, issues a new one-hour code, audits the reset, and returns the
new plaintext code once. It can also reactivate a deactivated operator through
the required activation flow. The last-active-general guard applies.

## Participant password reset

Only `GENERAL` has `PARTICIPANT_PASSWORD_RESET`.

`POST /admin/participants/:id/password-reset` accepts a 10–500 character reason
and `replacePending`. It generates a cryptographically random 20-character
temporary participant password, hashes it with the participant password
service, sets a 24-hour expiry and `passwordResetRequired`, revokes all sessions,
and audits the event without password/hash. A pending reset returns
`409 PASSWORD_RESET_PENDING` unless explicit replacement was requested.

A temporary login starts a restricted participant session. The backend permits
only `GET /auth/csrf`, `POST /auth/logout`, and
`POST /auth/password/change-required`; every other authenticated endpoint
returns `403 PASSWORD_CHANGE_REQUIRED`. The definitive password must satisfy the
participant policy and differ from the temporary password. Completion uses a
locked transaction, clears reset state, revokes all sessions again, and requires
a normal login with the definitive password. Expiry or replacement invalidates
the restricted session.

## API errors

Stable machine-readable codes are added alongside Portuguese messages:

- `CAPABILITY_REQUIRED` (`403`)
- `LAST_ACTIVE_GENERAL_ADMIN` (`409`)
- `OPERATOR_ACTIVATION_INVALID` (`401`)
- `OPERATOR_STATUS_TRANSITION_INVALID` (`409`)
- `PASSWORD_RESET_PENDING` (`409`)
- `PASSWORD_CHANGE_REQUIRED` (`403`)
- `PASSWORD_RESET_INVALID` (`401`)
- `PASSWORD_MUST_CHANGE` (`400`)

Authentication and activation errors do not disclose whether CPF, email, code,
password, account status, or expiry was the failing component.

## Audit design

The audit schema gains entity type `ADMIN_OPERATOR` and operations:

- `ADMIN_OPERATOR_CREATED`
- `ADMIN_OPERATOR_UPDATED`
- `ADMIN_OPERATOR_STATUS_CHANGED`
- `ADMIN_OPERATOR_ACTIVATION_RESET`
- `ADMIN_OPERATOR_ACTIVATED`
- `PARTICIPANT_PASSWORD_RESET`

Operator snapshots permit only ID, display name, profile, status, and timestamps.
Participant-reset snapshots permit only participant ID, required flag, and
expiry. Activation codes, temporary passwords, password hashes, CPF, and reset
credentials are forbidden from `before`, `after`, and `metadata` by the audit
sanitizer and tested with serialized-event assertions.

Every administrative mutation requires a reason and uses the existing request
ID. Self-activation is recorded with the activated administrative user as the
actor and the request ID from the public request middleware.

## Rate limiting

Named policies use the existing global throttler and hashed trackers:

- activation: 5 attempts per 15 minutes, keyed by the existing HMAC of route +
  CPF + email;
- general/operator-management mutation: 10 per minute;
- participant password reset: 5 per minute;
- shop mutation: 30 per minute;
- activity/code mutation: 20 per minute;
- existing bulk and export limits remain stricter when present.

Authenticated limits use the operator user ID, never CPF/email in plaintext.
The most specific route policy wins.

## Frontend design

### Session and navigation

The authenticated `User` contract includes `adminProfile` and `capabilities`.
`AdminShell` filters navigation through a central route/capability map:

- `GENERAL` lands on `/admin` and sees every existing area plus
  `/admin/operadores`.
- `SHOP` lands on `/admin/lojinha` and sees only Lojinha.
- `ACTIVITIES` lands on `/admin/atividades` and sees Atividades and Códigos.

Direct navigation to an unavailable page redirects to the first allowed area,
but the API still returns `403` independently. Next `proxy.ts` continues to
perform only cookie-presence routing; it is not an authorization boundary.

### Operator management

`/admin/operadores` contains paginated search/filter, profile/status badges,
creation, identity/profile editing, status transition, and activation reset.
All mutations use the shared reason dialog pattern. Create/reset results hold
the plaintext activation code only in local component state. Closing the result
dialog clears the code and it cannot be retrieved again.

### Activation

`/ativar-admin` is a public form with code, CPF, email, password, and password
confirmation. It never reads a code from search params. Success clears the form,
shows a generic confirmation, and routes to `/login/admin`.

### Participant reset

The participant detail page gains a general-admin-only reset card. The result
dialog follows the same local-state/one-time-display rule. `/trocar-senha` is a
protected participant page dedicated to the restricted temporary session.

## Testing strategy

### Unit and architecture tests

- Complete profile/capability matrix and fail-closed guard behavior.
- Every administrative route declares an expected capability.
- Session validation respects current profile/status and does not trust JWT
  permission claims.
- Activation code generation, normalization, hashing, expiry, one-time use, and
  concurrent consumption.
- Operator lifecycle transitions and last-active-general concurrency guard.
- Audit contracts reject secrets and unsupported fields.
- Named rate-limit selection and user-ID/HMAC tracker behavior.
- Participant temporary-password restriction and definitive change.
- Frontend navigation map, one-time dialogs, forms, and coded-error handling.

### End-to-end tests

A parameterized authorization matrix logs in one user per profile and calls each
route directly. It proves allowed access, `403` denial, and unchanged database
state after denied mutations. Separate flows cover:

- general administrator creates and activates each profile;
- expired, reused, replaced, malformed, and concurrently submitted activation;
- block/unblock/deactivate/reset and immediate session revocation;
- protection of the last active general administrator under concurrent requests;
- data minimization in shop/activity responses;
- audit completeness and absence of codes/passwords/hashes;
- participant reset, restricted session, expiry/replacement, and definitive
  password change.

## Migration and rollout

The database migration is backward-compatible with the existing general admin:
it backfills profile/status before adding constraints. The seed always creates
the initial user as `GENERAL`; the Session Manager bootstrap remains the
recovery mechanism when no active general administrator exists.

Deploy order is migration, Prisma client generation, API, then frontend. During
the brief mixed-version window, the old API still sees `role = ADMIN`; the new
API handles backfilled profile/status. No existing password is exposed or
rehashed during migration.

## Out of scope

- Email, SMS, or WhatsApp delivery and recovery.
- Arbitrary permission editing or users with multiple profiles.
- Physical deletion of operators or audit history.
- Two-person approval for sensitive mutations.
- Automatic promotion when the last general administrator is unavailable; the
  documented Session Manager bootstrap remains the emergency path.

## Acceptance criteria

- A general administrator can create another general administrator, shop
  operator, or activity/code operator and receives a one-time one-hour
  activation code.
- An operator can activate exactly once over HTTPS and subsequently logs in only
  with CPF, email, and the password they chose.
- Shop users can operate rewards and redemption transitions but cannot access
  participant management, points, activities, codes, audit, security, exports,
  or operator management.
- Activity/code users can operate actions and codes but cannot access shop,
  participant management, points, audit, security, exports, or operator
  management.
- General administrators retain full access, including participant reset and
  operator lifecycle management.
- Direct API calls enforce the same matrix regardless of hidden frontend links.
- Block, deactivation, profile change, and resets revoke affected sessions as
  specified; activation/password secrets never appear in storage, logs, audit,
  URLs, metrics, or query caches.
- The last active general administrator cannot lose general active access through
  normal API operations, including concurrent requests.
- Participant reset invalidates previous credentials/sessions, allows only the
  required change with the temporary password, and then requires login with the
  definitive password.
- Prisma validation/generation, API and web tests, e2e suites, lint, and
  production builds all pass.

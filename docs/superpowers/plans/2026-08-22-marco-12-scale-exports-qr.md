# Marco 12 Scale, Exports, and QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar exportações filtradas, lotes e operações de Claim Codes rastreáveis, artefatos QR em PDF/PNG, leitura por câmera com confirmação e métricas agregadas de abuso sem degradar os fluxos do evento.

**Architecture:** Novos modelos Prisma tornam lotes e operações em massa consultáveis e append-only. Arquivos CSV/QR são derivados sob demanda por serviços limitados em concorrência, enquanto listas e exports compartilham os mesmos filtros Prisma. O leitor QR fica isolado no cliente e envia o texto reconhecido ao endpoint de resgate existente; métricas HTTP usam contadores em memória com flush aditivo por minuto.

**Tech Stack:** NestJS 11, Prisma 7.8/PostgreSQL 16, Next.js 16, React 19, TanStack Query 5, Vitest/Jest, `qrcode`, `sharp`, `pdfkit`, `archiver`, `@zxing/browser`.

## Global Constraints

- Timezone operacional: `America/Sao_Paulo`; timestamps persistidos permanecem em UTC.
- `points` continua moeda gastável; `xp` continua progresso competitivo; QR e exportações não alteram essa regra.
- QR contém somente o código canônico; o backend decide entre `REUSABLE_CODE` e `CLAIM_CODE`.
- A câmera nunca resgata automaticamente e a digitação manual permanece disponível.
- Lote, bulk, PDF e ZIP aceitam no máximo 500 Claim Codes.
- CSV aceita no máximo 50.000 registros e 25 MiB codificados, em blocos de 1.000.
- No máximo duas gerações CSV e uma geração PDF/ZIP simultâneas por processo.
- Exportações usam cinco requisições/minuto/admin; bulk usa duas/minuto/admin.
- Métricas persistem somente minuto UTC e contagens de `401`, `403`, `429`, com retenção de 30 dias.
- Nenhum log, métrica ou auditoria recebe código bruto, CPF/email de filtro, cookie, JWT, CSRF ou frame da câmera.
- Claim Codes legados continuam válidos com `batchId = null`; não se inventa agrupamento histórico.
- Toda mutation administrativa continua atômica com seu `AdminAuditEvent`.
- Fluxos e limites atuais de login, heartbeat, resgate, ranking, presença e lojinha não podem regredir.

## File Structure

### Backend

- `apps/api/prisma/schema/actions.prisma`: lotes, bulk e relações de Claim Codes.
- `apps/api/prisma/schema/users.prisma`: relações inversas dos administradores.
- `apps/api/prisma/schema/audit.prisma`: operações/entidades de auditoria do bulk.
- `apps/api/prisma/schema/security.prisma`: buckets agregados de status HTTP.
- `apps/api/src/claim-codes/`: geração/lista de lotes, bulk, relatórios e artefatos QR.
- `apps/api/src/exports/`: limites, CSVs individuais, consultas globais e endpoints de download.
- `apps/api/src/security/`: política nomeada de rate limit e métricas HTTP agregadas.
- `apps/api/src/admin/`: listas/export de participantes, movimentos globais e dashboard.
- `apps/api/src/rewards/`: filtro compartilhado e export de pedidos.

### Frontend

- `apps/web/src/features/actions/`: contratos de lotes, bulk, resgates e adaptador ZXing.
- `apps/web/src/features/exports/`: contagens e downloads com filtros aplicados.
- `apps/web/src/features/security/`: overview de `401`/`403`/`429`.
- `apps/web/src/app/admin/codigos/`: lotes, QR, bulk e histórico global de resgates.
- `apps/web/src/app/admin/movimentacoes/`: livro-caixa global paginado/exportável.
- `apps/web/src/app/admin/_components/`: diálogo compartilhado de export e painel de segurança.
- `apps/web/src/app/home/`: câmera, confirmação e resgate manual.

---

### Task 1: Add the Marco 12 Data and Audit Foundation

**Files:**
- Modify: `apps/api/prisma/schema/actions.prisma`
- Modify: `apps/api/prisma/schema/users.prisma`
- Modify: `apps/api/prisma/schema/audit.prisma`
- Create: `apps/api/prisma/schema/security.prisma`
- Create: `apps/api/prisma/migrations/20260822120000_add_marco12_scale_exports_qr/migration.sql`
- Create: `apps/api/src/common/specs/marco12-schema-migration.spec.ts`
- Modify: `apps/api/src/audit/audit.service.ts`
- Modify: `apps/api/src/audit/audit.repository.ts`
- Modify: `apps/api/src/audit/audit-operation-matrix.spec.ts`
- Modify: `apps/api/src/audit/audit.service.spec.ts`

**Interfaces:**
- Produces Prisma models `ClaimCodeBatch`, `ClaimCodeBulkOperation`, `ClaimCodeBulkOperationItem`, `SecurityHttpMetricMinute`.
- Produces enum members `CLAIM_CODE_BULK_STATUS_CHANGED` and `CLAIM_CODE_BULK_OPERATION`.
- Existing Claim Codes remain readable with nullable `batchId`; all new generation code will supply it in Task 2.

- [ ] **Step 1: Write failing schema and audit contract tests**

```ts
expect(sql).toContain('CREATE TABLE "ClaimCodeBatch"');
expect(sql).toContain('CREATE TABLE "ClaimCodeBulkOperation"');
expect(sql).toContain('CREATE TABLE "ClaimCodeBulkOperationItem"');
expect(sql).toContain('CREATE TABLE "SecurityHttpMetricMinute"');
expect(sql).toContain('ClaimCodeBulkOperation_append_only');
expect(sql).not.toMatch(/UPDATE "ClaimCode" SET "batchId"/);
```

Add an operation-matrix case whose snapshots contain only counts and the target state:

```ts
{
  actor,
  operation: AuditOperation.CLAIM_CODE_BULK_STATUS_CHANGED,
  entityType: AuditEntityType.CLAIM_CODE_BULK_OPERATION,
  entityId: 'bulk-1',
  reason: 'Desativacao preventiva do lote selecionado',
  after: {
    targetIsActive: false,
    selectedCount: 4,
    changedCount: 2,
    unchangedCount: 1,
    usedCount: 1,
    notFoundCount: 0,
  },
}
```

- [ ] **Step 2: Run the new tests and observe the missing schema**

Run: `npm --workspace api test -- --runTestsByPath src/common/specs/marco12-schema-migration.spec.ts src/audit/audit-operation-matrix.spec.ts`

Expected: FAIL because the migration, enums and audit rule do not exist.

- [ ] **Step 3: Add the exact Prisma models and inverse relations**

Use the approved model contracts from the design. In addition to the model bodies, add:

```prisma
// Action
claimCodeBatches ClaimCodeBatch[]

// ClaimCode
batchId             String?
batch               ClaimCodeBatch?                 @relation(fields: [batchId], references: [id], onDelete: Restrict)
bulkOperationItems  ClaimCodeBulkOperationItem[]
@@index([batchId, createdAt])

// User
claimCodeBatchesCreated ClaimCodeBatch[]         @relation("ClaimCodeBatchCreatedBy")
claimCodeBulkOperations ClaimCodeBulkOperation[] @relation("ClaimCodeBulkOperationActor")
```

Keep `ClaimCode.batchId` nullable without a backfill. Define all foreign keys with `ON DELETE RESTRICT` in SQL.

- [ ] **Step 4: Write the transactional migration and append-only protection**

Wrap the migration in `BEGIN;`/`COMMIT;`, create the enum/tables/indexes/FKs, add the two audit enum values, and attach `reject_immutable_ledger_change()` triggers to `ClaimCodeBulkOperation` and `ClaimCodeBulkOperationItem`. Add count checks:

```sql
ALTER TABLE "ClaimCodeBulkOperation"
  ADD CONSTRAINT "ClaimCodeBulkOperation_counts_check" CHECK (
    "selectedCount" BETWEEN 1 AND 500
    AND "changedCount" >= 0
    AND "unchangedCount" >= 0
    AND "usedCount" >= 0
    AND "notFoundCount" >= 0
    AND "changedCount" + "unchangedCount" + "usedCount" + "notFoundCount" = "selectedCount"
  );
```

- [ ] **Step 5: Extend the typed audit allowlist**

Add `ClaimCodeBulkAuditSnapshot`, its `CreatedEvent` union member, operation rule, sanitizer case and entity display label. The snapshot must accept exactly:

```ts
type ClaimCodeBulkAuditSnapshot = {
  targetIsActive: boolean;
  selectedCount: number;
  changedCount: number;
  unchangedCount: number;
  usedCount: number;
  notFoundCount: number;
};
```

Do not add selected IDs or raw/masked codes to `AdminAuditEvent`; detailed items live in the bulk tables.

- [ ] **Step 6: Validate schema, generation, migration contracts and audit tests**

```bash
npm --workspace api run prisma:validate
npm --workspace api run prisma:generate
npm --workspace api test -- --runTestsByPath src/common/specs/marco12-schema-migration.spec.ts src/audit/audit-operation-matrix.spec.ts src/audit/audit.service.spec.ts src/audit/audit.repository.spec.ts
```

Expected: PASS; generated Prisma types expose all four models and the new audit enum members.

- [ ] **Step 7: Apply the migration to the disposable E2E database**

Run: `npm --workspace api exec prisma migrate deploy`

Expected: migration applies once; a second run reports no pending migrations.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma apps/api/src/common/specs/marco12-schema-migration.spec.ts apps/api/src/audit
git commit -m "feat: add marco 12 persistence foundation"
```

---

### Task 2: Persist, List, and Redownload Claim Code Batches

**Files:**
- Modify: `apps/api/src/claim-codes/claim-codes.repository.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.service.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.controller.ts`
- Modify: `apps/api/src/claim-codes/dto/generated-claim-codes-response.dto.ts`
- Create: `apps/api/src/claim-codes/dto/claim-code-batches-query.dto.ts`
- Create: `apps/api/src/claim-codes/dto/claim-code-batch-response.dto.ts`
- Create: `apps/api/src/claim-codes/claim-code-batch-text.ts`
- Create: `apps/api/src/claim-codes/specs/claim-code-batch-text.spec.ts`
- Modify: `apps/api/src/claim-codes/specs/claim-codes.repository.spec.ts`
- Modify: `apps/api/src/claim-codes/specs/claim-codes.service.spec.ts`
- Modify: `apps/api/src/claim-codes/specs/claim-codes.controller.spec.ts`
- Create: `apps/api/test/admin-claim-code-batches.e2e-spec.ts`

**Interfaces:**
- `generateBatch()` returns `{ batch, action, quantity, codes }`.
- Produces `findBatches(query)`, `findBatch(id)`, `getBatchCodes(id)` and `serializeClaimCodeBatchText(codes)`.
- Exposes protected list/detail/TXT endpoints defined in the approved spec.

- [ ] **Step 1: Write failing atomic generation and redownload tests**

```ts
expect(repository.createBatch).toHaveBeenCalledWith({
  id: expect.any(String),
  actionId: 'action-1',
  createdByAdminId: 'admin-1',
  requestedQuantity: 2,
  createdQuantity: 2,
  reason: 'Geracao administrativa do lote',
  requestId: 'request-1',
});
expect(repository.insertClaimCodes).toHaveBeenCalledWith(
  'action-1',
  expect.any(String),
  expect.any(Array),
);
expect(result.batch.id).toBe(auditInput.entityId);
```

Test list filters, status counters, `404` for missing/legacy batch and TXT with sorted codes plus trailing LF.

- [ ] **Step 2: Run focused tests and observe missing batch methods**

Run: `npm --workspace api test -- --runTestsByPath src/claim-codes/specs/claim-code-batch-text.spec.ts src/claim-codes/specs/claim-codes.service.spec.ts src/claim-codes/specs/claim-codes.repository.spec.ts`

Expected: FAIL on missing DTOs, repository methods and serializer.

- [ ] **Step 3: Persist batch and codes in the existing transaction**

Generate `batchId` once, insert candidate codes with that ID, create the batch after the final count is known, then audit with the same ID. Keep failure of any step inside `withTransaction`. The returned public batch is:

```ts
type ClaimCodeBatchSummary = {
  id: string;
  action: { id: string; name: string };
  createdBy: { id: string; name: string; email: string };
  requestedQuantity: number;
  createdQuantity: number;
  reason: string;
  requestId: string;
  createdAt: string;
  counts: { available: number; disabled: number; used: number; blocked: number };
};
```

Do not include raw codes in list/detail; only the TXT/QR endpoints may load them.

- [ ] **Step 4: Implement batch filters and deterministic TXT**

`ClaimCodeBatchesQueryDto` extends pagination and accepts `actionId`, `actorAdminId`, `from`, `to`. Repository ordering is `createdAt desc, id desc`. The TXT serializer is pure:

```ts
export function serializeClaimCodeBatchText(codes: string[]) {
  return `${[...codes].sort().join('\n')}\n`;
}
```

- [ ] **Step 5: Add controller contracts**

Expose:

```text
GET /admin/claim-code-batches
GET /admin/claim-code-batches/:id
GET /admin/claim-code-batches/:id/download.txt
```

TXT uses `text/plain; charset=utf-8`, `Cache-Control: no-store` and filename `codigos-<batchId>.txt`.

- [ ] **Step 6: Prove persistence and rollback in PostgreSQL**

E2E assertions must generate two codes, compare response/TXT/database values, list the batch, restart the Nest app and download the same values again. Install the existing audit-failure trigger and assert no `ClaimCodeBatch` or codes remain after a failed request.

- [ ] **Step 7: Run focused and E2E checks**

```bash
npm --workspace api test -- --runTestsByPath src/claim-codes/specs/claim-code-batch-text.spec.ts src/claim-codes/specs/claim-codes.repository.spec.ts src/claim-codes/specs/claim-codes.service.spec.ts src/claim-codes/specs/claim-codes.controller.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-claim-code-batches.e2e-spec.ts test/admin-actions-codes.e2e-spec.ts
```

Expected: PASS; legacy Claim Codes remain usable but never appear as reconstructed batches.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/claim-codes apps/api/test/admin-claim-code-batches.e2e-spec.ts
git commit -m "feat: persist claim code batches"
```

---

### Task 3: Generate Bounded PDF and PNG/ZIP QR Artifacts

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Create: `apps/api/src/common/download-gate.ts`
- Create: `apps/api/src/common/specs/download-gate.spec.ts`
- Create: `apps/api/src/claim-codes/claim-code-qr.ts`
- Create: `apps/api/src/claim-codes/claim-code-artifacts.service.ts`
- Create: `apps/api/src/claim-codes/specs/claim-code-qr.spec.ts`
- Create: `apps/api/src/claim-codes/specs/claim-code-artifacts.service.spec.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.repository.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.controller.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.module.ts`
- Modify: `apps/api/src/actions/actions.repository.ts`
- Modify: `apps/api/src/actions/actions.service.ts`
- Modify: `apps/api/src/actions/admin-actions.controller.ts`
- Create: `apps/api/test/admin-claim-code-artifacts.e2e-spec.ts`

**Interfaces:**
- `DownloadGate.run('qr', work)` permits one active QR artifact per process and throws `DownloadCapacityError(30)` otherwise.
- `renderQrCardPng(card): Promise<Buffer>` returns a 1200 × 1500 PNG.
- `writeQrPdf(output, cards, metadata)` writes A4, eight cards/page.
- `writeQrZip(output, cards)` writes ordered PNG entries plus `manifesto.csv`.

- [ ] **Step 1: Install production and test dependencies**

```bash
npm install --workspace api qrcode sharp pdfkit archiver
npm install --workspace api --save-dev @types/qrcode @types/pdfkit @types/archiver @zxing/library pdf-lib yauzl-promise
```

Expected: API package and lockfile contain the new direct dependencies; no dependency is added to the root package.

- [ ] **Step 2: Write failing renderer, decoder, PDF, ZIP and gate tests**

```ts
const png = await renderQrCardPng(card);
expect(await decodeQrPng(png)).toBe('ABCD-EFGH');
expect(await sharp(png).metadata()).toMatchObject({
  format: 'png', width: 1200, height: 1500,
});
```

Use `pdf-lib` to assert one page for 1/8 cards and two pages for 9 cards. Use `yauzl-promise` to assert 500 ordered PNG entries plus one `manifesto.csv`. Hold one gate promise open and assert a second call rejects with retry 30.

- [ ] **Step 3: Run focused tests and observe missing implementations**

Run: `npm --workspace api test -- --runTestsByPath src/common/specs/download-gate.spec.ts src/claim-codes/specs/claim-code-qr.spec.ts src/claim-codes/specs/claim-code-artifacts.service.spec.ts`

Expected: FAIL because renderers and gate do not exist.

- [ ] **Step 4: Implement the deterministic card renderer**

Use `QRCode.toBuffer(card.code, { errorCorrectionLevel: 'H', margin: 4, width: 900 })`, then `sharp` to composite the QR and an escaped SVG text block. The interface is exact:

```ts
export type QrCard = {
  sequence: number;
  code: string;
  actionName: string;
  kind: 'Uso único' | 'Reutilizável';
  batchId: string | null;
};
```

Sanitize XML text and filesystem names in separate pure helpers. Reject more than 500 cards before rendering any buffer.

- [ ] **Step 5: Implement PDF and ZIP with cleanup/backpressure**

Pipe PDFKit/Archiver to the provided output, listen for `error`, abort when the HTTP response closes, process one card at a time and finalize exactly once. PDF layout is A4 portrait, 12 mm margin, 2 × 4 cards. ZIP filenames are `001-<safe-code>.png`; manifest uses the shared CSV escaping rules introduced locally and later moved in Task 8.

- [ ] **Step 6: Expose batch and reusable artifact endpoints**

```text
GET /admin/claim-code-batches/:id/qr.pdf
GET /admin/claim-code-batches/:id/qr-images.zip
GET /admin/reusable-codes/:actionId/qr.png
GET /admin/reusable-codes/:actionId/qr.pdf
```

Set `Cache-Control: no-store`, exact MIME type and `Content-Disposition`. On gate rejection set `Retry-After: 30` before throwing `429`. Reusable endpoints reject missing/null codes and never create `ClaimCode` rows.

- [ ] **Step 7: Run QR unit and E2E verification**

```bash
npm --workspace api test -- --runTestsByPath src/common/specs/download-gate.spec.ts src/claim-codes/specs/claim-code-qr.spec.ts src/claim-codes/specs/claim-code-artifacts.service.spec.ts src/actions/specs/actions.service.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-claim-code-artifacts.e2e-spec.ts
```

Expected: every QR round-trips to its code; PDF/ZIP counts are exact; participant gets `403`; concurrent artifact gets `429` plus `Retry-After: 30`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/common apps/api/src/claim-codes apps/api/src/actions apps/api/test/admin-claim-code-artifacts.e2e-spec.ts
git commit -m "feat: generate claim code qr artifacts"
```

---

### Task 4: Add Batch and QR Downloads to the Admin Codes UI

**Files:**
- Modify: `apps/web/src/features/actions/actions.types.ts`
- Modify: `apps/web/src/features/actions/actions.service.ts`
- Modify: `apps/web/src/app/admin/codigos/claim-code-generator.tsx`
- Modify: `apps/web/src/app/admin/codigos/claim-code-generator.spec.tsx`
- Create: `apps/web/src/app/admin/codigos/claim-code-batch-history.tsx`
- Create: `apps/web/src/app/admin/codigos/claim-code-batch-history.spec.tsx`
- Modify: `apps/web/src/app/admin/codigos/reusable-code-history.tsx`
- Create: `apps/web/src/app/admin/codigos/reusable-code-history.spec.tsx`
- Modify: `apps/web/src/app/admin/codigos/codes-client.tsx`
- Modify: `apps/web/src/lib/http/download.ts`
- Modify: `apps/web/src/lib/http/download.spec.ts`

**Interfaces:**
- Produces `fetchClaimCodeBatches(filters)` and existing `downloadFile(path)` usage for TXT/PDF/ZIP/PNG.
- `GeneratedClaimCodesResponse` gains `batch: ClaimCodeBatchSummary`.

- [ ] **Step 1: Write failing batch and download interaction tests**

Cover successful generation showing batch ID, history retry/empty states, and buttons invoking:

```ts
expect(downloadFile).toHaveBeenCalledWith('/admin/claim-code-batches/batch-1/qr.pdf');
expect(downloadFile).toHaveBeenCalledWith('/admin/claim-code-batches/batch-1/qr-images.zip');
expect(downloadFile).toHaveBeenCalledWith('/admin/reusable-codes/action-1/qr.png');
```

Also assert independent pending states and API error messages.

- [ ] **Step 2: Run the UI tests and observe missing history/contracts**

Run: `npm --workspace web test -- src/app/admin/codigos/claim-code-generator.spec.tsx src/app/admin/codigos/claim-code-batch-history.spec.tsx src/app/admin/codigos/reusable-code-history.spec.tsx src/lib/http/download.spec.ts`

Expected: FAIL on missing batch component and service functions.

- [ ] **Step 3: Implement typed services and batch history**

Use query key `['admin','claim-code-batches',filters]`, page size 10 and actions `Baixar TXT`, `Baixar PDF`, `Baixar PNGs`. Show action, creator, reason, creation time and the four counters; never render codes in history.

- [ ] **Step 4: Replace browser-local last-batch artifacts with server downloads**

The generator may still copy the just-created codes, but TXT/PDF/ZIP buttons must target `last.batch.id`. A page refresh loses the copy buffer but not the history/download capability.

- [ ] **Step 5: Add reusable QR actions**

Each reusable-code row gets `Baixar PNG` and `Baixar PDF`. Preserve existing status mutation and uses dialog focus behavior.

- [ ] **Step 6: Run frontend checks**

```bash
npm --workspace web test -- src/app/admin/codigos/claim-code-generator.spec.tsx src/app/admin/codigos/claim-code-batch-history.spec.tsx src/app/admin/codigos/reusable-code-history.spec.tsx src/lib/http/download.spec.ts
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: PASS; every format comes from the persisted batch/action endpoint.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/actions apps/web/src/app/admin/codigos apps/web/src/lib/http
git commit -m "feat: redownload claim code batch artifacts"
```

---

### Task 5: Add Camera Scanning with Explicit Confirmation

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Create: `apps/web/src/features/actions/redeem-code.validation.ts`
- Create: `apps/web/src/features/actions/qr-scanner.ts`
- Create: `apps/web/src/features/actions/qr-scanner.spec.ts`
- Create: `apps/web/src/app/home/qr-code-scanner.tsx`
- Create: `apps/web/src/app/home/qr-code-scanner.spec.tsx`
- Modify: `apps/web/src/app/home/redeem-code-dialog.tsx`
- Modify: `apps/web/src/app/home/redeem-code-dialog.spec.tsx`

**Interfaces:**
- `normalizeRedeemCode(value): string` centralizes the manual/QR format.
- `startQrScanner(video, onDetected): Promise<{ stop(): void }>` owns ZXing controls and media tracks.
- `QrCodeScanner` emits one normalized code and never calls the API.

- [ ] **Step 1: Install ZXing in the web workspace**

Run: `npm install --workspace web @zxing/browser`

Expected: dependency appears only in the web workspace and lockfile.

- [ ] **Step 2: Write failing lifecycle and confirmation tests**

Test user gesture before camera start, `facingMode: { ideal: 'environment' }`, first result wins, invalid payload stays in scanner, permission/device/insecure errors, `stop()` on detection/toggle/close/unmount and no mutation before confirmation.

```ts
await user.click(screen.getByRole('button', { name: 'Usar câmera' }));
scanner.emit('ABCD-EFGH');
expect(redeemActionCode).not.toHaveBeenCalled();
await user.click(screen.getByRole('button', { name: 'Confirmar resgate' }));
expect(redeemActionCode).toHaveBeenCalledWith('ABCD-EFGH');
```

- [ ] **Step 3: Run and observe missing scanner implementation**

Run: `npm --workspace web test -- src/features/actions/qr-scanner.spec.ts src/app/home/qr-code-scanner.spec.tsx src/app/home/redeem-code-dialog.spec.tsx`

Expected: FAIL because scanner/validation modules do not exist.

- [ ] **Step 4: Implement the adapter with dynamic import and total cleanup**

`startQrScanner` dynamically imports `BrowserQRCodeReader`, calls `decodeFromConstraints`, ignores ZXing `NotFoundException` scan misses, and returns an idempotent stop function that invokes controls plus every `video.srcObject` track. Reject insecure non-localhost contexts before requesting permission.

- [ ] **Step 5: Implement scanner states and confirmation in the dialog**

States are `manual | requesting | scanning | detected | camera-error`. On detection, copy the code into React Hook Form, stop camera and render `Confirmar resgate` plus `Escanear novamente`. Disable every submit while the existing mutation is pending.

- [ ] **Step 6: Run web tests, lint and typecheck**

```bash
npm --workspace web test -- src/features/actions/qr-scanner.spec.ts src/app/home/qr-code-scanner.spec.tsx src/app/home/redeem-code-dialog.spec.tsx
npm --workspace web run lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: PASS; camera cleanup leaves no active controls/tracks/timers and manual entry still works.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src/features/actions apps/web/src/app/home
git commit -m "feat: scan claim codes with camera confirmation"
```

---

### Task 6: Implement Atomic Claim Code Bulk Status Operations

**Files:**
- Create: `apps/api/src/claim-codes/dto/bulk-claim-code-status.dto.ts`
- Create: `apps/api/src/claim-codes/dto/claim-code-bulk-query.dto.ts`
- Create: `apps/api/src/claim-codes/dto/claim-code-bulk-response.dto.ts`
- Create: `apps/api/src/claim-codes/claim-code-bulk-csv.ts`
- Create: `apps/api/src/claim-codes/specs/bulk-claim-code-status.dto.spec.ts`
- Create: `apps/api/src/claim-codes/specs/claim-code-bulk-csv.spec.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.repository.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.service.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.controller.ts`
- Modify: `apps/api/src/claim-codes/specs/claim-codes.repository.spec.ts`
- Modify: `apps/api/src/claim-codes/specs/claim-codes.service.spec.ts`
- Modify: `apps/api/src/claim-codes/specs/claim-codes.controller.spec.ts`
- Create: `apps/api/test/admin-claim-code-bulk.e2e-spec.ts`

**Interfaces:**
- Produces `bulkUpdateStatus(dto, context): Promise<ClaimCodeBulkOperationDetail>`.
- Exposes bulk mutation, paginated history, detail and report CSV.
- Technical failure rolls back all writes; mixed business outcomes commit one exact report.

- [ ] **Step 1: Write failing DTO, classification, audit and CSV tests**

Assert 1–500 unique string IDs, 10–500 trimmed reason, matching confirmation word, sorted result items and no raw code in audit/report persistence.

```ts
expect(result.counts).toEqual({
  selected: 4, changed: 1, unchanged: 1, used: 1, notFound: 1,
});
expect(audit.record).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run focused tests and observe missing bulk contracts**

Run: `npm --workspace api test -- --runTestsByPath src/claim-codes/specs/bulk-claim-code-status.dto.spec.ts src/claim-codes/specs/claim-code-bulk-csv.spec.ts src/claim-codes/specs/claim-codes.service.spec.ts`

Expected: FAIL on missing DTO/service methods.

- [ ] **Step 3: Implement locked classification in one transaction**

Lock existing rows in deterministic ID order with tagged SQL:

```ts
Prisma.sql`
  SELECT "id", "code", "isActive", "isUsed"
  FROM "ClaimCode"
  WHERE "id" IN (${Prisma.join(ids)})
  ORDER BY "id"
  FOR UPDATE
`
```

Classify missing IDs from the input set; update only locked rows where `!isUsed && isActive !== dto.isActive`; create operation/items and one audit event before commit.

- [ ] **Step 4: Implement history/detail/report endpoints**

Expose:

```text
POST /admin/claim-codes/bulk-status
GET /admin/claim-code-bulk-operations
GET /admin/claim-code-bulk-operations/:id
GET /admin/claim-code-bulk-operations/:id/report.csv
```

Report header is `codigo_id;codigo_mascarado;resultado`; it uses BOM, semicolon and CRLF and never loads the raw code.

- [ ] **Step 5: Prove resgate/bulk races and rollback in PostgreSQL**

Run one resgate and one disable against the same code concurrently. Accept only these final states: used with bulk `ALREADY_USED`, or unused/disabled with resgate `400`. Assert no used code was changed. Force audit failure and assert no operation/items/status change remain.

- [ ] **Step 6: Run bulk unit and E2E checks**

```bash
npm --workspace api test -- --runTestsByPath src/claim-codes/specs/bulk-claim-code-status.dto.spec.ts src/claim-codes/specs/claim-code-bulk-csv.spec.ts src/claim-codes/specs/claim-codes.repository.spec.ts src/claim-codes/specs/claim-codes.service.spec.ts src/claim-codes/specs/claim-codes.controller.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-claim-code-bulk.e2e-spec.ts test/claim-code-concurrency.e2e-spec.ts
```

Expected: PASS with exact counts, one audit event and append-only reports.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/claim-codes apps/api/test/admin-claim-code-bulk.e2e-spec.ts
git commit -m "feat: manage claim codes in audited batches"
```

---

### Task 7: Add Explicit Bulk Selection and Reports to the Codes UI

**Files:**
- Modify: `apps/web/src/features/actions/actions.types.ts`
- Modify: `apps/web/src/features/actions/actions.service.ts`
- Create: `apps/web/src/app/admin/codigos/claim-code-bulk-dialog.tsx`
- Create: `apps/web/src/app/admin/codigos/claim-code-bulk-dialog.spec.tsx`
- Create: `apps/web/src/app/admin/codigos/claim-code-bulk-report.tsx`
- Create: `apps/web/src/app/admin/codigos/claim-code-bulk-report.spec.tsx`
- Modify: `apps/web/src/app/admin/codigos/claim-code-history.tsx`
- Modify: `apps/web/src/app/admin/codigos/claim-code-history.spec.tsx`

**Interfaces:**
- Produces `bulkUpdateClaimCodes(payload)`, `fetchClaimCodeBulkOperation(id)` and report download.
- Selection is `Set<string>` scoped to explicit visible choices; it never means all filtered rows.

- [ ] **Step 1: Write failing selection, confirmation and report tests**

Cover used checkbox absence, select-page excluding used, page changes preserving only explicitly selected IDs, 500 cap, typed `ATIVAR`/`DESATIVAR`, reason validation, mutation retry and all four outcomes.

- [ ] **Step 2: Run and observe missing bulk UI**

Run: `npm --workspace web test -- src/app/admin/codigos/claim-code-bulk-dialog.spec.tsx src/app/admin/codigos/claim-code-bulk-report.spec.tsx src/app/admin/codigos/claim-code-history.spec.tsx`

Expected: FAIL because bulk components and services do not exist.

- [ ] **Step 3: Implement selection and reinforced confirmation**

Show selected count in an `aria-live` region. Disable bulk actions at zero. Dialog submits exactly:

```ts
{
  ids: [...selectedIds],
  isActive: intent === 'activate',
  reason: normalizeAdminReason(reason),
  confirmation: intent === 'activate' ? 'ATIVAR' : 'DESATIVAR',
}
```

The confirmation input must equal the word; do not auto-fill it.

- [ ] **Step 4: Render and preserve the persisted report**

After success, clear selection, invalidate codes/dashboard/bulk history, show changed/unchanged/used/not-found sections and offer `report.csv`. Closing the panel must not delete the server operation.

- [ ] **Step 5: Run frontend validation**

```bash
npm --workspace web test -- src/app/admin/codigos/claim-code-bulk-dialog.spec.tsx src/app/admin/codigos/claim-code-bulk-report.spec.tsx src/app/admin/codigos/claim-code-history.spec.tsx
npm --workspace web run lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: PASS; no operation can implicitly target items outside the selected IDs.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/actions apps/web/src/app/admin/codigos
git commit -m "feat: operate claim codes with explicit selection"
```

---

### Task 8: Build the CSV Core and Participant/Shop Export APIs

**Files:**
- Create: `apps/api/src/exports/csv.ts`
- Create: `apps/api/src/exports/csv.spec.ts`
- Create: `apps/api/src/exports/export-limits.ts`
- Create: `apps/api/src/exports/export-limits.spec.ts`
- Create: `apps/api/src/exports/admin-exports.repository.ts`
- Create: `apps/api/src/exports/admin-exports.service.ts`
- Create: `apps/api/src/exports/admin-exports.controller.ts`
- Create: `apps/api/src/exports/exports.module.ts`
- Create: `apps/api/src/exports/specs/admin-exports.repository.spec.ts`
- Create: `apps/api/src/exports/specs/admin-exports.service.spec.ts`
- Create: `apps/api/src/exports/specs/admin-exports.controller.spec.ts`
- Modify: `apps/api/src/admin/admin-participants.repository.ts`
- Modify: `apps/api/src/admin/dto/admin-participants-query.dto.ts`
- Modify: `apps/api/src/rewards/rewards.repository.ts`
- Modify: `apps/api/src/rewards/dto/admin-redemptions-query.dto.ts`
- Modify: `apps/api/src/rewards/rewards.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/admin-exports.e2e-spec.ts`

**Interfaces:**
- Produces `serializeCsv(header, rows, maxBytes): Buffer` with formula defense.
- Produces shared `buildParticipantWhere()` and `buildRedemptionWhere()` used by lists and exports.
- Exposes participant/shop count and CSV endpoints.

- [ ] **Step 1: Write failing CSV security and limit tests**

```ts
expect(serializeCsv(['valor'], [['=1+1']]).toString('utf8'))
  .toBe('\ufeffvalor\r\n\'=1+1\r\n');
expect(() => serializeCsv(['a'], [['x'.repeat(100)]], 20))
  .toThrow(CsvSizeLimitError);
```

Cover `+`, `-`, `@`, tab, carriage return, quotes, semicolon, CRLF, null, numbers and exact 25 MiB boundary.

- [ ] **Step 2: Write filter identity tests**

Seed participants/orders that differ by search/status/reward/date. For each filter, compare repository IDs from the page builder with export rows and count. Assert admin users never enter participant export.

- [ ] **Step 3: Run and observe missing export module**

Run: `npm --workspace api test -- --runTestsByPath src/exports/csv.spec.ts src/exports/export-limits.spec.ts src/exports/specs/admin-exports.repository.spec.ts src/exports/specs/admin-exports.service.spec.ts`

Expected: FAIL because the exports directory does not exist.

- [ ] **Step 4: Implement pure CSV and the two-slot CSV gate**

Move manifest/report escaping to `exports/csv.ts`. `serializeCsv` builds at most 25 MiB before controller headers. `ExportLimits.runCsv()` uses `DownloadGate` with capacity two and maps overflow to retry 30.

- [ ] **Step 5: Share Prisma where builders and fetch blocks of 1,000**

Export these pure functions from their repositories:

```ts
export function buildParticipantWhere(filter: ParticipantFilter): Prisma.UserWhereInput;
export function buildRedemptionWhere(filter: RedemptionFilter): Prisma.RewardRedemptionWhereInput;
```

List methods apply pagination after the builder. Export repository applies identical `where`, deterministic `id asc`, blocks of 1,000 and hard row count 50.000.

- [ ] **Step 6: Expose count and CSV endpoints**

```text
GET /admin/participants/export-count
GET /admin/participants/export.csv
GET /admin/redemptions/export-count
GET /admin/redemptions/export.csv
```

Participant header and shop header must match the approved design exactly. Shop DTO/list gains optional `from` and exclusive `to`, parsed in São Paulo.

- [ ] **Step 7: Run API unit/E2E checks**

```bash
npm --workspace api test -- --runTestsByPath src/exports/csv.spec.ts src/exports/export-limits.spec.ts src/exports/specs/admin-exports.repository.spec.ts src/exports/specs/admin-exports.service.spec.ts src/exports/specs/admin-exports.controller.spec.ts src/admin/specs/admin-participants.service.spec.ts src/rewards/specs/rewards.service.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-exports.e2e-spec.ts test/admin-participants.e2e-spec.ts test/admin-rewards.e2e-spec.ts
```

Expected: filters/list/CSV agree; participant forbidden; formula payload is inert; row/byte/concurrency limits return `422`/`429` before file headers.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exports apps/api/src/admin apps/api/src/rewards apps/api/src/app.module.ts apps/api/test/admin-exports.e2e-spec.ts
git commit -m "feat: export filtered participants and shop orders"
```

---

### Task 9: Add the Shared Export Dialog to Participants and Shop

**Files:**
- Create: `apps/web/src/features/exports/exports.types.ts`
- Create: `apps/web/src/features/exports/exports.service.ts`
- Create: `apps/web/src/features/exports/exports.service.spec.ts`
- Create: `apps/web/src/app/admin/_components/admin-export-dialog.tsx`
- Create: `apps/web/src/app/admin/_components/admin-export-dialog.spec.tsx`
- Modify: `apps/web/src/app/admin/participantes/participants-client.tsx`
- Modify: `apps/web/src/app/admin/participantes/participants-client.spec.tsx`
- Modify: `apps/web/src/app/admin/lojinha/redemption-history.tsx`
- Modify: `apps/web/src/app/admin/lojinha/redemption-history.spec.tsx`
- Modify: `apps/web/src/features/rewards/rewards.types.ts`
- Modify: `apps/web/src/features/rewards/rewards.service.ts`

**Interfaces:**
- `AdminExportDialog` receives `title`, applied filter summary, `count()` and `download()` callbacks.
- Draft input never reaches count/download until its containing screen applies it.

- [ ] **Step 1: Write failing dialog and screen tests**

Cover count loading/error/retry, 0 rows, >50.000 rows, contains-PII warning, pending download and two clicks. Assert a typed-but-unsubmitted search is absent from participant download; applied search is present.

- [ ] **Step 2: Run and observe missing export UI**

Run: `npm --workspace web test -- src/features/exports/exports.service.spec.ts src/app/admin/_components/admin-export-dialog.spec.tsx src/app/admin/participantes/participants-client.spec.tsx src/app/admin/lojinha/redemption-history.spec.tsx`

Expected: FAIL on missing service/dialog.

- [ ] **Step 3: Implement count/download services and dialog**

Build paths with `withQuery`, omit page/limit, and reuse `downloadFile`. Dialog must expose applied filters in text, announce count with `aria-live`, disable export outside `1..50000`, preserve retry state and close only after `download()` resolves.

- [ ] **Step 4: Wire participant and shop filters**

Participants pass `{ search, status }`. Shop adds applied date inputs and passes `{ search, status, rewardId, from, to }` to both list and export. A failed export must leave list content visible.

- [ ] **Step 5: Run frontend checks**

```bash
npm --workspace web test -- src/features/exports/exports.service.spec.ts src/app/admin/_components/admin-export-dialog.spec.tsx src/app/admin/participantes/participants-client.spec.tsx src/app/admin/lojinha/redemption-history.spec.tsx
npm --workspace web run lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: PASS; every download reflects only applied filters and has an exact count preview.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/exports apps/web/src/app/admin apps/web/src/features/rewards
git commit -m "feat: export participants and shop filters"
```

---

### Task 10: Add Global Code Redemption and Point Event APIs/Exports

**Files:**
- Create: `apps/api/src/admin/dto/admin-point-events-query.dto.ts`
- Create: `apps/api/src/admin/dto/admin-point-event-response.dto.ts`
- Create: `apps/api/src/claim-codes/dto/code-redemptions-query.dto.ts`
- Create: `apps/api/src/claim-codes/dto/code-redemption-response.dto.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/admin/admin-participants.repository.ts`
- Modify: `apps/api/src/admin/admin-participants.service.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.controller.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.repository.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.service.ts`
- Modify: `apps/api/src/exports/admin-exports.repository.ts`
- Modify: `apps/api/src/exports/admin-exports.service.ts`
- Modify: `apps/api/src/exports/admin-exports.controller.ts`
- Modify: `apps/api/src/exports/specs/admin-exports.repository.spec.ts`
- Modify: `apps/api/src/exports/specs/admin-exports.service.spec.ts`
- Create: `apps/api/test/admin-ledger-code-exports.e2e-spec.ts`

**Interfaces:**
- Exposes paginated `GET /admin/point-events` and `GET /admin/code-redemptions`.
- Exposes matching count/CSV endpoints with shared where builders.
- Preserves `LEGACY_UNKNOWN`; raw codes are masked in list/export.

- [ ] **Step 1: Write failing query/list/export identity tests**

Seed direct, reusable, claim, legacy, reward, admin adjustment and reversal events across two dates. Assert method/source/kind/participant/date filters and exact `[from,to)` São Paulo boundaries.

- [ ] **Step 2: Run and observe missing global endpoints**

Run: `npm --workspace api test -- --runTestsByPath src/exports/specs/admin-exports.repository.spec.ts src/exports/specs/admin-exports.service.spec.ts src/admin/specs/admin-participants.service.spec.ts src/claim-codes/specs/claim-codes.service.spec.ts`

Expected: FAIL because global query contracts do not exist.

- [ ] **Step 3: Implement shared point-event and code-redemption builders**

```ts
export function buildPointEventWhere(filter: PointEventFilter): Prisma.PointEventWhereInput;
export function buildCodeRedemptionWhere(filter: CodeRedemptionFilter): Prisma.PointEventWhereInput;
```

Code redemptions require `source: ACTION_REDEEM` and method in `REUSABLE_CODE|CLAIM_CODE`; participant search uses name/email. Map reference labels from Action/Reward/Audit and mask code through `maskClaimCode`.

- [ ] **Step 4: Expose list/count/CSV contracts**

```text
GET /admin/point-events
GET /admin/point-events/export-count
GET /admin/point-events/export.csv
GET /admin/code-redemptions
GET /admin/code-redemptions/export-count
GET /admin/code-redemptions/export.csv
```

Use the exact headers from the design, omit internal IDs and actor email, and format operational timestamps.

- [ ] **Step 5: Run unit and E2E checks**

```bash
npm --workspace api test -- --runTestsByPath src/exports/specs/admin-exports.repository.spec.ts src/exports/specs/admin-exports.service.spec.ts src/admin/specs/admin-participants.service.spec.ts src/claim-codes/specs/claim-codes.service.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-ledger-code-exports.e2e-spec.ts test/admin-adjustments.e2e-spec.ts test/admin-actions-codes.e2e-spec.ts
```

Expected: lists and CSVs return identical filtered sets; `LEGACY_UNKNOWN` remains explicit; claim/reusable raw values never enter CSV.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin apps/api/src/claim-codes apps/api/src/exports apps/api/test/admin-ledger-code-exports.e2e-spec.ts
git commit -m "feat: expose code redemption and point ledgers"
```

---

### Task 11: Add Movements and Code Redemption Screens

**Files:**
- Create: `apps/web/src/features/movements/movements.types.ts`
- Create: `apps/web/src/features/movements/movements.service.ts`
- Create: `apps/web/src/features/movements/movements.service.spec.ts`
- Create: `apps/web/src/app/admin/movimentacoes/page.tsx`
- Create: `apps/web/src/app/admin/movimentacoes/movements-client.tsx`
- Create: `apps/web/src/app/admin/movimentacoes/movements-client.spec.tsx`
- Create: `apps/web/src/app/admin/codigos/code-redemption-history.tsx`
- Create: `apps/web/src/app/admin/codigos/code-redemption-history.spec.tsx`
- Modify: `apps/web/src/app/admin/codigos/codes-client.tsx`
- Modify: `apps/web/src/app/admin/_components/admin-shell.tsx`
- Modify: `apps/web/src/app/admin/_components/admin-shell.spec.tsx`
- Modify: `apps/web/src/features/actions/actions.types.ts`
- Modify: `apps/web/src/features/actions/actions.service.ts`
- Modify: `apps/web/src/features/participants/point-event-labels.ts`

**Interfaces:**
- `/admin/movimentacoes` owns global point filters and export dialog.
- Codes page gains a third accessible tab `Resgates`, with its own filters/export.

- [ ] **Step 1: Write failing routing/filter/export tests**

Cover navigation active state, list loading/error/empty/retry, pagination resetting on applied filters, date validation, origin labels, masked code display and export paths without page/limit.

- [ ] **Step 2: Run and observe missing screens**

Run: `npm --workspace web test -- src/features/movements/movements.service.spec.ts src/app/admin/movimentacoes/movements-client.spec.tsx src/app/admin/codigos/code-redemption-history.spec.tsx src/app/admin/_components/admin-shell.spec.tsx`

Expected: FAIL because pages/services do not exist.

- [ ] **Step 3: Implement movements page**

Filters: participant search, source, kind, from, exclusive to. Use page size 20, applied-filter state and `AdminExportDialog`. Display points/XP deltas with signs, source/reference, actor, description and operational time.

- [ ] **Step 4: Implement code-redemption tab**

Filters: action, method, participant, from, exclusive to. Show participant, action, method, masked code, points/XP and time. Keep the existing single/reusable tabs and arrow/Home/End keyboard behavior across all three tabs.

- [ ] **Step 5: Run frontend checks**

```bash
npm --workspace web test -- src/features/movements/movements.service.spec.ts src/app/admin/movimentacoes/movements-client.spec.tsx src/app/admin/codigos/code-redemption-history.spec.tsx src/app/admin/_components/admin-shell.spec.tsx
npm --workspace web run lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: PASS; both screens keep list failures independent from export failures.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/movements apps/web/src/features/actions apps/web/src/features/participants apps/web/src/app/admin
git commit -m "feat: browse and export operational ledgers"
```

---

### Task 12: Aggregate Security Status Metrics and Add Named Rate Policies

**Files:**
- Create: `apps/api/src/security/rate-limit-policy.decorator.ts`
- Modify: `apps/api/src/security/app-throttler.guard.ts`
- Modify: `apps/api/src/security/app-throttler.guard.spec.ts`
- Create: `apps/api/src/security/security-http-metrics.middleware.ts`
- Create: `apps/api/src/security/security-http-metrics.middleware.spec.ts`
- Create: `apps/api/src/security/security-http-metrics.buffer.ts`
- Create: `apps/api/src/security/security-http-metrics.buffer.spec.ts`
- Create: `apps/api/src/security/security-http-metrics.repository.ts`
- Create: `apps/api/src/security/security-http-metrics.repository.spec.ts`
- Create: `apps/api/src/security/security-http-metrics.service.ts`
- Create: `apps/api/src/security/security-http-metrics.service.spec.ts`
- Create: `apps/api/src/security/security-http-metrics.scheduler.ts`
- Create: `apps/api/src/security/security-http-metrics.scheduler.spec.ts`
- Create: `apps/api/src/security/security-http-metrics.controller.ts`
- Create: `apps/api/src/security/dto/security-http-metrics-response.dto.ts`
- Modify: `apps/api/src/security/security.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/exports/admin-exports.controller.ts`
- Modify: `apps/api/src/claim-codes/claim-codes.controller.ts`
- Create: `apps/api/test/admin-security-metrics.e2e-spec.ts`

**Interfaces:**
- `@RateLimitPolicy('export'|'bulk')` selects exact policy before role/method fallback.
- Middleware records only final status; buffer swaps/restores batches safely.
- `flush(now)` performs additive per-minute upserts; overview returns 5m/1h/24h and `NORMAL|ATTENTION|DEGRADED`.

- [ ] **Step 1: Write failing named-policy and metrics privacy tests**

Add guard cases for export 5/min/admin and bulk 2/min/admin sharing counters inside each class but not with common admin mutation. Middleware test passes request objects containing CPF/email/cookies/tokens and asserts the buffer call receives only `{ statusCode, finishedAt }`.

- [ ] **Step 2: Write failing buffer/flush/threshold tests**

```ts
buffer.record(401, new Date('2026-08-22T12:00:10Z'));
buffer.record(429, new Date('2026-08-22T12:00:20Z'));
expect(buffer.drain()).toEqual([{ minuteStart: new Date('2026-08-22T12:00:00Z'), unauthorizedCount: 1, forbiddenCount: 0, rateLimitedCount: 1 }]);
```

Cover failed flush restore, concurrent additive upsert, 20/10/5 thresholds, stale >2 minutes, 30-day strict retention and no PII fields.

- [ ] **Step 3: Run and observe missing metrics implementation**

Run: `npm --workspace api test -- --runTestsByPath src/security/app-throttler.guard.spec.ts src/security/security-http-metrics.middleware.spec.ts src/security/security-http-metrics.buffer.spec.ts src/security/security-http-metrics.repository.spec.ts src/security/security-http-metrics.service.spec.ts src/security/security-http-metrics.scheduler.spec.ts`

Expected: FAIL because decorator/metrics classes do not exist.

- [ ] **Step 4: Implement named policies in the existing guard**

Policy table:

```ts
const NAMED_POLICIES = {
  export: { name: 'admin-export', limit: 5, ttl: 60_000 },
  bulk: { name: 'claim-code-bulk', limit: 2, ttl: 60_000 },
} as const;
```

Read metadata with `reflector.getAllAndOverride` before login/health/method defaults. Decorate every CSV/TXT/PDF/ZIP/PNG endpoint as `export` and bulk mutation as `bulk`.

- [ ] **Step 5: Implement status-only middleware and atomic flush**

Register after `RequestIdMiddleware`. On `response.once('finish')`, record only 401/403/429. Scheduler flushes at second 10 each minute with `waitForCompletion`, retention runs 03:25 São Paulo. PostgreSQL upsert increments existing counts rather than replacing them.

- [ ] **Step 6: Implement protected overview**

`GET /admin/security-metrics/overview` returns:

```ts
type SecurityMetricsOverview = {
  status: 'NORMAL' | 'ATTENTION' | 'DEGRADED';
  lastFlushedMinute: string | null;
  periods: {
    fiveMinutes: { unauthorized: number; forbidden: number; rateLimited: number };
    oneHour: { unauthorized: number; forbidden: number; rateLimited: number };
    twentyFourHours: { unauthorized: number; forbidden: number; rateLimited: number };
  };
  thresholds: { unauthorized: 20; forbidden: 10; rateLimited: 5; windowMinutes: 5 };
};
```

- [ ] **Step 7: Run unit and E2E checks**

```bash
npm --workspace api test -- --runTestsByPath src/security/app-throttler.guard.spec.ts src/security/security-http-metrics.middleware.spec.ts src/security/security-http-metrics.buffer.spec.ts src/security/security-http-metrics.repository.spec.ts src/security/security-http-metrics.service.spec.ts src/security/security-http-metrics.scheduler.spec.ts
npm --workspace api run test:e2e -- --runTestsByPath test/admin-security-metrics.e2e-spec.ts
```

Expected: PASS; authentic 401/403/429 requests aggregate after explicit flush; endpoint is admin-only and serialized data contains no request attributes.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/security apps/api/src/exports apps/api/src/claim-codes apps/api/src/app.module.ts apps/api/test/admin-security-metrics.e2e-spec.ts
git commit -m "feat: aggregate security response metrics"
```

---

### Task 13: Show Security Metrics Independently on the Dashboard

**Files:**
- Create: `apps/web/src/features/security/security-metrics.types.ts`
- Create: `apps/web/src/features/security/security-metrics.service.ts`
- Create: `apps/web/src/features/security/security-metrics.service.spec.ts`
- Create: `apps/web/src/app/admin/_components/security-metrics-panel.tsx`
- Create: `apps/web/src/app/admin/_components/security-metrics-panel.spec.tsx`
- Modify: `apps/web/src/app/admin/dashboard-client.tsx`
- Modify: `apps/web/src/app/admin/dashboard-client.spec.tsx`

**Interfaces:**
- `fetchSecurityMetricsOverview()` calls the protected overview.
- Panel polls every 60 seconds independently from dashboard and presence queries.

- [ ] **Step 1: Write failing service/panel tests**

Cover `NORMAL`, threshold equality as `ATTENTION`, `DEGRADED`, last update, 5m/1h/24h values, initial loading, error/retry and background refresh. Assert security failure leaves operational/presence panels visible.

- [ ] **Step 2: Run and observe missing panel**

Run: `npm --workspace web test -- src/features/security/security-metrics.service.spec.ts src/app/admin/_components/security-metrics-panel.spec.tsx src/app/admin/dashboard-client.spec.tsx`

Expected: FAIL because security feature/panel do not exist.

- [ ] **Step 3: Implement independent polling and accessible cards**

```ts
useQuery({
  queryKey: ['admin', 'security-metrics', 'overview'],
  queryFn: fetchSecurityMetricsOverview,
  refetchInterval: 60_000,
  refetchIntervalInBackground: true,
  retry: false,
});
```

Render one card per HTTP status with 5m value, threshold and 1h/24h context. Explain that counts are aggregated and delayed by up to two minutes.

- [ ] **Step 4: Run frontend verification**

```bash
npm --workspace web test -- src/features/security/security-metrics.service.spec.ts src/app/admin/_components/security-metrics-panel.spec.tsx src/app/admin/dashboard-client.spec.tsx
npm --workspace web run lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: PASS; panel errors are isolated and polling does not duplicate the old dashboard request.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/security apps/web/src/app/admin
git commit -m "feat: show aggregated security metrics"
```

---

### Task 14: Rehearse Load, Align CI/Docs, and Verify the Milestone

**Files:**
- Modify: `scripts/load/marco-9-load.mjs`
- Create: `scripts/load/marco-12-load.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/plan.md`
- Modify: `docs/plano-fase.md`
- Modify: `apps/api/README.md`
- Modify: `apps/web/README.md`
- Modify: `apps/api/.env.example`
- Modify: `.env.example`

**Interfaces:**
- Rehearsal runs 150 participant flows while one admin downloads CSV and a 500-code PDF/ZIP.
- Report records aggregate latency/status/resource metrics, artifact sizes/counts and no credentials/PII/codes.

- [ ] **Step 1: Write failing Marco 12 load contracts**

```js
assert.equal(report.thresholds.expectedParticipants, 150);
assert.equal(report.thresholds.validParticipant429, 0);
assert.equal(report.artifacts.claimCodeCount, 500);
assert.equal(report.artifacts.pdfDownloaded, true);
assert.equal(report.artifacts.zipDownloaded, true);
assert.equal(report.securityMetrics.containsPii, false);
```

Stub responses to prove filters are forwarded, artifact bodies are counted but never serialized, a second simultaneous QR request gets 429/Retry-After and normal participant operations continue.

- [ ] **Step 2: Run and observe old rehearsal behavior**

```bash
node --check scripts/load/marco-9-load.mjs
node --test scripts/load/cpf.test.mjs scripts/load/marco-11-load.test.mjs scripts/load/marco-12-load.test.mjs
```

Expected: new Marco 12 contract fails because exports/QR/security metrics are absent from the scenario.

- [ ] **Step 3: Extend the rehearsal without storing sensitive material**

Generate a 500-code batch through the admin session, retain values only in memory long enough to verify counts, download PDF/ZIP, perform participant reads/heartbeat/resgate concurrently, poll security overview and erase code arrays before report serialization. Scan the report against every generated sensitive value.

- [ ] **Step 4: Align CI and documentation**

CI runs the new load contract, Prisma migration test, QR decoder/PDF/ZIP tests and updates Docker image tags to `marco12`. Document dependencies, HTTPS camera requirement, 500/50.000/25 MiB limits, five/two per-minute policies, 30-day metric retention and 20/10/5 thresholds. Mark Marco 12 implemented only after the complete gate passes.

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
node --test scripts/load/cpf.test.mjs scripts/load/marco-11-load.test.mjs scripts/load/marco-12-load.test.mjs
node --check scripts/load/marco-9-load.mjs
git diff --check
```

Expected: every command exits 0 against a disposable migrated PostgreSQL database.

- [ ] **Step 6: Run the reduced hosted rehearsal and manual device check**

```powershell
$env:LOAD_REDUCED='true'
$env:LOAD_HEARTBEAT_WINDOW_MS='130000'
node scripts/load/marco-9-load.mjs
```

Verify one real Android and one real iPhone browser over HTTPS: permission, rear camera, confirmation, cancel/rescan, manual fallback, reusable QR, unique QR and camera shutdown. Verify participant p95/error/429 limits while downloads run; do not commit `artifacts/`.

- [ ] **Step 7: Commit**

```bash
git add scripts/load/marco-9-load.mjs scripts/load/marco-12-load.test.mjs .github/workflows/ci.yml docs/plan.md docs/plano-fase.md apps/api/README.md apps/web/README.md apps/api/.env.example .env.example
git commit -m "chore: validate marco 12 scale operations"
```

---

## Definition of Done

- Novos lotes persistem criador, motivo, requestId, códigos e contagens; códigos legados continuam válidos sem lote inventado.
- TXT, PDF e ZIP/PNG podem ser baixados novamente e reproduzem exatamente os códigos persistidos.
- Reusable e Claim Code QR usam o mesmo endpoint/regras existentes.
- Câmera só inicia por gesto, sempre encerra recursos e exige confirmação antes da mutation.
- Bulk usa 1–500 IDs explícitos, nunca altera usado, persiste relatório append-only e audita atomicamente.
- Participantes, resgates de código, movimentos e pedidos têm lista/export com o mesmo filtro.
- CSV aplica BOM, semicolon, CRLF, timezone, formula defense, 50.000 rows e 25 MiB.
- Gates e rate limits retornam `429`/`Retry-After` sem limitar participantes válidos atrás do mesmo NAT.
- `401`, `403` e `429` aparecem agregados em 5m/1h/24h, com 20/10/5, retenção 30 dias e nenhuma dimensão individual.
- O ensaio de 150 participantes permanece dentro dos limites do Marco 9 durante export/QR.
- Prisma, migration, lint, unit, repository, E2E, frontend, typecheck, builds, load contracts e `git diff --check` passam.

BEGIN;

ALTER TABLE "AdminAuditEvent"
  ADD COLUMN "actorDisplayName" TEXT,
  ADD COLUMN "actorDisplayEmail" TEXT,
  ADD COLUMN "participantDisplayName" TEXT,
  ADD COLUMN "participantDisplayEmail" TEXT,
  ADD COLUMN "entityDisplayName" TEXT;

DROP TRIGGER "AdminAuditEvent_append_only" ON "AdminAuditEvent";

UPDATE "AdminAuditEvent" AS audit
SET
  "actorDisplayName" = CASE
    WHEN audit."actorType" = 'SYSTEM' THEN 'Sistema'
    ELSE COALESCE(
      (SELECT actor."name" FROM "User" AS actor WHERE actor."id" = audit."actorAdminId"),
      'Administrador ' || audit."actorAdminId"
    )
  END,
  "actorDisplayEmail" = (
    SELECT actor."email" FROM "User" AS actor WHERE actor."id" = audit."actorAdminId"
  ),
  "participantDisplayName" = CASE
    WHEN audit."participantId" IS NULL THEN NULL
    ELSE COALESCE(
      (SELECT participant."name" FROM "User" AS participant WHERE participant."id" = audit."participantId"),
      'Participante ' || audit."participantId"
    )
  END,
  "participantDisplayEmail" = (
    SELECT participant."email" FROM "User" AS participant WHERE participant."id" = audit."participantId"
  ),
  "entityDisplayName" = CASE audit."entityType"
    WHEN 'PARTICIPANT' THEN COALESCE(
      (SELECT participant."name" FROM "User" AS participant WHERE participant."id" = audit."entityId"),
      'Participante ' || audit."entityId"
    )
    WHEN 'ACTION' THEN COALESCE(
      (SELECT action."name" FROM "Action" AS action WHERE action."id" = audit."entityId"),
      'Atividade ' || audit."entityId"
    )
    WHEN 'CLAIM_CODE_BATCH' THEN 'Lote de códigos ' || audit."entityId"
    WHEN 'CLAIM_CODE' THEN CASE
      WHEN COALESCE(audit."after"->>'maskedCode', audit."before"->>'maskedCode') ~ '^[*]{1,4}$'
        OR COALESCE(audit."after"->>'maskedCode', audit."before"->>'maskedCode') ~ '^[^*]{2}[*]+[^*]{2}$'
      THEN 'Código ' || COALESCE(audit."after"->>'maskedCode', audit."before"->>'maskedCode')
      ELSE 'Código ' || audit."entityId"
    END
    WHEN 'REWARD' THEN COALESCE(
      (SELECT reward."name" FROM "Reward" AS reward WHERE reward."id" = audit."entityId"),
      'Recompensa ' || audit."entityId"
    )
    WHEN 'REWARD_REDEMPTION' THEN COALESCE(
      (
        SELECT 'Resgate de ' || reward."name"
        FROM "RewardRedemption" AS redemption
        JOIN "Reward" AS reward ON reward."id" = redemption."rewardId"
        WHERE redemption."id" = audit."entityId"
      ),
      'Resgate ' || audit."entityId"
    )
    WHEN 'POINT_EVENT' THEN 'Evento de pontos ' || audit."entityId"
    WHEN 'RECONCILIATION' THEN 'Reconciliação ' || audit."entityId"
  END;

CREATE TRIGGER "AdminAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AdminAuditEvent"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_change();

COMMIT;

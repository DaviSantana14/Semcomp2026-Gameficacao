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
      WHEN char_length(COALESCE(audit."after"->>'maskedCode', audit."before"->>'maskedCode')) <= 100
        AND (
          COALESCE(audit."after"->>'maskedCode', audit."before"->>'maskedCode') ~ '^[*]{1,4}$'
          OR COALESCE(audit."after"->>'maskedCode', audit."before"->>'maskedCode') ~ '^[^*]{2}[*]+[^*]{2}$'
        )
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

CREATE FUNCTION fill_audit_display_snapshots() RETURNS trigger AS $$
DECLARE
  safe_mask TEXT;
BEGIN
  IF NEW."actorDisplayName" IS NULL THEN
    IF NEW."actorType" = 'SYSTEM' THEN
      NEW."actorDisplayName" := 'Sistema';
    ELSE
      SELECT actor."name" INTO NEW."actorDisplayName"
      FROM "User" AS actor WHERE actor."id" = NEW."actorAdminId";
      NEW."actorDisplayName" := COALESCE(
        NEW."actorDisplayName",
        'Administrador ' || NEW."actorAdminId"
      );
    END IF;
  END IF;

  IF NEW."actorDisplayEmail" IS NULL AND NEW."actorAdminId" IS NOT NULL THEN
    SELECT actor."email" INTO NEW."actorDisplayEmail"
    FROM "User" AS actor WHERE actor."id" = NEW."actorAdminId";
  END IF;

  IF NEW."participantId" IS NOT NULL THEN
    IF NEW."participantDisplayName" IS NULL THEN
      SELECT participant."name" INTO NEW."participantDisplayName"
      FROM "User" AS participant WHERE participant."id" = NEW."participantId";
      NEW."participantDisplayName" := COALESCE(
        NEW."participantDisplayName",
        'Participante ' || NEW."participantId"
      );
    END IF;
    IF NEW."participantDisplayEmail" IS NULL THEN
      SELECT participant."email" INTO NEW."participantDisplayEmail"
      FROM "User" AS participant WHERE participant."id" = NEW."participantId";
    END IF;
  END IF;

  IF NEW."entityDisplayName" IS NULL THEN
    CASE NEW."entityType"
      WHEN 'PARTICIPANT' THEN
        SELECT participant."name" INTO NEW."entityDisplayName"
        FROM "User" AS participant WHERE participant."id" = NEW."entityId";
        NEW."entityDisplayName" := COALESCE(
          NEW."entityDisplayName",
          'Participante ' || NEW."entityId"
        );
      WHEN 'ACTION' THEN
        SELECT action."name" INTO NEW."entityDisplayName"
        FROM "Action" AS action WHERE action."id" = NEW."entityId";
        NEW."entityDisplayName" := COALESCE(
          NEW."entityDisplayName",
          'Atividade ' || NEW."entityId"
        );
      WHEN 'CLAIM_CODE_BATCH' THEN
        NEW."entityDisplayName" := 'Lote de códigos ' || NEW."entityId";
      WHEN 'CLAIM_CODE' THEN
        safe_mask := COALESCE(NEW."after"->>'maskedCode', NEW."before"->>'maskedCode');
        IF char_length(COALESCE(NEW."after"->>'maskedCode', NEW."before"->>'maskedCode')) <= 100
          AND (safe_mask ~ '^[*]{1,4}$' OR safe_mask ~ '^[^*]{2}[*]+[^*]{2}$') THEN
          NEW."entityDisplayName" := 'Código ' || safe_mask;
        ELSE
          NEW."entityDisplayName" := 'Código ' || NEW."entityId";
        END IF;
      WHEN 'REWARD' THEN
        SELECT reward."name" INTO NEW."entityDisplayName"
        FROM "Reward" AS reward WHERE reward."id" = NEW."entityId";
        NEW."entityDisplayName" := COALESCE(
          NEW."entityDisplayName",
          'Recompensa ' || NEW."entityId"
        );
      WHEN 'REWARD_REDEMPTION' THEN
        SELECT 'Resgate de ' || reward."name" INTO NEW."entityDisplayName"
        FROM "RewardRedemption" AS redemption
        JOIN "Reward" AS reward ON reward."id" = redemption."rewardId"
        WHERE redemption."id" = NEW."entityId";
        NEW."entityDisplayName" := COALESCE(
          NEW."entityDisplayName",
          'Resgate ' || NEW."entityId"
        );
      WHEN 'POINT_EVENT' THEN
        NEW."entityDisplayName" := 'Evento de pontos ' || NEW."entityId";
      WHEN 'RECONCILIATION' THEN
        NEW."entityDisplayName" := 'Reconciliação ' || NEW."entityId";
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AdminAuditEvent_fill_displays"
BEFORE INSERT ON "AdminAuditEvent"
FOR EACH ROW EXECUTE FUNCTION fill_audit_display_snapshots();

CREATE TRIGGER "AdminAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AdminAuditEvent"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_change();

COMMIT;

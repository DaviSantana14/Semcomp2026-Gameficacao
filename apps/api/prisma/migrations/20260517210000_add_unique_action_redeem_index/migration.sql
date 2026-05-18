CREATE UNIQUE INDEX "PointEvent_unique_action_redeem_per_user"
ON "PointEvent"("userId", "actionId")
WHERE "source" = 'ACTION_REDEEM' AND "actionId" IS NOT NULL;

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { participantQueryKeys } from "./participant-query-keys";

export type AdjustmentInput = {
  pointsDelta: string;
  xpDelta: string;
  reason: string;
};

export function validateAdjustment(
  input: AdjustmentInput,
  balance: { points: number; xp: number },
) {
  const errors: Record<string, string> = {};
  const pointsDelta = Number(input.pointsDelta);
  const xpDelta = Number(input.xpDelta);
  const reason = input.reason.trim();
  if (!Number.isInteger(pointsDelta))
    errors.pointsDelta = "Informe um número inteiro.";
  if (!Number.isInteger(xpDelta)) errors.xpDelta = "Informe um número inteiro.";
  if (!errors.pointsDelta && !errors.xpDelta) {
    if (pointsDelta === 0 && xpDelta === 0)
      errors.deltas = "Informe ao menos um delta diferente de zero.";
    else if (pointsDelta * xpDelta < 0)
      errors.deltas = "Pontos e XP devem seguir a mesma direção.";
  }
  if (reason.length < 10 || reason.length > 500)
    errors.reason = "O motivo deve ter entre 10 e 500 caracteres.";
  const predicted = {
    points: balance.points + (Number.isInteger(pointsDelta) ? pointsDelta : 0),
    xp: balance.xp + (Number.isInteger(xpDelta) ? xpDelta : 0),
  };
  if (predicted.points < 0 || predicted.xp < 0)
    errors.balance = "O saldo previsto não pode ficar negativo.";
  const values = { pointsDelta, xpDelta, reason };
  return Object.keys(errors).length === 0
    ? ({ valid: true, values, predicted, errors } as const)
    : ({ valid: false, values, predicted, errors } as const);
}

export function createIdempotencyLifecycle(uuid = () => crypto.randomUUID()) {
  let key: string | undefined;
  let fingerprint: string | undefined;
  let renew = false;
  return {
    keyFor(nextFingerprint: string) {
      if (!key || renew || fingerprint !== nextFingerprint) key = uuid();
      fingerprint = nextFingerprint;
      renew = false;
      return key;
    },
    failed(conflict: boolean) {
      if (conflict) renew = true;
    },
    succeeded() {
      renew = true;
    },
  };
}

export async function invalidateParticipantOperationQueries(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  participantId: string,
  xpChanged: boolean,
) {
  const queries: Array<{ queryKey: QueryKey; exact: boolean }> = [
    { queryKey: participantQueryKeys.detail(participantId), exact: true },
    { queryKey: participantQueryKeys.pointEvents(participantId), exact: false },
    { queryKey: participantQueryKeys.auditEvents(participantId), exact: false },
    {
      queryKey: participantQueryKeys.reconciliation(participantId),
      exact: true,
    },
    { queryKey: ["admin", "dashboard"] as const, exact: true },
    ...(xpChanged ? [{ queryKey: ["ranking"] as const, exact: false }] : []),
  ];
  await Promise.all(
    queries.map((query) => queryClient.invalidateQueries(query)),
  );
}

import { apiFetch } from "@/lib/http/client";
import type {
  AdjustmentPayload,
  OperationPayload,
  OperationResult,
  ParticipantReconciliation,
} from "./reconciliation.types";

export function fetchParticipantReconciliation(id: string) {
  return apiFetch<ParticipantReconciliation>(
    `/admin/participants/${id}/reconciliation`,
  );
}

export function createParticipantAdjustment(
  id: string,
  payload: AdjustmentPayload,
) {
  return apiFetch<OperationResult>(`/admin/participants/${id}/adjustments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function reverseParticipantPointEvent(
  id: string,
  payload: OperationPayload,
) {
  return apiFetch<OperationResult>(`/admin/point-events/${id}/reverse`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmParticipantReconciliation(
  id: string,
  payload: OperationPayload,
) {
  return apiFetch<OperationResult>(
    `/admin/participants/${id}/reconciliation/confirm`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

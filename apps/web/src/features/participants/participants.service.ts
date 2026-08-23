import { apiFetch } from "@/lib/http/client";
import type { PaginatedResponse } from "@/lib/http/pagination.types";
import { withQuery } from "@/lib/http/query-string";
import type {
  AdminParticipant,
  AdminParticipantDetail,
  AdminParticipantPointEvent,
  AdminParticipantRewardRedemption,
  AdminParticipantsFilters,
  AdminPointEventsFilters,
  AdminRewardRedemptionsFilters,
  ParticipantPasswordResetPayload,
  ParticipantPasswordResetResult,
} from "./participants.types";

export function fetchAdminParticipants(filters: AdminParticipantsFilters) {
  return apiFetch<PaginatedResponse<AdminParticipant>>(
    withQuery("/admin/participants", filters),
  );
}

export function fetchAdminParticipant(id: string) {
  return apiFetch<AdminParticipantDetail>(`/admin/participants/${id}`);
}

export function fetchAdminParticipantPointEvents(
  id: string,
  filters: AdminPointEventsFilters,
) {
  return apiFetch<PaginatedResponse<AdminParticipantPointEvent>>(
    withQuery(`/admin/participants/${id}/point-events`, filters),
  );
}

export function fetchAdminParticipantRewardRedemptions(
  id: string,
  filters: AdminRewardRedemptionsFilters,
) {
  return apiFetch<PaginatedResponse<AdminParticipantRewardRedemption>>(
    withQuery(`/admin/participants/${id}/reward-redemptions`, {
      ...filters,
      status: filters.status === "all" ? undefined : filters.status,
    }),
  );
}

export function updateParticipantStatus(
  id: string,
  payload: { isActive: boolean; reason: string },
) {
  return apiFetch<AdminParticipantDetail>(`/admin/participants/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function resetParticipantPassword(
  id: string,
  payload: ParticipantPasswordResetPayload,
) {
  return apiFetch<ParticipantPasswordResetResult>(
    `/admin/participants/${id}/password-reset`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

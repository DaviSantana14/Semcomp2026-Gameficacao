import { apiFetch } from "@/lib/http/client";
import type { PaginatedResponse } from "@/lib/http/pagination.types";
import { withQuery } from "@/lib/http/query-string";
import type {
  AdminRedemption,
  AdminRedemptionsFilters,
  AdminReward,
  AdminRewardsFilters,
  CreateRewardPayload,
  Reward,
  RewardRedemption,
  RedemptionTransitionPayload,
  UpdateRewardPayload,
} from "./rewards.types";

export const fetchRewards = () => apiFetch<Reward[]>("/rewards");
export const fetchReward = (id: string) => apiFetch<Reward>(`/rewards/${id}`);

export function createReward(payload: CreateRewardPayload) {
  return apiFetch<Reward>("/rewards", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateReward(id: string, payload: UpdateRewardPayload) {
  return apiFetch<Reward>(`/rewards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export const redeemReward = (id: string) =>
  apiFetch<RewardRedemption>(`/rewards/${id}/redeem`, { method: "POST" });
export const fetchPendingRedemptions = () =>
  apiFetch<RewardRedemption[]>("/admin/redemptions/pending");
export const deliverRedemption = (
  id: string,
  payload: RedemptionTransitionPayload,
) =>
  apiFetch<RewardRedemption>(`/admin/redemptions/${id}/deliver`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
export const cancelRedemption = (
  id: string,
  payload: RedemptionTransitionPayload,
) =>
  apiFetch<RewardRedemption>(`/admin/redemptions/${id}/cancel`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export function fetchAdminRewards(
  filters: AdminRewardsFilters,
  signal?: AbortSignal,
) {
  return apiFetch<PaginatedResponse<AdminReward>>(
    withQuery("/admin/rewards", filters),
    { signal },
  );
}

export function fetchAdminRedemptions(filters: AdminRedemptionsFilters) {
  return apiFetch<PaginatedResponse<AdminRedemption>>(
    withQuery("/admin/redemptions", {
      page: filters.page,
      limit: filters.limit,
      status: filters.status,
      search: filters.search,
      rewardId: filters.rewardId,
      from: filters.from,
      to: filters.to,
    }),
  );
}

import { AdminReward, PaginatedResponse } from "@/lib/api";

const paginationError = "Invalid reward options pagination response";

export type RewardOptionsPagination = {
  limit: number;
  total: number;
  totalPages: number;
};

export function validateRewardOptionsPage(
  response: PaginatedResponse<AdminReward>,
  expectedPage: number,
  expected?: RewardOptionsPagination,
): RewardOptionsPagination {
  const { items, meta } = response;
  const pagination = expected ?? {
    limit: meta.limit,
    total: meta.total,
    totalPages: meta.totalPages,
  };
  const expectedItems = Math.min(
    pagination.limit,
    Math.max(0, pagination.total - (expectedPage - 1) * pagination.limit),
  );

  if (
    !Array.isArray(items) ||
    !Number.isSafeInteger(meta.page) ||
    !Number.isSafeInteger(meta.limit) ||
    !Number.isSafeInteger(meta.total) ||
    !Number.isSafeInteger(meta.totalPages) ||
    meta.page !== expectedPage ||
    meta.limit !== 100 ||
    meta.limit !== pagination.limit ||
    meta.total !== pagination.total ||
    meta.totalPages !== pagination.totalPages ||
    meta.limit < 1 ||
    meta.total < 0 ||
    meta.totalPages < 0 ||
    meta.totalPages !== Math.ceil(meta.total / meta.limit) ||
    items.length !== expectedItems ||
    items.some((item) => !item || typeof item.id !== "string" || !item.id)
  ) {
    throw new Error(paginationError);
  }

  return pagination;
}

export function finalizeRewardOptions(
  items: AdminReward[],
  expected: RewardOptionsPagination,
) {
  if (
    items.length !== expected.total ||
    new Set(items.map((item) => item.id)).size !== items.length
  ) {
    throw new Error(paginationError);
  }

  return items;
}

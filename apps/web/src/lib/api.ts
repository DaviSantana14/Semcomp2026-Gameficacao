const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type UserRole = "ADMIN" | "PARTICIPANT";
export type ActionType =
  | "CHECKIN"
  | "ATTENDANCE"
  | "STAND_VISIT"
  | "EASTER_EGG"
  | "QUESTION"
  | "DYNAMIC"
  | "BONUS";

export type User = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: UserRole;
  points: number;
  xp: number;
  level: number;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type LoginPayload = {
  cpf: string;
  email: string;
};

export type RegisterPayload = LoginPayload & {
  name: string;
};

export type LoginResponse = {
  user: User;
  csrfToken: string;
};

export type CsrfTokenResponse = {
  csrfToken: string;
};

export type Action = {
  id: string;
  name: string;
  description: string | null;
  type: ActionType;
  code: string | null;
  points: number;
  isActive: boolean;
  createdAt: string;
};

export type CreateActionPayload = {
  name: string;
  description?: string;
  type: ActionType;
  code?: string;
  points: number;
  isActive?: boolean;
};

export type GenerateClaimCodesPayload = {
  quantity: number;
};

export type GeneratedClaimCodesResponse = {
  action: Pick<Action, "id" | "name">;
  quantity: number;
  codes: string[];
};

export type RedeemActionResponse = {
  message: string;
  action: Action;
  awardedPoints: number;
  currentPoints: number;
  currentXp: number;
  currentLevel: number;
  redeemedAt: string;
};

export type RankingEntry = {
  position: number;
  name: string;
  xp: number;
};

export type RankingPeriod = "all" | "daily";

export type RankingResponse = {
  ranking: RankingEntry[];
  me: RankingEntry | null;
};

export type RedemptionStatus = "PENDING" | "DELIVERED" | "CANCELLED";

export type Reward = {
  id: string;
  name: string;
  description: string | null;
  costInPoints: number;
  stock: number;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RewardRedemption = {
  id: string;
  userId: string;
  rewardId: string;
  pointsSpent: number;
  status: RedemptionStatus;
  user: {
    id: string;
    name: string;
    email: string;
  };
  reward: Reward;
  createdAt: string;
  updatedAt: string;
};

export type CreateRewardPayload = {
  name: string;
  description?: string;
  costInPoints: number;
  stock: number;
  isActive?: boolean;
  imageUrl?: string;
};

export type UpdateRewardPayload = Partial<CreateRewardPayload>;

export type PaginatedResponse<T> = {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type AdminDashboard = {
  participants: { total: number; active: number };
  pointsAwarded: number;
  claimCodes: { used: number; available: number };
  recentPendingRedemptions: Array<{
    id: string;
    pointsSpent: number;
    status: RedemptionStatus;
    createdAt: string;
    user: { id: string; name: string };
    reward: { id: string; name: string };
  }>;
};

export type AdminParticipant = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  points: number;
  xp: number;
  level: number;
  isActive: boolean;
  pointEventsCount: number;
  rewardRedemptionsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminParticipantDetail = AdminParticipant & {
  lastLoginAt?: string | null;
};

export type AdminParticipantPointEvent = {
  id: string;
  points: number;
  xpDelta: number;
  kind: "CREDIT" | "DEBIT";
  source:
    | "ACTION_REDEEM"
    | "ADMIN_GRANT"
    | "ADMIN_ADJUST"
    | "REWARD_REDEMPTION";
  redemptionMethod:
    | "DIRECT"
    | "REUSABLE_CODE"
    | "CLAIM_CODE"
    | "LEGACY_UNKNOWN"
    | null;
  description: string | null;
  origin: string;
  createdAt: string;
};

export type AdminParticipantRewardRedemption = {
  id: string;
  pointsSpent: number;
  status: RedemptionStatus;
  reward: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type AdminParticipantsFilters = {
  page: number;
  limit: number;
  search?: string;
  status?: "active" | "inactive";
};

export type AdminPointEventsFilters = {
  page: number;
  limit: number;
  source?: AdminParticipantPointEvent["source"];
  kind?: AdminParticipantPointEvent["kind"];
};

export type AdminRewardRedemptionsFilters = {
  page: number;
  limit: number;
  status?: RedemptionStatus;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let csrfToken: string | null = null;

export function getCsrfToken() {
  return csrfToken;
}

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

async function getErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[] };

    if (Array.isArray(data.message)) {
      return data.message.join(" ");
    }

    if (data.message) {
      return data.message;
    }
  } catch {
    return response.statusText;
  }

  return response.statusText;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipCsrf?: boolean } = {},
) {
  const method = options.method?.toUpperCase() ?? "GET";
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (
    !options.skipCsrf &&
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    csrfToken
  ) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_URL}${normalizePath(path)}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new ApiError(await getErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(payload: LoginPayload) {
  const response = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });

  setCsrfToken(response.csrfToken);

  return response;
}

export async function register(payload: RegisterPayload) {
  return apiFetch<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });
}

export async function fetchMe() {
  return apiFetch<User>("/users/me");
}

export async function fetchCsrfToken() {
  const response = await apiFetch<CsrfTokenResponse>("/auth/csrf");
  setCsrfToken(response.csrfToken);
  return response;
}

export async function logout() {
  await apiFetch<void>("/auth/logout", {
    method: "POST",
    skipCsrf: true,
  });

  setCsrfToken(null);
}

export async function redeemActionCode(code: string) {
  return apiFetch<RedeemActionResponse>("/actions/redeem-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function createAction(payload: CreateActionPayload) {
  return apiFetch<Action>("/actions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchActions(): Promise<Action[]> {
  return apiFetch<Action[]>("/actions");
}

export async function generateClaimCodes(
  actionId: string,
  payload: GenerateClaimCodesPayload,
): Promise<GeneratedClaimCodesResponse> {
  return apiFetch<GeneratedClaimCodesResponse>(
    `/admin/actions/${actionId}/claim-codes/generate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchRewards() {
  return apiFetch<Reward[]>("/rewards");
}

export async function fetchReward(id: string) {
  return apiFetch<Reward>(`/rewards/${id}`);
}

export async function createReward(payload: CreateRewardPayload) {
  return apiFetch<Reward>("/rewards", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateReward(id: string, payload: UpdateRewardPayload) {
  return apiFetch<Reward>(`/rewards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function redeemReward(id: string) {
  return apiFetch<RewardRedemption>(`/rewards/${id}/redeem`, {
    method: "POST",
  });
}

export async function fetchPendingRedemptions() {
  return apiFetch<RewardRedemption[]>("/admin/redemptions/pending");
}

export async function deliverRedemption(id: string) {
  return apiFetch<RewardRedemption>(`/admin/redemptions/${id}/deliver`, {
    method: "PATCH",
  });
}

export async function cancelRedemption(id: string) {
  return apiFetch<RewardRedemption>(`/admin/redemptions/${id}/cancel`, {
    method: "PATCH",
  });
}

export async function fetchRanking(limit = 10, period: RankingPeriod = "all") {
  const params = new URLSearchParams({
    limit: String(limit),
    period,
  });

  return apiFetch<RankingResponse>(`/ranking?${params.toString()}`);
}

function withQuery(
  path: string,
  values: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function fetchAdminDashboard() {
  return apiFetch<AdminDashboard>("/admin/dashboard");
}

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
    withQuery(`/admin/participants/${id}/reward-redemptions`, filters),
  );
}

export function updateParticipantStatus(
  id: string,
  payload: { isActive: boolean },
) {
  return apiFetch<AdminParticipantDetail>(`/admin/participants/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

import { apiFetch } from "@/lib/http/client";
import type { RankingPeriod, RankingResponse } from "./ranking.types";

export function fetchRanking(limit = 10, period: RankingPeriod = "all") {
  const params = new URLSearchParams({ limit: String(limit), period });
  return apiFetch<RankingResponse>(`/ranking?${params.toString()}`);
}

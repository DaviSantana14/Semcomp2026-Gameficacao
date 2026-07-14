export type RankingEntry = { position: number; name: string; xp: number };
export type RankingPeriod = "all" | "daily";
export type RankingResponse = {
  ranking: RankingEntry[];
  me: RankingEntry | null;
};

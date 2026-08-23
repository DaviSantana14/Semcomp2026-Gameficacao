import type { AdminParticipantsFilters } from "@/features/participants/participants.types";
import type { AdminRedemptionsFilters } from "@/features/rewards/rewards.types";

export type AdminExportCount = {
  count: number;
  maxRows: number;
};

export type ParticipantExportFilters = Pick<
  AdminParticipantsFilters,
  "search" | "status"
>;

export type RedemptionExportFilters = Omit<
  AdminRedemptionsFilters,
  "page" | "limit"
>;

export type AdminExportFilter = {
  label: string;
  value: string;
};

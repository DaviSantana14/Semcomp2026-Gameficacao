export type PresenceDateRange = {
  from: string;
  to: string;
};

export type PresenceDay = {
  operationalDate: string;
  peakOnlineParticipants: number;
  peakAt: string | null;
  registeredParticipantsAtPeak: number;
  uniqueParticipantLogins: number;
  newParticipantRegistrations: number;
};

export type PresencePeak = {
  operationalDate: string | null;
  onlineParticipants: number;
  observedAt: string | null;
  registeredParticipantsAtPeak: number;
};

export type PresenceOverview = {
  status: "LIVE" | "DEGRADED";
  timezone: "America/Sao_Paulo";
  heartbeatIntervalSeconds: 60;
  onlineWindowSeconds: 120;
  lastCollectedAt: string | null;
  onlineNow: number;
  registeredParticipants: number;
  uniqueParticipantsEverLogged: number;
  monitoredDays: number;
  today: PresenceDay;
  overallPeak: PresencePeak;
};

export type PresenceHistoryItem = {
  operationalDate: string;
  onlineAtLastCollection: number;
  lastCollectedAt: string;
  peakOnlineParticipants: number;
  peakAt: string | null;
  registeredParticipantsAtPeak: number;
  uniqueParticipantLogins: number;
  newParticipantRegistrations: number;
};

export type PresenceHistory = {
  period: PresenceDateRange;
  timezone: "America/Sao_Paulo";
  items: PresenceHistoryItem[];
};

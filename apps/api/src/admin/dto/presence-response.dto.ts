export class PresenceTodayResponseDto {
  operationalDate!: string;
  peakOnlineParticipants!: number;
  peakAt!: string | null;
  registeredParticipantsAtPeak!: number;
  uniqueParticipantLogins!: number;
  newParticipantRegistrations!: number;
}

export class PresencePeakResponseDto {
  operationalDate!: string | null;
  onlineParticipants!: number;
  observedAt!: string | null;
  registeredParticipantsAtPeak!: number;
}

export class PresenceOverviewResponseDto {
  status!: 'LIVE' | 'DEGRADED';
  timezone!: 'America/Sao_Paulo';
  heartbeatIntervalSeconds!: 60;
  onlineWindowSeconds!: 120;
  lastCollectedAt!: string | null;
  onlineNow!: number;
  registeredParticipants!: number;
  uniqueParticipantsEverLogged!: number;
  monitoredDays!: number;
  today!: PresenceTodayResponseDto;
  overallPeak!: PresencePeakResponseDto;
}

export class PresenceHistoryPeriodResponseDto {
  from!: string;
  to!: string;
}

export class PresenceDailyHistoryItemResponseDto {
  operationalDate!: string;
  onlineAtLastCollection!: number;
  lastCollectedAt!: string;
  peakOnlineParticipants!: number;
  peakAt!: string | null;
  registeredParticipantsAtPeak!: number;
  uniqueParticipantLogins!: number;
  newParticipantRegistrations!: number;
}

export class PresenceHistoryResponseDto {
  period!: PresenceHistoryPeriodResponseDto;
  timezone!: 'America/Sao_Paulo';
  items!: PresenceDailyHistoryItemResponseDto[];
}

export {
  PresenceOverviewResponseDto as PresenceOverviewDto,
  PresenceTodayResponseDto as PresenceDayResponseDto,
  PresencePeakResponseDto as PresencePeakDto,
  PresenceDailyHistoryItemResponseDto as PresenceHistoryItemResponseDto,
  PresenceHistoryResponseDto as PresenceHistoryDto,
};

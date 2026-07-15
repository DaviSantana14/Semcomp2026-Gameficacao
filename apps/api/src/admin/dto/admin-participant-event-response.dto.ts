import {
  ActionRedemptionMethod,
  PointEventKind,
  PointEventSource,
} from '@prisma/client';
export class AdminParticipantEventResponseDto {
  id!: string;
  points!: number;
  xpDelta!: number;
  kind!: PointEventKind;
  source!: PointEventSource;
  redemptionMethod!: ActionRedemptionMethod | null;
  description!: string | null;
  origin!:
    | 'UNIQUE_CODE'
    | 'REUSABLE_CODE'
    | 'DIRECT_ACTION'
    | 'LEGACY_UNKNOWN'
    | 'REWARD'
    | 'ADMIN'
    | 'RECONCILIATION_COMPENSATION';
  isAudited!: boolean;
  claimCode!: { id: string; code: string } | null;
  reversalOfPointEventId!: string | null;
  reversalPointEventId!: string | null;
  createdAt!: string;
}

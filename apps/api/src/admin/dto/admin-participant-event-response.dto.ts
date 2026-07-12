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
  origin!: string;
  createdAt!: string;
}

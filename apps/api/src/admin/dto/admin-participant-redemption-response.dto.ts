import { RedemptionStatus } from '@prisma/client';
export class AdminParticipantRedemptionResponseDto {
  id!: string;
  pointsSpent!: number;
  status!: RedemptionStatus;
  reward!: { id: string; name: string };
  createdAt!: string;
  updatedAt!: string;
}

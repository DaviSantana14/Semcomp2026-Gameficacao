export class AdminParticipantResponseDto {
  id!: string;
  name!: string;
  cpf!: string;
  email!: string;
  points!: number;
  xp!: number;
  level!: number;
  isActive!: boolean;
  passwordResetRequired!: boolean;
  passwordResetExpiresAt!: string | null;
  pointEventsCount!: number;
  rewardRedemptionsCount!: number;
  createdAt!: string;
  updatedAt!: string;
}

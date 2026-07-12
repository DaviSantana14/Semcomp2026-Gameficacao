export class AdminDashboardResponseDto {
  participants!: { total: number; active: number };
  pointsAwarded!: number;
  claimCodes!: { used: number; available: number };
  recentRedemptions!: unknown[];
}

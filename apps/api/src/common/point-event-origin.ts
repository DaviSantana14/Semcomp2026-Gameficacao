export type PointEventOrigin =
  | 'UNIQUE_CODE'
  | 'REUSABLE_CODE'
  | 'DIRECT_ACTION'
  | 'LEGACY_UNKNOWN'
  | 'REWARD'
  | 'ADMIN'
  | 'RECONCILIATION_COMPENSATION';

export function mapPointEventOrigin(
  source: string,
  redemptionMethod: string | null,
  auditOperation?: string | null,
): PointEventOrigin {
  if (auditOperation === 'RECONCILIATION_ADJUSTMENT_CONFIRMED') {
    return 'RECONCILIATION_COMPENSATION';
  }

  switch (source) {
    case 'ACTION_REDEEM':
      switch (redemptionMethod) {
        case 'CLAIM_CODE':
          return 'UNIQUE_CODE';
        case 'REUSABLE_CODE':
          return 'REUSABLE_CODE';
        case 'DIRECT':
          return 'DIRECT_ACTION';
        default:
          return 'LEGACY_UNKNOWN';
      }
    case 'REWARD_REDEMPTION':
      return 'REWARD';
    case 'ADMIN_GRANT':
    case 'ADMIN_ADJUST':
      return 'ADMIN';
    default:
      return 'LEGACY_UNKNOWN';
  }
}

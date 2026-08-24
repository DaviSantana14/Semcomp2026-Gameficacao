export const ClaimCodeBulkOutcome = {
  CHANGED: 'CHANGED',
  ALREADY_IN_STATE: 'ALREADY_IN_STATE',
  ALREADY_USED: 'ALREADY_USED',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type ClaimCodeBulkOutcome =
  (typeof ClaimCodeBulkOutcome)[keyof typeof ClaimCodeBulkOutcome];

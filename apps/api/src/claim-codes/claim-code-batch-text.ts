export function serializeClaimCodeBatchText(codes: string[]): string {
  return `${[...codes].sort().join('\n')}\n`;
}

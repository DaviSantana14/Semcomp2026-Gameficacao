const SHORT_MASK = /^\*{1,4}$/;
const LONG_MASK = /^[^*]{2}\*+[^*]{2}$/;

export function maskClaimCode(code: string): string {
  if (code.length <= 4) return '*'.repeat(code.length);
  return `${code.slice(0, 2)}${'*'.repeat(code.length - 4)}${code.slice(-2)}`;
}

export function isCanonicalClaimCodeMask(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 100 &&
    (SHORT_MASK.test(value) || LONG_MASK.test(value))
  );
}

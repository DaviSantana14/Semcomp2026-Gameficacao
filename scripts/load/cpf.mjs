const FIRST_BASE = 100_000_001;
const LAST_INDEX = 999_999_999 - FIRST_BASE;

function assertIntegerInRange(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function calculateCheckDigit(digits, length) {
  let sum = 0;

  for (let index = 0; index < length; index += 1) {
    sum += Number(digits[index]) * (length + 1 - index);
  }

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function generateCpf(index) {
  assertIntegerInRange(index, "index", LAST_INDEX);

  const base = String(FIRST_BASE + index);
  const firstCheckDigit = calculateCheckDigit(base, 9);
  const secondCheckDigit = calculateCheckDigit(
    `${base}${firstCheckDigit}`,
    10,
  );

  return `${base}${firstCheckDigit}${secondCheckDigit}`;
}

export function generateCpfs(count) {
  assertIntegerInRange(count, "count", LAST_INDEX + 1);
  return Array.from({ length: count }, (_, index) => generateCpf(index));
}

export function isValidCpf(value) {
  if (typeof value !== "string") return false;

  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

  const firstCheckDigit = calculateCheckDigit(digits, 9);
  const secondCheckDigit = calculateCheckDigit(digits, 10);

  return (
    firstCheckDigit === Number(digits[9]) &&
    secondCheckDigit === Number(digits[10])
  );
}

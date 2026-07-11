import {
  CLAIM_CODE_ALPHABET,
  CLAIM_CODE_REGEX,
  REUSABLE_EVENT_CODE_REGEX,
  generateClaimCode,
  isClaimCode,
  normalizeEventCode,
} from './event-code';

describe('event codes', () => {
  it('normalizes codes by trimming and uppercasing', () => {
    expect(normalizeEventCode(' dia1 ')).toBe('DIA1');
    expect(normalizeEventCode('   ')).toBeUndefined();
    expect(normalizeEventCode(null)).toBeUndefined();
  });

  it('recognizes only the reserved single-use format', () => {
    expect(isClaimCode('ABCD-EFGH')).toBe(true);
    expect(isClaimCode(' abcd-efgh ')).toBe(true);
    expect(isClaimCode('ABCI-EFGH')).toBe(false);
    expect(isClaimCode('DIA1')).toBe(false);
  });

  it('generates claim codes with the exact alphabet and format', () => {
    for (let sample = 0; sample < 100; sample += 1) {
      const code = generateClaimCode();
      expect(code).toMatch(CLAIM_CODE_REGEX);
      expect(
        [...code.replace('-', '')].every((character) =>
          CLAIM_CODE_ALPHABET.includes(character),
        ),
      ).toBe(true);
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('keeps reusable codes separate from the claim-code namespace', () => {
    expect(REUSABLE_EVENT_CODE_REGEX.test('DIA1')).toBe(true);
    expect(REUSABLE_EVENT_CODE_REGEX.test('STAND-DEV')).toBe(true);
    expect(REUSABLE_EVENT_CODE_REGEX.test('ABCD-EFGH')).toBe(false);
  });
});

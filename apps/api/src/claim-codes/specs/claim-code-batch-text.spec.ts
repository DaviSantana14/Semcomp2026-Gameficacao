import { serializeClaimCodeBatchText } from '../claim-code-batch-text';

describe('serializeClaimCodeBatchText', () => {
  it('sorts codes without mutating the input and ends with one LF', () => {
    const codes = ['BBBB-BBBB', 'AAAA-AAAA', 'CCCC-CCCC'];

    expect(serializeClaimCodeBatchText(codes)).toBe(
      'AAAA-AAAA\nBBBB-BBBB\nCCCC-CCCC\n',
    );
    expect(codes).toEqual(['BBBB-BBBB', 'AAAA-AAAA', 'CCCC-CCCC']);
  });

  it('keeps the trailing LF for an empty batch', () => {
    expect(serializeClaimCodeBatchText([])).toBe('\n');
  });
});

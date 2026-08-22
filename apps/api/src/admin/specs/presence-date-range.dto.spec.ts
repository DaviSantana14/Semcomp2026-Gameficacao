import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  parsePresenceRange,
  PresenceDateRangeDto,
} from '../dto/presence-date-range.dto';

describe('PresenceDateRangeDto', () => {
  const now = new Date('2026-08-22T12:00:00.000Z');

  it('parses an inclusive/exclusive operational date range as UTC dates', () => {
    expect(
      parsePresenceRange({ from: '2026-08-08', to: '2026-08-22' }, now),
    ).toEqual({
      from: new Date('2026-08-08T00:00:00.000Z'),
      to: new Date('2026-08-22T00:00:00.000Z'),
    });
  });

  it('accepts exactly the retained 24-month boundary', () => {
    expect(() =>
      parsePresenceRange({ from: '2024-08-22', to: '2026-08-22' }, now),
    ).not.toThrow();
  });

  it.each([
    [{ from: '2026-02-29', to: '2026-03-01' }, 'invalid calendar date'],
    [{ from: '2026-08-22', to: '2026-08-22' }, 'empty range'],
    [{ from: '2026-08-23', to: '2026-08-22' }, 'reversed range'],
    [{ from: '2024-08-21', to: '2026-08-22' }, 'before retention'],
    [{ from: '2024-08-22', to: '2026-08-23' }, 'over 24 months'],
  ])('rejects %s', (range) => {
    expect(() => parsePresenceRange(range, now)).toThrow(BadRequestException);
  });

  it('requires both date-only query parameters', async () => {
    const dto = plainToInstance(PresenceDateRangeDto, {
      from: '2026-08-01',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'to' })]),
    );
  });
});

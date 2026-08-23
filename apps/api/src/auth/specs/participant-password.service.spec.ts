import { hash } from 'bcrypt';
import * as passwordHash from '../password-hash';
import { ParticipantPasswordService } from '../participant-password.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const bcryptHashMock = jest.mocked(hash);
const validPassword = 'senha livre';
const validHash =
  '$2b$12$abcdefghijklmnopqrstuuCqkY1vWPxA8uHhfNfTQyqPvKmyTPYs.';

describe(ParticipantPasswordService.name, () => {
  let service: ParticipantPasswordService;

  beforeEach(() => {
    service = new ParticipantPasswordService();
    jest.resetAllMocks();
  });

  it('hashes valid participant passwords through the shared pure function', async () => {
    const hashSpy = jest
      .spyOn(passwordHash, 'hashPassword')
      .mockResolvedValue(validHash);

    await expect(service.hash(validPassword)).resolves.toBe(validHash);
    expect(hashSpy).toHaveBeenCalledTimes(1);
    expect(hashSpy).toHaveBeenCalledWith(validPassword);
    expect(bcryptHashMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-policy password before hashing', async () => {
    const hashSpy = jest
      .spyOn(passwordHash, 'hashPassword')
      .mockResolvedValue(validHash);

    await expect(service.hash('curta')).rejects.toThrow();
    await expect(service.hash('a'.repeat(65))).rejects.toThrow();
    await expect(service.hash('😀'.repeat(25))).rejects.toThrow();
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['missing identity', null],
    [
      'administrator role',
      { role: 'ADMIN', isActive: true, passwordHash: validHash },
    ],
    [
      'inactive participant',
      { role: 'PARTICIPANT', isActive: false, passwordHash: validHash },
    ],
    [
      'participant without a stored hash',
      { role: 'PARTICIPANT', isActive: true, passwordHash: null },
    ],
  ])('performs a dummy comparison and rejects %s', async (_, user) => {
    const compareSpy = jest
      .spyOn(passwordHash, 'comparePassword')
      .mockResolvedValue(false);

    await expect(service.verify(validPassword, user as never)).resolves.toBe(
      false,
    );
    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(compareSpy).not.toHaveBeenCalledWith(validPassword, validHash);
  });

  it.each(['short', 'a'.repeat(65), '😀'.repeat(25)])(
    'compares exactly once with a substituted dummy candidate for invalid policy %p',
    async (candidate) => {
      const compareSpy = jest
        .spyOn(passwordHash, 'comparePassword')
        .mockResolvedValue(false);

      await expect(
        service.verify(candidate, {
          role: 'PARTICIPANT',
          isActive: true,
          passwordHash: validHash,
        }),
      ).resolves.toBe(false);
      expect(compareSpy).toHaveBeenCalledTimes(1);
      expect(compareSpy).not.toHaveBeenCalledWith(candidate, validHash);
    },
  );

  it('accepts an active participant whose password matches', async () => {
    const compareSpy = jest
      .spyOn(passwordHash, 'comparePassword')
      .mockResolvedValue(true);

    await expect(
      service.verify(validPassword, {
        role: 'PARTICIPANT',
        isActive: true,
        passwordHash: validHash,
      }),
    ).resolves.toBe(true);
    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(compareSpy).toHaveBeenCalledWith(validPassword, validHash);
  });

  it('rejects an incorrect password for an active participant', async () => {
    const compareSpy = jest
      .spyOn(passwordHash, 'comparePassword')
      .mockResolvedValue(false);

    await expect(
      service.verify(validPassword, {
        role: 'PARTICIPANT',
        isActive: true,
        passwordHash: validHash,
      }),
    ).resolves.toBe(false);
    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(compareSpy).toHaveBeenCalledWith(validPassword, validHash);
  });

  it('rejects a temporary password after its reset expiry', async () => {
    const compareSpy = jest
      .spyOn(passwordHash, 'comparePassword')
      .mockResolvedValue(true);

    await expect(
      service.verify(validPassword, {
        role: 'PARTICIPANT',
        isActive: true,
        passwordHash: validHash,
        passwordResetRequired: true,
        passwordResetExpiresAt: new Date('2026-08-23T11:59:59.000Z'),
      }),
    ).resolves.toBe(false);
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it('compares a definitive password against the temporary hash after policy validation', async () => {
    const compareSpy = jest
      .spyOn(passwordHash, 'comparePassword')
      .mockResolvedValue(true);

    await expect(service.matchesHash(validPassword, validHash)).resolves.toBe(
      true,
    );
    expect(compareSpy).toHaveBeenCalledWith(validPassword, validHash);
  });
});

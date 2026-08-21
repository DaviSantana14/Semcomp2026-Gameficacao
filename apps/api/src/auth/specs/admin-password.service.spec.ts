import { UserRole } from '@prisma/client';
import { compare, hash } from 'bcrypt';
import { AdminPasswordService } from '../admin-password.service';
import { DUMMY_PASSWORD, DUMMY_PASSWORD_HASH } from '../password-hash';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const compareMock = jest.mocked(compare);
const hashMock = jest.mocked(hash);
const validPassword = 'correct-password';
const validHash =
  '$2b$12$abcdefghijklmnopqrstuuCqkY1vWPxA8uHhfNfTQyqPvKmyTPYs.';

describe(AdminPasswordService.name, () => {
  let service: AdminPasswordService;

  beforeEach(() => {
    service = new AdminPasswordService();
    jest.resetAllMocks();
  });

  it('hashes valid administrator passwords asynchronously with cost 12', async () => {
    hashMock.mockResolvedValue(validHash);

    await expect(service.hash(validPassword)).resolves.toBe(validHash);
    expect(hashMock).toHaveBeenCalledWith(validPassword, 12);
  });

  it('performs a single dummy comparison for an over-72-byte password', async () => {
    const invalidCandidate = `${'a'.repeat(55)}${'é'.repeat(9)}`;

    await expect(service.verify(invalidCandidate, null)).resolves.toBe(false);
    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(compareMock).toHaveBeenCalledWith(
      DUMMY_PASSWORD,
      DUMMY_PASSWORD_HASH,
    );
    expect(compareMock).not.toHaveBeenCalledWith(
      invalidCandidate,
      expect.anything(),
    );
  });

  it('accepts an active administrator with the matching password', async () => {
    compareMock.mockResolvedValue(true);

    await expect(
      service.verify(validPassword, {
        role: UserRole.ADMIN,
        isActive: true,
        passwordHash: validHash,
      }),
    ).resolves.toBe(true);
    expect(compareMock).toHaveBeenCalledWith(validPassword, validHash);
  });

  it.each([
    ['missing identity', null],
    [
      'participant role',
      { role: UserRole.PARTICIPANT, isActive: true, passwordHash: validHash },
    ],
    [
      'inactive administrator',
      { role: UserRole.ADMIN, isActive: false, passwordHash: validHash },
    ],
    [
      'administrator without hash',
      { role: UserRole.ADMIN, isActive: true, passwordHash: null },
    ],
  ])('performs a dummy comparison and rejects %s', async (_, user) => {
    compareMock.mockResolvedValue(false);

    await expect(service.verify(validPassword, user)).resolves.toBe(false);
    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(compareMock).not.toHaveBeenCalledWith(validPassword, validHash);
  });

  it('rejects an incorrect password with the stored hash comparison', async () => {
    compareMock.mockResolvedValue(false);

    await expect(
      service.verify(validPassword, {
        role: UserRole.ADMIN,
        isActive: true,
        passwordHash: validHash,
      }),
    ).resolves.toBe(false);
    expect(compareMock).toHaveBeenCalledWith(validPassword, validHash);
  });
});

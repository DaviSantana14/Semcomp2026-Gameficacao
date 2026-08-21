import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../jwt.strategy';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const userSummary = {
  id: 'user-1',
  name: 'Ada Lovelace',
  cpf: '52998224725',
  email: 'ada@example.com',
  role: 'PARTICIPANT',
  points: 0,
  xp: 0,
  level: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
};

describe(JwtStrategy.name, () => {
  let strategy: JwtStrategy;
  const sessionsService = { validate: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    strategy = new JwtStrategy(sessionsService as never);
  });

  it.each([
    ['missing subject', { csrfToken: 'csrf', jti: 'session-1' }],
    ['missing csrf token', { sub: 'user-1', jti: 'session-1' }],
    ['missing jti', { sub: 'user-1', csrfToken: 'csrf' }],
    ['empty subject', { sub: '', csrfToken: 'csrf', jti: 'session-1' }],
    ['empty csrf token', { sub: 'user-1', csrfToken: '', jti: 'session-1' }],
    ['empty jti', { sub: 'user-1', csrfToken: 'csrf', jti: '' }],
  ])('rejects a payload with a %s', async (_, payload) => {
    await expect(strategy.validate(payload as never)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(sessionsService.validate).not.toHaveBeenCalled();
  });

  it('validates the persisted session whose id is the JWT jti', async () => {
    const identity = { ...userSummary, jti: 'session-1' };
    sessionsService.validate.mockResolvedValue(identity);

    await expect(
      strategy.validate({ sub: 'user-1', csrfToken: 'csrf', jti: 'session-1' }),
    ).resolves.toEqual({ ...identity, csrfToken: 'csrf' });
    expect(sessionsService.validate).toHaveBeenCalledWith(
      'session-1',
      'user-1',
    );
  });

  it('rejects an identity whose persisted session no longer validates', async () => {
    sessionsService.validate.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'user-1',
        csrfToken: 'csrf',
        jti: 'ended-session',
      }),
    ).rejects.toEqual(
      new UnauthorizedException(
        'Usuário autenticado não encontrado ou inativo.',
      ),
    );
  });
});

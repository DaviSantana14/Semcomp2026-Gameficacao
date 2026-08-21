import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../../common/persistence-errors';
import {
  SessionStartRejectedError,
  SessionsService,
} from '../../presence/sessions.service';
import { UsersService } from '../../users/users.service';
import { AdminPasswordService } from '../admin-password.service';
import { ParticipantPasswordValidationError } from '../participant-password-policy';
import { ParticipantPasswordService } from '../participant-password.service';
import { AuthService } from '../auth.service';

describe(AuthService.name, () => {
  type Deps = {
    usersService: Record<string, jest.Mock>;
    jwtService: { signAsync: jest.Mock };
    adminPasswordService: { verify: jest.Mock; hash: jest.Mock };
    participantPasswordService: { verify: jest.Mock; hash: jest.Mock };
    sessionsService: {
      registerParticipant: jest.Mock;
      start: jest.Mock;
      end: jest.Mock;
      heartbeat: jest.Mock;
    };
  };

  const createService = async (
    overrides?: Partial<{ [K in keyof Deps]: Partial<Deps[K]> }>,
  ): Promise<{ service: AuthService; deps: Deps }> => {
    const deps: Deps = {
      usersService: {
        findByEmailForAuthentication: jest.fn(),
        findByCredentialsWithPasswordHash: jest.fn(),
        ...(overrides?.usersService ?? {}),
      },
      jwtService: {
        signAsync: jest.fn().mockResolvedValue('jwt-token'),
        ...(overrides?.jwtService ?? {}),
      },
      adminPasswordService: {
        verify: jest.fn(),
        hash: jest.fn(),
        ...(overrides?.adminPasswordService ?? {}),
      },
      participantPasswordService: {
        verify: jest.fn(),
        hash: jest.fn(),
        ...(overrides?.participantPasswordService ?? {}),
      },
      sessionsService: {
        registerParticipant: jest.fn(),
        start: jest.fn(),
        end: jest.fn(),
        heartbeat: jest.fn(),
        ...(overrides?.sessionsService ?? {}),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: deps.usersService },
        { provide: JwtService, useValue: deps.jwtService },
        { provide: AdminPasswordService, useValue: deps.adminPasswordService },
        {
          provide: ParticipantPasswordService,
          useValue: deps.participantPasswordService,
        },
        { provide: SessionsService, useValue: deps.sessionsService },
      ],
    }).compile();

    return { service: module.get<AuthService>(AuthService), deps };
  };

  it.each([
    ['missing identity', null],
    [
      'participant role',
      {
        id: 'participant-1',
        role: UserRole.PARTICIPANT,
        isActive: true,
        passwordHash: '$2b$12$hash',
      },
    ],
    [
      'inactive administrator',
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        isActive: false,
        passwordHash: '$2b$12$hash',
      },
    ],
    [
      'administrator without a password hash',
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        isActive: true,
        passwordHash: null,
      },
    ],
  ])(
    'returns the same public error for %s in administrator login',
    async (_, user) => {
      const { service, deps } = await createService({
        usersService: {
          findByCredentialsWithPasswordHash: jest.fn().mockResolvedValue(user),
        },
        adminPasswordService: { verify: jest.fn().mockResolvedValue(false) },
      });

      await expect(
        service.adminLogin({
          cpf: '52998224725',
          email: 'admin@example.com',
          password: 'correct-password',
        }),
      ).rejects.toEqual(
        new UnauthorizedException('CPF, email ou senha inválidos.'),
      );
      expect(deps.adminPasswordService.verify).toHaveBeenCalledWith(
        'correct-password',
        user,
      );
      expect(deps.sessionsService.start).not.toHaveBeenCalled();
    },
  );

  it('issues a persisted session for an administrator only after password verification', async () => {
    const admin = {
      id: 'admin-1',
      name: 'Admin',
      cpf: '52998224725',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      points: 0,
      xp: 0,
      level: 1,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-07-30T12:00:00.000Z'),
      passwordHash: '$2b$12$hash',
    };
    const { service, deps } = await createService({
      usersService: {
        findByCredentialsWithPasswordHash: jest.fn().mockResolvedValue(admin),
      },
      adminPasswordService: { verify: jest.fn().mockResolvedValue(true) },
      sessionsService: {
        start: jest.fn().mockResolvedValue({
          ...admin,
          passwordHash: undefined,
        }),
      },
    });

    const result = await service.adminLogin({
      cpf: admin.cpf,
      email: admin.email,
      password: 'correct-password',
    });

    expect(result.user.role).toBe(UserRole.ADMIN);
    expect(deps.sessionsService.start).toHaveBeenCalledTimes(1);
    const [startedUserId, startedRole, startedDraft] = deps.sessionsService
      .start.mock.calls[0] as [
      string,
      string,
      { id: unknown; expiresAt: Date },
    ];

    expect(startedUserId).toBe(admin.id);
    expect(startedRole).toBe('ADMIN');
    expect(typeof startedDraft.id).toBe('string');
    expect(startedDraft.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(deps.jwtService.signAsync).toHaveBeenCalledTimes(1);
    const [payload, signOptions] = deps.jwtService.signAsync.mock.calls[0] as [
      { sub: string; csrfToken: string; jti: string },
      object,
    ];

    expect(payload.sub).toBe(admin.id);
    expect(payload.csrfToken).toBe(result.csrfToken);
    expect(typeof payload.jti).toBe('string');
    expect(signOptions).toEqual({ expiresIn: '8h' });
  });

  it('authenticates participants by email only and never queries by CPF', async () => {
    const participant = {
      id: 'participant-1',
      role: UserRole.PARTICIPANT,
      isActive: true,
      passwordHash: '$2b$12$hash',
    };
    const { service, deps } = await createService({
      usersService: {
        findByEmailForAuthentication: jest.fn().mockResolvedValue(participant),
      },
      participantPasswordService: {
        verify: jest.fn().mockResolvedValue(true),
      },
      sessionsService: {
        start: jest.fn().mockResolvedValue(participant),
      },
    });

    await service.login({ email: 'ada@example.com', password: 'senha-livre' });

    expect(
      deps.usersService.findByEmailForAuthentication,
    ).toHaveBeenCalledTimes(1);
    expect(deps.usersService.findByEmailForAuthentication).toHaveBeenCalledWith(
      'ada@example.com',
    );
    expect(JSON.stringify(deps.usersService)).not.toContain(
      'findActiveByCredentials',
    );
    expect(deps.sessionsService.start).toHaveBeenCalledWith(
      participant.id,
      'PARTICIPANT',
      expect.anything(),
    );
  });

  it('rejects any invalid participant login state with one public message', async () => {
    const { service, deps } = await createService({
      usersService: {
        findByEmailForAuthentication: jest.fn().mockResolvedValue(null),
      },
      participantPasswordService: {
        verify: jest.fn().mockResolvedValue(false),
      },
    });

    await expect(
      service.login({ email: 'ghost@example.com', password: 'wrong-pass' }),
    ).rejects.toEqual(new UnauthorizedException('Email ou senha inválidos.'));
    expect(deps.participantPasswordService.verify).toHaveBeenCalledWith(
      'wrong-pass',
      null,
    );
    expect(deps.sessionsService.start).not.toHaveBeenCalled();
  });

  it('rejects a session start that loses the deactivation race', async () => {
    const { service } = await createService({
      usersService: {
        findByEmailForAuthentication: jest.fn().mockResolvedValue({
          id: 'participant-1',
          role: UserRole.PARTICIPANT,
          isActive: true,
          passwordHash: '$2b$12$hash',
        }),
      },
      participantPasswordService: {
        verify: jest.fn().mockResolvedValue(true),
      },
      sessionsService: {
        start: jest.fn().mockRejectedValue(new SessionStartRejectedError()),
      },
    });

    await expect(
      service.login({ email: 'ada@example.com', password: 'senha-livre' }),
    ).rejects.toEqual(new UnauthorizedException('Email ou senha inválidos.'));
  });

  it('registers the participant with a hashed password and a persisted session draft', async () => {
    let capturedDraft: unknown;
    const user = {
      id: 'participant-1',
      name: 'Ada Lovelace',
      cpf: '52998224725',
      email: 'ada@example.com',
      role: UserRole.PARTICIPANT,
      points: 0,
      xp: 0,
      level: 1,
      isActive: true,
      lastLoginAt: new Date(),
      createdAt: new Date(),
    };
    const { service, deps } = await createService({
      participantPasswordService: {
        hash: jest.fn().mockResolvedValue('$2b$12$hashed'),
      },
      sessionsService: {
        registerParticipant: jest.fn().mockImplementation((draft) => {
          capturedDraft = draft;
          return Promise.resolve(user);
        }),
      },
    });

    const result = await service.register({
      name: 'Ada Lovelace',
      cpf: '52998224725',
      email: 'ada@example.com',
      password: 'senha livre',
    });

    expect(deps.participantPasswordService.hash).toHaveBeenCalledWith(
      'senha livre',
    );
    const draft = capturedDraft as {
      id: string;
      startedAt: Date;
      lastSeenAt: Date;
      expiresAt: Date;
    };
    expect(typeof draft.id).toBe('string');
    expect(draft.startedAt).toBeInstanceOf(Date);
    expect(draft.lastSeenAt).toBeInstanceOf(Date);
    expect(draft.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(deps.sessionsService.registerParticipant).toHaveBeenCalledWith(
      capturedDraft,
      {
        name: 'Ada Lovelace',
        cpf: '52998224725',
        email: 'ada@example.com',
        passwordHash: '$2b$12$hashed',
      },
    );
    expect(deps.jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: user.id,
        csrfToken: result.csrfToken,
        jti: draft.id,
      },
      { expiresIn: '8h' },
    );
    expect(result.user.email).toBe('ada@example.com');
  });

  it('maps an out-of-policy registration password to a bad request', async () => {
    const { service, deps } = await createService({
      participantPasswordService: {
        hash: jest
          .fn()
          .mockRejectedValue(new ParticipantPasswordValidationError()),
      },
    });

    await expect(
      service.register({
        name: 'Ada',
        cpf: '52998224725',
        email: 'ada@example.com',
        password: 'short',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(deps.sessionsService.registerParticipant).not.toHaveBeenCalled();
  });

  it('maps a neutral repository uniqueness failure to the generic conflict', async () => {
    const { service } = await createService({
      participantPasswordService: {
        hash: jest.fn().mockResolvedValue('$2b$12$hashed'),
      },
      sessionsService: {
        registerParticipant: jest
          .fn()
          .mockRejectedValue(new PersistenceUniqueConstraintError()),
      },
    });

    await expect(
      service.register({
        name: 'Ada',
        cpf: '52998224725',
        email: 'ada@example.com',
        password: 'senha livre',
      }),
    ).rejects.toEqual(
      new ConflictException('Já existe um usuário com este CPF ou email.'),
    );
  });
});

import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { SESSION_JWT_TTL, type SessionRole } from '../common/session-duration';
import { AdminPasswordService } from './admin-password.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  hasValidParticipantPasswordReset,
  ParticipantPasswordService,
} from './participant-password.service';
import { ParticipantPasswordValidationError } from './participant-password-policy';
import { ChangeRequiredPasswordDto } from './dto/change-required-password.dto';
import {
  createSessionDraft,
  SessionStartRejectedError,
  SessionsService,
} from '../presence/sessions.service';
import type {
  SessionDraft,
  SessionUserIdentity,
} from '../presence/sessions.repository';
import { UsersService } from '../users/users.service';
import { toUserResponseDto } from '../users/dto/user-response.dto';

const PARTICIPANT_INVALID_LOGIN_MESSAGE = 'Email ou senha inválidos.';
const ADMIN_INVALID_LOGIN_MESSAGE = 'CPF, email ou senha inválidos.';
const INVALID_PARTICIPANT_PASSWORD_MESSAGE =
  'A senha deve ter entre 8 e 64 caracteres e no máximo 72 bytes.';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly adminPasswordService: AdminPasswordService,
    private readonly participantPasswordService: ParticipantPasswordService,
    private readonly sessionsService: SessionsService,
  ) {}

  async register(registerDto: RegisterDto) {
    let passwordHash: string;

    try {
      passwordHash = await this.participantPasswordService.hash(
        registerDto.password,
      );
    } catch (error) {
      if (error instanceof ParticipantPasswordValidationError) {
        throw new BadRequestException(INVALID_PARTICIPANT_PASSWORD_MESSAGE);
      }
      throw error;
    }

    const draft = createSessionDraft(new Date(), 'PARTICIPANT');

    try {
      const user = await this.sessionsService.registerParticipant(draft, {
        name: registerDto.name,
        cpf: registerDto.cpf,
        email: registerDto.email,
        passwordHash,
      });

      return this.issueTokens(user, draft);
    } catch (error) {
      if (error instanceof PersistenceUniqueConstraintError) {
        throw new ConflictException(
          'Já existe um usuário com este CPF ou email.',
        );
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const candidate = await this.usersService.findByEmailForAuthentication(
      loginDto.email,
    );
    const passwordMatches = await this.participantPasswordService.verify(
      loginDto.password,
      candidate ?? null,
    );

    if (
      !candidate ||
      !passwordMatches ||
      !hasValidParticipantPasswordReset(candidate)
    ) {
      throw new UnauthorizedException(PARTICIPANT_INVALID_LOGIN_MESSAGE);
    }

    return this.startAuthenticatedSession(candidate.id, 'PARTICIPANT');
  }

  async adminLogin(loginDto: AdminLoginDto) {
    const user = await this.usersService.findByCredentialsWithPasswordHash(
      loginDto.cpf,
      loginDto.email,
    );
    const passwordMatches = await this.adminPasswordService.verify(
      loginDto.password,
      user,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(ADMIN_INVALID_LOGIN_MESSAGE);
    }

    return this.startAuthenticatedSession(user.id, 'ADMIN');
  }

  heartbeat(sessionId: string, userId: string) {
    return this.sessionsService.heartbeat(sessionId, userId);
  }

  logout(sessionId: string, userId: string) {
    return this.sessionsService.end(sessionId, userId);
  }

  async changeRequiredPassword(
    participantId: string,
    sessionId: string,
    dto: ChangeRequiredPasswordDto,
  ) {
    const checkedAt = new Date();
    const pending =
      await this.sessionsService.findParticipantPasswordReset(participantId);

    if (!pending || pending.passwordResetRequired !== true) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PASSWORD_CHANGE_NOT_REQUIRED',
        message: 'Não há troca obrigatória de senha pendente.',
      });
    }

    if (
      pending.passwordHash === null ||
      !hasValidParticipantPasswordReset(pending, checkedAt)
    ) {
      await this.sessionsService.end(
        sessionId,
        participantId,
        checkedAt,
        'REVOKED',
      );
      throw participantPasswordResetInvalidException();
    }

    let matchesTemporaryPassword: boolean;
    try {
      matchesTemporaryPassword =
        await this.participantPasswordService.matchesHash(
          dto.newPassword,
          pending.passwordHash,
        );
    } catch (error) {
      if (error instanceof ParticipantPasswordValidationError) {
        throw invalidParticipantPasswordException();
      }
      throw error;
    }

    if (matchesTemporaryPassword) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PASSWORD_MUST_CHANGE',
        message: 'Escolha uma senha diferente da temporária.',
      });
    }

    let newPasswordHash: string;
    try {
      newPasswordHash = await this.participantPasswordService.hash(
        dto.newPassword,
      );
    } catch (error) {
      if (error instanceof ParticipantPasswordValidationError) {
        throw invalidParticipantPasswordException();
      }
      throw error;
    }

    const result = await this.sessionsService.completeParticipantPasswordChange(
      {
        participantId,
        expectedPasswordHash: pending.passwordHash,
        newPasswordHash,
        changedAt: new Date(),
      },
    );
    if (result.status === 'invalid') {
      await this.sessionsService.end(
        sessionId,
        participantId,
        new Date(),
        'REVOKED',
      );
      throw participantPasswordResetInvalidException();
    }

    return result;
  }

  private async startAuthenticatedSession(userId: string, role: SessionRole) {
    const draft = createSessionDraft(new Date(), role);

    try {
      const user = await this.sessionsService.start(userId, role, draft);

      return this.issueTokens(user, draft);
    } catch (error) {
      if (error instanceof SessionStartRejectedError) {
        throw new UnauthorizedException(
          role === 'ADMIN'
            ? ADMIN_INVALID_LOGIN_MESSAGE
            : PARTICIPANT_INVALID_LOGIN_MESSAGE,
        );
      }
      throw error;
    }
  }

  private async issueTokens(user: SessionUserIdentity, draft: SessionDraft) {
    const csrfToken = randomBytes(32).toString('base64url');

    return {
      accessToken: await this.jwtService.signAsync(
        { sub: user.id, csrfToken, jti: draft.id },
        { expiresIn: SESSION_JWT_TTL[user.role] },
      ),
      csrfToken,
      user: toUserResponseDto(user),
    };
  }
}

function invalidParticipantPasswordException() {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_PARTICIPANT_PASSWORD',
    message: 'A senha deve ter entre 8 e 64 caracteres e no máximo 72 bytes.',
  });
}

function participantPasswordResetInvalidException() {
  return new UnauthorizedException({
    statusCode: 401,
    code: 'PASSWORD_RESET_INVALID',
    message: 'A senha temporária expirou ou foi substituída.',
  });
}

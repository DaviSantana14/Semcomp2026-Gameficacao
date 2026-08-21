import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { AdminPasswordService } from './admin-password.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ParticipantPasswordService } from './participant-password.service';
import { ParticipantPasswordValidationError } from './participant-password-policy';
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

    const draft = createSessionDraft(new Date());

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

    if (!candidate || !passwordMatches) {
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

  private async startAuthenticatedSession(
    userId: string,
    role: 'PARTICIPANT' | 'ADMIN',
  ) {
    const draft = createSessionDraft(new Date());

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
        { expiresIn: '8h' },
      ),
      csrfToken,
      user: toUserResponseDto(user),
    };
  }
}

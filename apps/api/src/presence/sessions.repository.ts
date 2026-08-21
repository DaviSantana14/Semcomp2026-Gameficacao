import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { PrismaService } from '../prisma/prisma.service';

export type SessionDraft = {
  id: string;
  startedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export type RegisterParticipantInput = {
  name: string;
  cpf: string;
  email: string;
  passwordHash: string;
};

export type SessionUserIdentity = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: 'PARTICIPANT' | 'ADMIN';
  points: number;
  xp: number;
  level: number;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export type ValidatedSessionIdentity = SessionUserIdentity & {
  jti: string;
};

const userSummarySelect = {
  id: true,
  name: true,
  cpf: true,
  email: true,
  role: true,
  points: true,
  xp: true,
  level: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async registerParticipant(
    draft: SessionDraft,
    input: RegisterParticipantInput,
  ) {
    try {
      return await this.prisma.user.create({
        data: {
          name: input.name,
          cpf: input.cpf,
          email: input.email,
          passwordHash: input.passwordHash,
          lastLoginAt: draft.startedAt,
          sessions: {
            create: {
              id: draft.id,
              startedAt: draft.startedAt,
              lastSeenAt: draft.lastSeenAt,
              expiresAt: draft.expiresAt,
            },
          },
        },
        select: userSummarySelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new PersistenceUniqueConstraintError({ cause: error });
      }
      throw error;
    }
  }

  async startSession(
    userId: string,
    role: 'PARTICIPANT' | 'ADMIN',
    draft: SessionDraft,
  ): Promise<SessionUserIdentity | null> {
    return this.prisma.$transaction(async (tx) => {
      const confirmed = await tx.user.updateMany({
        where: { id: userId, role, isActive: true },
        data: { lastLoginAt: draft.startedAt },
      });

      if (confirmed.count === 0) {
        return null;
      }

      await tx.userSession.create({
        data: {
          id: draft.id,
          userId,
          startedAt: draft.startedAt,
          lastSeenAt: draft.lastSeenAt,
          expiresAt: draft.expiresAt,
        },
      });

      return tx.user.findUnique({
        where: { id: userId },
        select: userSummarySelect,
      });
    });
  }

  findValidSessionWithUser(
    sessionId: string,
    userId: string,
    now: Date,
  ): Promise<ValidatedSessionIdentity | null> {
    return this.prisma.userSession
      .findFirst({
        where: {
          id: sessionId,
          userId,
          endedAt: null,
          expiresAt: { gt: now },
          user: { is: { isActive: true } },
        },
        select: { user: { select: userSummarySelect } },
      })
      .then((session) =>
        session ? { ...session.user, jti: sessionId } : null,
      );
  }

  async heartbeatSession(sessionId: string, userId: string, now: Date) {
    const result = await this.prisma.userSession.updateMany({
      where: {
        id: sessionId,
        userId,
        endedAt: null,
        expiresAt: { gt: now },
      },
      data: { lastSeenAt: now },
    });

    return result.count > 0;
  }

  async endSession(
    sessionId: string,
    userId: string,
    now: Date,
    reason: 'LOGOUT' | 'REVOKED',
  ) {
    const result = await this.prisma.userSession.updateMany({
      where: {
        id: sessionId,
        userId,
        endedAt: null,
        expiresAt: { gt: now },
      },
      data: { endedAt: now, endReason: reason },
    });

    return result.count > 0;
  }

  async expireSessions(now: Date) {
    await this.prisma.$executeRaw`
      UPDATE "UserSession"
      SET "endedAt" = "expiresAt", "endReason" = 'EXPIRED'::"SessionEndReason"
      WHERE "endedAt" IS NULL AND "expiresAt" <= ${now}
    `;
  }

  deleteSessionsEndedBefore(cutoff: Date) {
    return this.prisma.userSession.deleteMany({
      where: {
        OR: [
          { endedAt: { not: null, lt: cutoff } },
          { endedAt: null, expiresAt: { lt: cutoff } },
        ],
      },
    });
  }
}

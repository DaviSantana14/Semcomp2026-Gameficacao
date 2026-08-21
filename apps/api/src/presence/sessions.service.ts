import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  RegisterParticipantInput,
  SessionDraft,
  SessionUserIdentity,
  SessionsRepository,
  ValidatedSessionIdentity,
} from './sessions.repository';

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
export const SESSION_RETENTION_DAYS = 30;

export class SessionStartRejectedError extends Error {
  constructor() {
    super('Session start was rejected for the current user state.');
    this.name = SessionStartRejectedError.name;
  }
}

export function createSessionDraft(now: Date): SessionDraft {
  return {
    id: randomUUID(),
    startedAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
  };
}

@Injectable()
export class SessionsService {
  constructor(private readonly repository: SessionsRepository) {}

  registerParticipant(draft: SessionDraft, input: RegisterParticipantInput) {
    return this.repository.registerParticipant(draft, input);
  }

  async start(
    userId: string,
    role: 'PARTICIPANT' | 'ADMIN',
    draft: SessionDraft,
  ): Promise<SessionUserIdentity> {
    const user = await this.repository.startSession(userId, role, draft);

    if (!user) {
      throw new SessionStartRejectedError();
    }

    return user;
  }

  validate(
    sessionId: string,
    userId: string,
  ): Promise<ValidatedSessionIdentity | null> {
    return this.repository.findValidSessionWithUser(
      sessionId,
      userId,
      new Date(),
    );
  }

  heartbeat(sessionId: string, userId: string, now = new Date()) {
    return this.repository.heartbeatSession(sessionId, userId, now);
  }

  end(
    sessionId: string,
    userId: string,
    now = new Date(),
    reason: 'LOGOUT' | 'REVOKED' = 'LOGOUT',
  ) {
    return this.repository.endSession(sessionId, userId, now, reason);
  }

  expire(now = new Date()) {
    return this.repository.expireSessions(now);
  }

  deleteRetained(now = new Date()) {
    const cutoff = new Date(
      now.getTime() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    return this.repository.deleteSessionsEndedBefore(cutoff);
  }
}

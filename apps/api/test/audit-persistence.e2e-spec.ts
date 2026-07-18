import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
  PointEventKind,
  PointEventSource,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  assertDisposableTestDatabase,
  truncateDisposableTestDatabase,
} from './support/e2e-database-cleanup';

describe('Audit persistence guarantees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    assertDisposableTestDatabase();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateDisposableTestDatabase(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await truncateDisposableTestDatabase(prisma);
    } finally {
      await app.close();
    }
  });

  it('enforces actor constraints in PostgreSQL', async () => {
    const admin = await createUser(UserRole.ADMIN);

    await expect(
      prisma.adminAuditEvent.create({
        data: auditData({
          actorType: AuditActorType.SYSTEM,
          actorAdminId: admin.id,
        }),
      }),
    ).rejects.toThrow();
  });

  it('enforces idempotency and one reversal per original event', async () => {
    const participant = await createUser(UserRole.PARTICIPANT);
    const key = randomUUID();
    const original = await createPointEvent(participant.id, {
      idempotencyKey: key,
    });

    await expect(
      createPointEvent(participant.id, { idempotencyKey: key }),
    ).rejects.toThrow();
    await createPointEvent(participant.id, { reversedEventId: original.id });
    await expect(
      createPointEvent(participant.id, { reversedEventId: original.id }),
    ).rejects.toThrow();
  });

  it('uses RESTRICT for participant relations in historical ledgers', async () => {
    const participant = await createUser(UserRole.PARTICIPANT);
    await createPointEvent(participant.id);

    await expect(
      prisma.user.delete({ where: { id: participant.id } }),
    ).rejects.toThrow();
  });

  it.each([
    ['UPDATE', 'PointEvent'],
    ['DELETE', 'PointEvent'],
    ['UPDATE', 'AdminAuditEvent'],
    ['DELETE', 'AdminAuditEvent'],
  ] as const)('rejects %s on immutable %s', async (operation, table) => {
    const admin = await createUser(UserRole.ADMIN);
    const participant = await createUser(UserRole.PARTICIPANT);
    const audit = await prisma.adminAuditEvent.create({
      data: auditData({
        actorAdminId: admin.id,
        participantId: participant.id,
      }),
    });
    const pointEvent = await createPointEvent(participant.id, {
      auditEventId: audit.id,
      actorAdminId: admin.id,
    });
    const id = table === 'PointEvent' ? pointEvent.id : audit.id;
    const sql =
      operation === 'UPDATE'
        ? `UPDATE "${table}" SET "createdAt" = "createdAt" WHERE "id" = $1`
        : `DELETE FROM "${table}" WHERE "id" = $1`;

    await expect(prisma.$executeRawUnsafe(sql, id)).rejects.toThrow(
      /immutable ledger/i,
    );
  });

  function createUser(role: UserRole) {
    const suffix = randomUUID();
    return prisma.user.create({
      data: {
        name: `Audit ${role} ${suffix}`,
        cpf: suffix.replace(/-/g, '').slice(0, 11),
        email: `${suffix}@example.test`,
        role,
      },
    });
  }

  function createPointEvent(
    userId: string,
    data: {
      auditEventId?: string;
      actorAdminId?: string;
      idempotencyKey?: string;
      reversedEventId?: string;
    } = {},
  ) {
    return prisma.pointEvent.create({
      data: {
        userId,
        points: 1,
        xpDelta: 0,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ADMIN_ADJUST,
        ...data,
      },
    });
  }
});

function auditData(
  overrides: {
    actorType?: AuditActorType;
    actorAdminId?: string;
    participantId?: string;
  } = {},
) {
  return {
    actorType: AuditActorType.ADMIN,
    operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
    entityType: AuditEntityType.POINT_EVENT,
    entityId: randomUUID(),
    reason: 'Representative audit persistence test',
    requestId: randomUUID(),
    ...overrides,
  };
}

import { ConflictException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PointEventKind, PointEventSource, Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ActionsService } from '../src/actions/actions.service';
import { AppModule } from '../src/app.module';
import { generateClaimCode } from '../src/common/event-code';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Claim code transactional guarantees (e2e)', () => {
  const claimCodeCreationAttempts = 10;
  let app: INestApplication;
  let actionsService: ActionsService;
  let prisma: PrismaService;
  let createdUserIds: string[];
  let createdActionIds: string[];
  let createdClaimCodeIds: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    actionsService = moduleFixture.get(ActionsService);
    prisma = moduleFixture.get(PrismaService);
  });

  beforeEach(() => {
    createdUserIds = [];
    createdActionIds = [];
    createdClaimCodeIds = [];
  });

  afterEach(async () => {
    await prisma.pointEvent.deleteMany({
      where: {
        OR: [
          { userId: { in: createdUserIds } },
          { actionId: { in: createdActionIds } },
        ],
      },
    });
    await prisma.claimCode.deleteMany({
      where: { id: { in: createdClaimCodeIds } },
    });
    await prisma.action.deleteMany({
      where: { id: { in: createdActionIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('allows exactly one concurrent redemption and preserves all invariants', async () => {
    const { action, claimCode, users } = await createFixture();

    const results = await Promise.allSettled(
      users.map((user) => actionsService.redeemByCode(claimCode.code, user.id)),
    );
    const successes = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<ActionsService['redeemByCode']>>
      > => result.status === 'fulfilled',
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBeInstanceOf(ConflictException);

    const winnerIndex = results.findIndex(
      (result) => result.status === 'fulfilled',
    );
    const winner = users[winnerIndex];
    const loser = users[1 - winnerIndex];
    const persistedCode = await prisma.claimCode.findUniqueOrThrow({
      where: { id: claimCode.id },
    });
    const events = await prisma.pointEvent.findMany({
      where: { actionId: action.id, source: PointEventSource.ACTION_REDEEM },
    });
    const persistedUsers = await prisma.user.findMany({
      where: { id: { in: users.map(({ id }) => id) } },
    });

    expect(persistedCode).toMatchObject({ isUsed: true, usedById: winner.id });
    expect(persistedCode.usedAt).toBeInstanceOf(Date);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      userId: winner.id,
      actionId: action.id,
      points: action.points,
    });
    expect(persistedUsers.find(({ id }) => id === winner.id)).toMatchObject({
      points: action.points,
      xp: action.points,
    });
    expect(persistedUsers.find(({ id }) => id === loser.id)).toMatchObject({
      points: 0,
      xp: 0,
    });
  });

  it('rolls claim code consumption back when the action was already redeemed', async () => {
    const { action, claimCode, users } = await createFixture();
    const user = users[0];
    await prisma.pointEvent.create({
      data: {
        userId: user.id,
        actionId: action.id,
        points: action.points,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: 'LEGACY_UNKNOWN',
      },
    });

    await expect(
      actionsService.redeemByCode(claimCode.code, user.id),
    ).rejects.toBeInstanceOf(ConflictException);

    const persistedCode = await prisma.claimCode.findUniqueOrThrow({
      where: { id: claimCode.id },
    });
    const persistedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    const events = await prisma.pointEvent.count({
      where: { userId: user.id, actionId: action.id },
    });

    expect(persistedCode).toMatchObject({
      isUsed: false,
      usedById: null,
      usedAt: null,
    });
    expect(persistedUser).toMatchObject({ points: 0, xp: 0 });
    expect(events).toBe(1);
  });

  async function createFixture() {
    const suffix = randomUUID();
    const users: User[] = [];

    for (const number of [1, 2]) {
      const user = await prisma.user.create({
        data: {
          name: `Concurrency user ${number}`,
          cpf: `task4-cpf-${number}-${suffix}`,
          email: `task4-${number}-${suffix}@example.test`,
        },
      });
      createdUserIds.push(user.id);
      users.push(user);
    }

    const action = await prisma.action.create({
      data: {
        name: `Concurrency action ${suffix}`,
        type: 'DYNAMIC',
        points: 37,
        isActive: true,
      },
    });
    createdActionIds.push(action.id);

    const claimCode = await createUniqueClaimCode(action.id);
    createdClaimCodeIds.push(claimCode.id);

    return { action, claimCode, users };
  }

  async function createUniqueClaimCode(actionId: string) {
    for (let attempt = 0; attempt < claimCodeCreationAttempts; attempt += 1) {
      try {
        return await prisma.claimCode.create({
          data: { code: generateClaimCode(), actionId },
        });
      } catch (error) {
        const isCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';

        if (!isCodeCollision) {
          throw error;
        }
      }
    }

    throw new Error(
      `Could not create a unique claim code after ${claimCodeCreationAttempts} attempts.`,
    );
  }
});

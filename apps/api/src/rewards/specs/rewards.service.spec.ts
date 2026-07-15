/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RewardsRepository } from '../rewards.repository';
import { RewardsService } from '../rewards.service';
import { AuditService } from '../../audit/audit.service';

describe(RewardsService.name, () => {
  let service: RewardsService;
  let repository: jest.Mocked<RewardsRepository>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const repositoryMock = {
      withTransaction: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: RewardsRepository, useValue: repositoryMock },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(RewardsService);
    repository = module.get(RewardsRepository);
    audit = module.get(AuditService);
  });

  it('decides insufficient balance from a conditional debit count', async () => {
    const transactional = {
      findRewardById: jest.fn().mockResolvedValue({
        id: 'reward-1',
        name: 'Camiseta',
        isActive: true,
        stock: 1,
        costInPoints: 50,
      }),
      debitUserPoints: jest.fn().mockResolvedValue({ count: 0 }),
    } as unknown as RewardsRepository;
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional),
    );
    await expect(service.redeem('reward-1', 'user-1')).rejects.toEqual(
      new BadRequestException(
        'Você não tem points suficientes para resgatar esta recompensa.',
      ),
    );
  });

  it('decides concurrent status loss from the conditional transition count', async () => {
    const transactional = {
      findRedemptionById: jest.fn().mockResolvedValue({ status: 'PENDING' }),
      transitionRedemption: jest.fn().mockResolvedValue({ count: 0 }),
    } as unknown as RewardsRepository;
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional),
    );
    await expect(
      service.deliverRedemption(
        'redemption-1',
        { reason: 'Entrega confirmada pela coordenação' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toEqual(
      new ConflictException('Apenas resgates pendentes podem mudar de status.'),
    );
  });

  it('does not write or audit an effective no-op update', async () => {
    const current = {
      id: 'reward-1',
      name: 'Camiseta',
      description: null,
      costInPoints: 50,
      stock: 2,
      isActive: true,
      imageUrl: null,
    };
    const transactional = {
      findRewardById: jest.fn().mockResolvedValue(current),
      updateReward: jest.fn(),
      auditWriter: {},
    } as unknown as RewardsRepository;
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional, {} as never),
    );

    await expect(
      service.update(
        'reward-1',
        { reason: 'Conferencia sem alteracao administrativa', stock: 2 },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).resolves.toBe(current);
    expect(transactional.updateReward).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('audits a created reward with only allowlisted snapshot fields', async () => {
    const created = {
      id: 'reward-1',
      name: 'Camiseta',
      description: null,
      costInPoints: 50,
      stock: 2,
      isActive: true,
      imageUrl: 'https://example.test/private-storage-key',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const transactional = {
      createReward: jest.fn().mockResolvedValue(created),
      auditWriter: { create: jest.fn() },
    } as unknown as RewardsRepository;
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional, {} as never),
    );

    await service.create(
      {
        reason: 'Inclusao aprovada pela coordenação administrativa',
        name: 'Camiseta',
        costInPoints: 50,
        stock: 2,
      },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(audit.record).toHaveBeenCalledWith(
      transactional.auditWriter,
      expect.objectContaining({
        reason: 'Inclusao aprovada pela coordenação administrativa',
        after: {
          id: 'reward-1',
          name: 'Camiseta',
          description: null,
          costInPoints: 50,
          stock: 2,
          isActive: true,
        },
      }),
    );
    expect(audit.record.mock.calls[0]?.[1].after).not.toHaveProperty(
      'imageUrl',
    );
  });
});

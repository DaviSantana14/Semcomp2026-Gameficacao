import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RewardsRepository } from '../rewards.repository';
import { RewardsService } from '../rewards.service';

describe(RewardsService.name, () => {
  let service: RewardsService;
  let repository: jest.Mocked<RewardsRepository>;

  beforeEach(async () => {
    const repositoryMock = {
      withTransaction: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: RewardsRepository, useValue: repositoryMock },
      ],
    }).compile();
    service = module.get(RewardsService);
    repository = module.get(RewardsRepository);
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
    await expect(service.deliverRedemption('redemption-1')).rejects.toEqual(
      new BadRequestException(
        'Apenas resgates pendentes podem mudar de status.',
      ),
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RankingRepository } from '../ranking.repository';
import { RankingService } from '../ranking.service';

describe(RankingService.name, () => {
  let service: RankingService;
  let repository: jest.Mocked<RankingRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RankingService,
        {
          provide: RankingRepository,
          useValue: {
            findTopGeneralRanking: jest.fn(),
            findEligibleUser: jest.fn(),
            countUsersAhead: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(RankingService);
    repository = module.get(RankingRepository);
  });

  it('validates the public period before querying persistence', async () => {
    await expect(
      service.getRanking('user-1', { period: 'weekly' }),
    ).rejects.toEqual(new BadRequestException('period deve ser daily ou all.'));
    expect(repository.findTopGeneralRanking.mock.calls).toHaveLength(0);
  });

  it('calculates the current user position outside the repository', async () => {
    const currentUser = {
      id: 'user-1',
      name: 'Ada',
      xp: 50,
      createdAt: new Date('2026-01-01'),
    };
    repository.findTopGeneralRanking.mockResolvedValue([]);
    repository.findEligibleUser.mockResolvedValue(currentUser);
    repository.countUsersAhead.mockResolvedValue(3);
    await expect(service.getRanking('user-1')).resolves.toEqual({
      ranking: [],
      me: { position: 4, name: 'Ada', xp: 50 },
    });
  });
});

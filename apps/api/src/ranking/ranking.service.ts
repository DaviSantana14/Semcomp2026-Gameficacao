import { Injectable } from '@nestjs/common';
import { RankingRepository } from './ranking.repository';

@Injectable()
export class RankingService {
  constructor(private readonly repository: RankingRepository) {}

  getRanking(...args: Parameters<RankingRepository['getRanking']>) {
    return this.repository.getRanking(...args);
  }
  getGeneralRanking(
    ...args: Parameters<RankingRepository['getGeneralRanking']>
  ) {
    return this.repository.getGeneralRanking(...args);
  }
}

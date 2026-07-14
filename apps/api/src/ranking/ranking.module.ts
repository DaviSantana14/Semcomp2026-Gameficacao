import { Module } from '@nestjs/common';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { RankingRepository } from './ranking.repository';

@Module({
  controllers: [RankingController],
  providers: [RankingService, RankingRepository],
})
export class RankingModule {}

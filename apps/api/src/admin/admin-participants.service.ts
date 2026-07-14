import { Injectable } from '@nestjs/common';
import { AdminParticipantsRepository } from './admin-participants.repository';

@Injectable()
export class AdminParticipantsService {
  constructor(private readonly repository: AdminParticipantsRepository) {}

  findAll(...args: Parameters<AdminParticipantsRepository['findAll']>) {
    return this.repository.findAll(...args);
  }
  updateStatus(
    ...args: Parameters<AdminParticipantsRepository['updateStatus']>
  ) {
    return this.repository.updateStatus(...args);
  }
  findOne(...args: Parameters<AdminParticipantsRepository['findOne']>) {
    return this.repository.findOne(...args);
  }
  findPointEvents(
    ...args: Parameters<AdminParticipantsRepository['findPointEvents']>
  ) {
    return this.repository.findPointEvents(...args);
  }
  findRewardRedemptions(
    ...args: Parameters<AdminParticipantsRepository['findRewardRedemptions']>
  ) {
    return this.repository.findRewardRedemptions(...args);
  }
}

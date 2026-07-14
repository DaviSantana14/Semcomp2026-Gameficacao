import { Injectable } from '@nestjs/common';
import { RewardsRepository } from './rewards.repository';

@Injectable()
export class RewardsService {
  constructor(private readonly repository: RewardsRepository) {}

  create(...args: Parameters<RewardsRepository['create']>) {
    return this.repository.create(...args);
  }
  findAll() {
    return this.repository.findAll();
  }
  findAdminRewards(...args: Parameters<RewardsRepository['findAdminRewards']>) {
    return this.repository.findAdminRewards(...args);
  }
  findRedemptions(...args: Parameters<RewardsRepository['findRedemptions']>) {
    return this.repository.findRedemptions(...args);
  }
  findById(...args: Parameters<RewardsRepository['findById']>) {
    return this.repository.findById(...args);
  }
  update(...args: Parameters<RewardsRepository['update']>) {
    return this.repository.update(...args);
  }
  redeem(...args: Parameters<RewardsRepository['redeem']>) {
    return this.repository.redeem(...args);
  }
  findPendingRedemptions() {
    return this.repository.findPendingRedemptions();
  }
  deliverRedemption(
    ...args: Parameters<RewardsRepository['deliverRedemption']>
  ) {
    return this.repository.deliverRedemption(...args);
  }
  cancelRedemption(...args: Parameters<RewardsRepository['cancelRedemption']>) {
    return this.repository.cancelRedemption(...args);
  }
}

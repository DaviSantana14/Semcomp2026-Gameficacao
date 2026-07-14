import { Injectable } from '@nestjs/common';
import { ActionsRepository } from './actions.repository';

@Injectable()
export class ActionsService {
  constructor(private readonly repository: ActionsRepository) {}

  create(...args: Parameters<ActionsRepository['create']>) {
    return this.repository.create(...args);
  }
  findAll() {
    return this.repository.findAll();
  }
  findById(...args: Parameters<ActionsRepository['findById']>) {
    return this.repository.findById(...args);
  }
  update(...args: Parameters<ActionsRepository['update']>) {
    return this.repository.update(...args);
  }
  findAdminActions(...args: Parameters<ActionsRepository['findAdminActions']>) {
    return this.repository.findAdminActions(...args);
  }
  findReusableCodes(
    ...args: Parameters<ActionsRepository['findReusableCodes']>
  ) {
    return this.repository.findReusableCodes(...args);
  }
  findReusableCodeRedemptions(
    ...args: Parameters<ActionsRepository['findReusableCodeRedemptions']>
  ) {
    return this.repository.findReusableCodeRedemptions(...args);
  }
  redeemByCode(...args: Parameters<ActionsRepository['redeemByCode']>) {
    return this.repository.redeemByCode(...args);
  }
  redeem(...args: Parameters<ActionsRepository['redeem']>) {
    return this.repository.redeem(...args);
  }
}

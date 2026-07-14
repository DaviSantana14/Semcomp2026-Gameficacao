import { Injectable } from '@nestjs/common';
import { ClaimCodesRepository } from './claim-codes.repository';

@Injectable()
export class ClaimCodesService {
  constructor(private readonly repository: ClaimCodesRepository) {}

  generateBatch(...args: Parameters<ClaimCodesRepository['generateBatch']>) {
    return this.repository.generateBatch(...args);
  }
  findAll(...args: Parameters<ClaimCodesRepository['findAll']>) {
    return this.repository.findAll(...args);
  }
  updateStatus(...args: Parameters<ClaimCodesRepository['updateStatus']>) {
    return this.repository.updateStatus(...args);
  }
}

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HealthRepository } from './health.repository';

@Injectable()
export class HealthService {
  constructor(private readonly repository: HealthRepository) {}

  async check() {
    try {
      await this.repository.checkDatabase();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
  }
}

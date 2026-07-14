import { Injectable } from '@nestjs/common';
import { AdminDashboardRepository } from './admin-dashboard.repository';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly repository: AdminDashboardRepository) {}

  getOverview() {
    return this.repository.getOverview();
  }
}

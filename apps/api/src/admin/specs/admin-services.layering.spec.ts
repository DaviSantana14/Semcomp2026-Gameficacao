import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminDashboardRepository } from '../admin-dashboard.repository';
import { AdminDashboardService } from '../admin-dashboard.service';
import { AdminParticipantsRepository } from '../admin-participants.repository';
import { AdminParticipantsService } from '../admin-participants.service';
import { AuditService } from '../../audit/audit.service';

describe('admin service layering', () => {
  it('keeps participant absence as a service HTTP decision', async () => {
    const module = await Test.createTestingModule({
      providers: [
        AdminParticipantsService,
        {
          provide: AdminParticipantsRepository,
          useValue: { findParticipantById: jest.fn().mockResolvedValue(null) },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    await expect(
      module.get(AdminParticipantsService).findOne('missing'),
    ).rejects.toEqual(new NotFoundException('Participante não encontrado.'));
  });

  it('serializes dashboard dates in the service', async () => {
    const createdAt = new Date('2026-07-13T12:00:00.000Z');
    const module = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        {
          provide: AdminDashboardRepository,
          useValue: {
            findOverviewData: jest.fn().mockResolvedValue({
              total: 1,
              active: 1,
              inactive: 0,
              points: { _count: { _all: 2 }, _sum: { points: 20 } },
              uniqueTotal: 1,
              used: 0,
              available: 1,
              reusableTotal: 1,
              reusableActive: 1,
              rewardsTotal: 1,
              rewardsActive: 1,
              outOfStock: 0,
              pendingRedemptions: 1,
              recentPendingRedemptions: [{ id: 'r1', createdAt }],
            }),
          },
        },
      ],
    }).compile();
    const result = await module.get(AdminDashboardService).getOverview();
    expect(result.recentPendingRedemptions[0].createdAt).toBe(
      createdAt.toISOString(),
    );
  });
});

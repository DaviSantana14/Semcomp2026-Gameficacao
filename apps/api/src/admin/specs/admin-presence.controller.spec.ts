import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Response } from 'express';
import { ADMIN_PROFILES_KEY } from '../../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../../auth/admin-profiles.guard';
import { CsrfGuard } from '../../auth/csrf.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminPresenceController } from '../admin-presence.controller';

describe(AdminPresenceController.name, () => {
  it('protects every route with authentication, CSRF and profile guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminPresenceController),
    ).toEqual([JwtAuthGuard, CsrfGuard, AdminProfilesGuard]);
    expect(
      Reflect.getMetadata(ADMIN_PROFILES_KEY, AdminPresenceController),
    ).toEqual(['GENERAL']);
  });

  it('delegates a validated history range to the presence service', async () => {
    const presence = {
      getDailyHistory: jest.fn().mockResolvedValue({ items: [] }),
    };
    const controller = new AdminPresenceController(presence as never);
    const query = { from: '2026-08-01', to: '2026-08-22' };

    await controller.history(query);

    expect(presence.getDailyHistory).toHaveBeenCalledWith({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-22T00:00:00.000Z'),
    });
  });

  it('returns an aggregate CSV with a deterministic attachment name', async () => {
    const presence = {
      getExportData: jest.fn().mockResolvedValue({
        general: {
          onlineNow: 0,
          overallPeak: {
            operationalDate: null,
            onlineParticipants: 0,
            observedAt: null,
            registeredParticipantsAtPeak: 0,
          },
          uniqueParticipantsEverLogged: 0,
          registeredParticipants: 0,
          monitoredDays: 0,
          lastCollectedAt: null,
        },
        daily: [],
      }),
    };
    const controller = new AdminPresenceController(presence as never);
    const setHeader = jest.fn();
    const send = jest.fn().mockReturnThis();
    const response = {
      setHeader,
      send,
    } as unknown as Response;

    await controller.exportCsv(
      { from: '2026-08-01', to: '2026-08-22' },
      response,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="presenca-2026-08-01-a-2026-08-22.csv"',
    );
    expect(send).toHaveBeenCalledWith(expect.stringContaining('tipo;periodo;'));
  });
});

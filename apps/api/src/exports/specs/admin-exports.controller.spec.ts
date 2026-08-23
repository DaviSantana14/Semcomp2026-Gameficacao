import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ADMIN_PROFILES_KEY } from '../../auth/admin-profiles.decorator';
import { DownloadCapacityError } from '../../common/download-gate';
import { AdminExportsController } from '../admin-exports.controller';

describe(AdminExportsController.name, () => {
  it('is protected as a general-profile controller', () => {
    expect(
      Reflect.getMetadata(ADMIN_PROFILES_KEY, AdminExportsController),
    ).toEqual(['GENERAL']);
  });

  it('delegates count endpoints with the applied query object', async () => {
    const service = {
      countParticipants: jest
        .fn()
        .mockResolvedValue({ count: 2, maxRows: 50_000 }),
      countRedemptions: jest
        .fn()
        .mockResolvedValue({ count: 1, maxRows: 50_000 }),
      exportParticipants: jest.fn(),
      exportRedemptions: jest.fn(),
    };
    const controller = new AdminExportsController(service as never);
    const participantQuery = { search: 'Ana', status: 'active' };
    const redemptionQuery = { status: 'pending', rewardId: 'reward-1' };

    await expect(
      controller.countParticipants(participantQuery as never),
    ).resolves.toEqual({
      count: 2,
      maxRows: 50_000,
    });
    await expect(
      controller.countRedemptions(redemptionQuery as never),
    ).resolves.toEqual({
      count: 1,
      maxRows: 50_000,
    });
    expect(service.countParticipants).toHaveBeenCalledWith(participantQuery);
    expect(service.countRedemptions).toHaveBeenCalledWith(redemptionQuery);
  });

  it('sets file headers only after participant CSV generation succeeds', async () => {
    const buffer = Buffer.from('\ufeffnome;email\r\n');
    const service = {
      countParticipants: jest.fn(),
      countRedemptions: jest.fn(),
      exportParticipants: jest.fn().mockResolvedValue(buffer),
      exportRedemptions: jest.fn(),
    };
    const controller = new AdminExportsController(service as never);
    const setHeader = jest.fn();
    const send = jest.fn();

    await controller.exportParticipants(
      { status: 'active' } as never,
      { setHeader, send } as never,
    );

    expect(service.exportParticipants).toHaveBeenCalledWith({
      status: 'active',
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="participantes.csv"',
    );
    expect(send).toHaveBeenCalledWith(buffer);
  });

  it('uses the shop filename for redemption CSVs', async () => {
    const buffer = Buffer.from('csv');
    const service = {
      countParticipants: jest.fn(),
      countRedemptions: jest.fn(),
      exportParticipants: jest.fn(),
      exportRedemptions: jest.fn().mockResolvedValue(buffer),
    };
    const controller = new AdminExportsController(service as never);
    const setHeader = jest.fn();
    const send = jest.fn();

    await controller.exportRedemptions(
      { status: 'all' } as never,
      { setHeader, send } as never,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="pedidos-lojinha.csv"',
    );
    expect(send).toHaveBeenCalledWith(buffer);
  });

  it('adds Retry-After before returning a concurrent-export 429', async () => {
    const service = {
      countParticipants: jest.fn(),
      countRedemptions: jest.fn(),
      exportParticipants: jest
        .fn()
        .mockRejectedValue(new DownloadCapacityError()),
      exportRedemptions: jest.fn(),
    };
    const controller = new AdminExportsController(service as never);
    const setHeader = jest.fn();
    const send = jest.fn();

    await expect(
      controller.exportParticipants({} as never, { setHeader, send } as never),
    ).rejects.toBeInstanceOf(DownloadCapacityError);

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '30');
    expect(send).not.toHaveBeenCalled();
  });

  it('declares a CSV-producing endpoint in Swagger', () => {
    const participantHandler = Object.getOwnPropertyDescriptor(
      AdminExportsController.prototype,
      'exportParticipants',
    )?.value as object;
    expect(
      Reflect.getMetadata(DECORATORS.API_PRODUCES, participantHandler),
    ).toEqual(['text/csv']);
  });
});

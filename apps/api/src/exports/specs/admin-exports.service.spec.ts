/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { RedemptionStatus } from '@prisma/client';
import { DownloadGate } from '../../common/download-gate';
import { formatOperationalDateTime } from '../../common/operational-time';
import {
  CsvRowLimitError,
  ExportLimits,
  MAX_EXPORT_ROWS,
} from '../export-limits';
import { AdminExportsService } from '../admin-exports.service';

describe(AdminExportsService.name, () => {
  function createService() {
    const repository = {
      countParticipants: jest.fn(),
      findParticipantExportBlock: jest.fn(),
      countRedemptions: jest.fn(),
      findRedemptionExportBlock: jest.fn(),
    };
    return {
      service: new AdminExportsService(
        repository as never,
        new ExportLimits(new DownloadGate()),
      ),
      repository,
    };
  }

  it('serializes all participant rows with applied filters and no internal fields', async () => {
    const { service, repository } = createService();
    const createdAt = new Date('2026-08-22T12:00:00.000Z');
    repository.countParticipants.mockResolvedValue(2);
    repository.findParticipantExportBlock
      .mockResolvedValueOnce([
        {
          id: 'participant-1',
          name: '=Ana',
          cpf: '111',
          email: 'ana@example.test',
          points: 12,
          xp: 8,
          level: 2,
          isActive: true,
          createdAt,
        },
        {
          id: 'participant-2',
          name: 'Bia',
          cpf: '222',
          email: 'bia@example.test',
          points: 0,
          xp: 3,
          level: 1,
          isActive: false,
          createdAt,
        },
      ])
      .mockResolvedValueOnce([]);

    const buffer = await service.exportParticipants({
      search: ' Ana ',
      status: 'active',
    } as never);

    expect(repository.countParticipants).toHaveBeenCalledWith({
      search: 'Ana',
      isActive: true,
    });
    expect(repository.findParticipantExportBlock).toHaveBeenNthCalledWith(
      1,
      { search: 'Ana', isActive: true },
      undefined,
    );
    expect(repository.findParticipantExportBlock).toHaveBeenNthCalledWith(
      2,
      { search: 'Ana', isActive: true },
      'participant-2',
    );
    expect(buffer.toString('utf8')).toContain(
      `nome;email;cpf;status;pontos;xp;nivel;cadastrado_em\r\n'=Ana;ana@example.test;111;ATIVO;12;8;2;${formatOperationalDateTime(
        createdAt,
      )}`,
    );
    expect(buffer.toString('utf8')).toContain(
      `Bia;bia@example.test;222;INATIVO;0;3;1;${formatOperationalDateTime(
        createdAt,
      )}`,
    );
    expect(buffer.toString('utf8')).not.toMatch(
      /participant-1|passwordHash|session/i,
    );
  });

  it('rejects participant exports over the row limit before loading a block', async () => {
    const { service, repository } = createService();
    repository.countParticipants.mockResolvedValue(MAX_EXPORT_ROWS + 1);

    await expect(
      service.exportParticipants({} as never),
    ).rejects.toBeInstanceOf(CsvRowLimitError);
    expect(repository.findParticipantExportBlock).not.toHaveBeenCalled();
  });

  it('shares redemption filters with the list and formats operational dates and responsible admin', async () => {
    const { service, repository } = createService();
    const createdAt = new Date('2026-08-02T12:00:00.000Z');
    repository.countRedemptions.mockResolvedValue(1);
    repository.findRedemptionExportBlock
      .mockResolvedValueOnce([
        {
          id: 'redemption-1',
          pointsSpent: 50,
          status: RedemptionStatus.DELIVERED,
          createdAt,
          deliveredAt: new Date('2026-08-03T12:00:00.000Z'),
          cancelledAt: null,
          user: { name: 'Ada', email: 'ada@example.test' },
          reward: { name: 'Camiseta' },
          deliveredByAdmin: { name: 'Coordenação' },
          cancelledByAdmin: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const buffer = await service.exportRedemptions({
      status: 'delivered',
      rewardId: 'reward-1',
      search: ' ada ',
      from: '2026-08-01',
      to: '2026-08-04',
    } as never);

    const filter = repository.countRedemptions.mock.calls[0]?.[0] as {
      from: Date;
      to: Date;
    };
    expect(filter).toMatchObject({
      rewardId: 'reward-1',
      search: 'ada',
      status: RedemptionStatus.DELIVERED,
      from: new Date('2026-08-01T03:00:00.000Z'),
      to: new Date('2026-08-04T03:00:00.000Z'),
    });
    expect(buffer.toString('utf8')).toContain(
      `participante;email;recompensa;pontos_gastos;status;solicitado_em;entregue_em;cancelado_em;responsavel\r\nAda;ada@example.test;Camiseta;50;DELIVERED;${formatOperationalDateTime(
        createdAt,
      )};${formatOperationalDateTime(new Date('2026-08-03T12:00:00.000Z'))};;Coordenação`,
    );
  });
});

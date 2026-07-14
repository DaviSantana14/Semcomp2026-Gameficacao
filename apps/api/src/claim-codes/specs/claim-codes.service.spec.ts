import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClaimCodesRepository } from '../claim-codes.repository';
import { ClaimCodesService } from '../claim-codes.service';

describe(ClaimCodesService.name, () => {
  let service: ClaimCodesService;
  let repository: jest.Mocked<ClaimCodesRepository>;

  beforeEach(async () => {
    const repositoryMock = {
      findActionForCodeBatch: jest.fn(),
      updateClaimCodeStatus: jest.fn(),
      findClaimCodeById: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ClaimCodesService,
        { provide: ClaimCodesRepository, useValue: repositoryMock },
      ],
    }).compile();
    service = module.get(ClaimCodesService);
    repository = module.get(ClaimCodesRepository);
  });

  it('rejects generation when the action does not exist', async () => {
    repository.findActionForCodeBatch.mockResolvedValue(null);
    await expect(service.generateBatch('missing', 2)).rejects.toEqual(
      new NotFoundException('Atividade pontuável não encontrada.'),
    );
  });

  it('maps a lost status update to the used-code conflict', async () => {
    repository.updateClaimCodeStatus.mockResolvedValue({ count: 0 });
    repository.findClaimCodeById.mockResolvedValue({
      id: 'code-1',
      code: 'ABCD-EFGH',
      isActive: false,
      isUsed: true,
      createdAt: new Date(),
      usedAt: new Date(),
      usedBy: null,
      action: { id: 'action-1', name: 'Check-in', isActive: true },
    });
    await expect(
      service.updateStatus('code-1', { isActive: true }),
    ).rejects.toEqual(
      new ConflictException('Código de uso único já utilizado.'),
    );
  });
});

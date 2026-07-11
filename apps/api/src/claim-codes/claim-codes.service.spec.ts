import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import * as eventCode from '../common/event-code';
import { ClaimCodesService } from './claim-codes.service';

function createService() {
  const prisma = {
    action: { findUnique: jest.fn() },
    claimCode: { createManyAndReturn: jest.fn() },
  };

  return { service: new ClaimCodesService(prisma as never), prisma };
}

describe('ClaimCodesService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws when the action does not exist', async () => {
    const { service, prisma } = createService();
    prisma.action.findUnique.mockResolvedValue(null);

    await expect(service.generateBatch('missing', 2)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.claimCode.createManyAndReturn).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'generates an ordered batch for an action whose active state is %s',
    async (isActive) => {
      const { service, prisma } = createService();
      prisma.action.findUnique.mockResolvedValue({
        id: 'action-1',
        name: 'Credenciamento',
      });
      jest
        .spyOn(eventCode, 'generateClaimCode')
        .mockReturnValueOnce('CCCC-CCCC')
        .mockReturnValueOnce('AAAA-AAAA')
        .mockReturnValueOnce('BBBB-BBBB');
      prisma.claimCode.createManyAndReturn.mockResolvedValue([
        { code: 'CCCC-CCCC' },
        { code: 'AAAA-AAAA' },
        { code: 'BBBB-BBBB' },
      ]);

      await expect(service.generateBatch('action-1', 3)).resolves.toEqual({
        action: { id: 'action-1', name: 'Credenciamento' },
        quantity: 3,
        codes: ['AAAA-AAAA', 'BBBB-BBBB', 'CCCC-CCCC'],
      });
      expect(prisma.action.findUnique).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        select: { id: true, name: true },
      });
      expect(isActive).toBeDefined();
      expect(prisma.claimCode.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          { actionId: 'action-1', code: 'CCCC-CCCC' },
          { actionId: 'action-1', code: 'AAAA-AAAA' },
          { actionId: 'action-1', code: 'BBBB-BBBB' },
        ],
        skipDuplicates: true,
        select: { code: true },
      });
    },
  );

  it('retries only the remaining quantity after partial collisions', async () => {
    const { service, prisma } = createService();
    prisma.action.findUnique.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
    });
    jest
      .spyOn(eventCode, 'generateClaimCode')
      .mockReturnValueOnce('AAAA-AAAA')
      .mockReturnValueOnce('BBBB-BBBB')
      .mockReturnValueOnce('CCCC-CCCC')
      .mockReturnValueOnce('DDDD-DDDD')
      .mockReturnValueOnce('EEEE-EEEE');
    prisma.claimCode.createManyAndReturn
      .mockResolvedValueOnce([{ code: 'AAAA-AAAA' }])
      .mockResolvedValueOnce([{ code: 'DDDD-DDDD' }, { code: 'EEEE-EEEE' }]);

    const result = await service.generateBatch('action-1', 3);

    expect(result.quantity).toBe(3);
    expect(result.codes).toEqual(['AAAA-AAAA', 'DDDD-DDDD', 'EEEE-EEEE']);
    expect(prisma.claimCode.createManyAndReturn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: [
          { actionId: 'action-1', code: 'DDDD-DDDD' },
          { actionId: 'action-1', code: 'EEEE-EEEE' },
        ],
      }),
    );
  });

  it('fails after five rounds when collisions prevent completion', async () => {
    const { service, prisma } = createService();
    prisma.action.findUnique.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
    });
    jest.spyOn(eventCode, 'generateClaimCode').mockReturnValue('AAAA-AAAA');
    prisma.claimCode.createManyAndReturn.mockResolvedValue([]);

    await expect(service.generateBatch('action-1', 1)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.claimCode.createManyAndReturn).toHaveBeenCalledTimes(5);
  });
});

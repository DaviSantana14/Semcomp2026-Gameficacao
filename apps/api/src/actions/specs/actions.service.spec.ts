import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActionType } from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../../common/persistence-errors';
import { ActionsRepository } from '../actions.repository';
import { ActionsService } from '../actions.service';

describe(ActionsService.name, () => {
  let service: ActionsService;
  let repository: jest.Mocked<ActionsRepository>;

  beforeEach(async () => {
    const repositoryMock = {
      createAction: jest.fn(),
      findActionCodeState: jest.fn(),
      updateAction: jest.fn(),
      withTransaction: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ActionsService,
        { provide: ActionsRepository, useValue: repositoryMock },
      ],
    }).compile();
    service = module.get(ActionsService);
    repository = module.get(ActionsRepository);
  });

  it('normalizes reusable codes before persistence', async () => {
    repository.createAction.mockResolvedValue({ id: 'action-1' } as never);
    await service.create({
      name: 'Check-in',
      type: ActionType.CHECKIN,
      code: ' dia1 ',
      points: 10,
    });
    expect(repository.createAction.mock.calls).toEqual([
      [expect.objectContaining({ code: 'DIA1', isCodeActive: true })],
    ]);
  });

  it('rejects claim-code-shaped reusable codes before persistence', async () => {
    await expect(
      service.create({
        name: 'Check-in',
        type: ActionType.CHECKIN,
        code: 'ABCD-EFGH',
        points: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createAction.mock.calls).toHaveLength(0);
  });

  it('maps neutral uniqueness errors to the existing HTTP conflict', async () => {
    repository.createAction.mockRejectedValue(
      new PersistenceUniqueConstraintError(),
    );
    await expect(
      service.create({
        name: 'Check-in',
        type: ActionType.CHECKIN,
        code: 'DIA1',
        points: 10,
      }),
    ).rejects.toEqual(
      new ConflictException(
        'Já existe uma atividade pontuável com este código.',
      ),
    );
  });
});

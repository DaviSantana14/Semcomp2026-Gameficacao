import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ListAuditEventsDto,
  ListParticipantAuditEventsDto,
} from './list-audit-events.dto';

describe(ListAuditEventsDto.name, () => {
  it('transforms and accepts all documented filters', async () => {
    const dto = plainToInstance(ListAuditEventsDto, {
      page: '2',
      limit: '100',
      actorType: AuditActorType.ADMIN,
      actorAdminId: 'admin-1',
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'action-1',
      participantId: 'participant-1',
      requestId: 'request-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-14T00:00:00.000Z',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(100);
  });

  it.each([
    { limit: '101' },
    { actorType: 'HUMAN' },
    { operation: 'ARBITRARY' },
    { entityType: 'SECRET' },
    { from: 'not-a-date' },
  ])('rejects invalid query %#', async (input) => {
    const errors = await validate(plainToInstance(ListAuditEventsDto, input));
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe(ListParticipantAuditEventsDto.name, () => {
  it('does not expose global actor, entity or request filters', () => {
    const properties = Object.getOwnPropertyNames(
      new ListParticipantAuditEventsDto(),
    );
    expect(properties).not.toEqual(
      expect.arrayContaining([
        'actorType',
        'actorAdminId',
        'entityType',
        'entityId',
        'participantId',
        'requestId',
      ]),
    );
  });
});

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
      actorSearch: '  Ada@Example.COM  ',
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'action-1',
      entitySearch: '  Palestra  ',
      participantId: 'participant-1',
      participantSearch: '  Grace  ',
      requestId: 'request-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-14T00:00:00.000Z',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(100);
    expect(dto.actorSearch).toBe('Ada@Example.COM');
    expect(dto.participantSearch).toBe('Grace');
    expect(dto.entitySearch).toBe('Palestra');
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
        'actorSearch',
        'entityType',
        'entityId',
        'entitySearch',
        'participantId',
        'participantSearch',
        'requestId',
      ]),
    );
  });
});

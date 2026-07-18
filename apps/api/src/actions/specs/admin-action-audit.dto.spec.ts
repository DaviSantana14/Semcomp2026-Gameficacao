import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActionType } from '@prisma/client';
import { ModelPropertiesAccessor } from '@nestjs/swagger/dist/services/model-properties-accessor';
import { SchemaObjectFactory } from '@nestjs/swagger/dist/services/schema-object-factory';
import { SwaggerTypesMapper } from '@nestjs/swagger/dist/services/swagger-types-mapper';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { CreateActionDto } from '../dto/create-action.dto';
import { UpdateActionDto } from '../dto/update-action.dto';

describe('administrative action audit reasons', () => {
  it('publishes the update reason as required in Swagger', () => {
    const schemas: Record<string, SchemaObject> = {};
    const factory = new SchemaObjectFactory(
      new ModelPropertiesAccessor(),
      new SwaggerTypesMapper(),
    );
    factory.exploreModelSchema(UpdateActionDto, schemas);

    expect(schemas.UpdateActionDto?.required).toContain('reason');
  });

  it.each([
    [
      CreateActionDto,
      { name: 'Check-in', type: ActionType.CHECKIN, points: 10 },
    ],
    [UpdateActionDto, { isActive: false }],
  ])('requires a normalized reason on %p', async (Dto, input) => {
    const missing = plainToInstance(Dto, input);
    expect(await validate(missing)).not.toHaveLength(0);

    const valid = plainToInstance(Dto, {
      ...input,
      reason: '  Alteracao operacional confirmada  ',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.reason).toBe('Alteracao operacional confirmada');
  });

  it.each(['', 'curto', ' '.repeat(20), 'a'.repeat(501)])(
    'rejects invalid reason %p',
    async (reason) => {
      const dto = plainToInstance(UpdateActionDto, { isActive: false, reason });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});

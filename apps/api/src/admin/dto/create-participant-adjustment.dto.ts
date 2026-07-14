import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

@ValidatorConstraint({ name: 'validAdjustmentDeltas', async: false })
class ValidAdjustmentDeltas implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const input = args.object as {
      pointsDelta?: unknown;
      xpDelta?: unknown;
    };
    if (
      typeof input.pointsDelta !== 'number' ||
      typeof input.xpDelta !== 'number'
    ) {
      return true;
    }
    if (input.pointsDelta === 0 && input.xpDelta === 0) return false;
    return input.pointsDelta * input.xpDelta >= 0;
  }

  defaultMessage() {
    return 'Os deltas devem ter a mesma direção e ao menos um deve ser diferente de zero.';
  }
}

export class CreateParticipantAdjustmentDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Validate(ValidAdjustmentDeltas)
  pointsDelta!: number;

  @ApiProperty({ type: Number })
  @IsInt()
  xpDelta!: number;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  idempotencyKey!: string;
}

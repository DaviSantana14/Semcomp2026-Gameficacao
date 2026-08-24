import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const CONFIRMATION_WORDS = ['ATIVAR', 'DESATIVAR'] as const;

@ValidatorConstraint({ name: 'matchesBulkConfirmation', async: false })
class MatchesBulkConfirmationConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const dto = args.object as Partial<BulkClaimCodeStatusDto>;
    return (
      typeof value === 'string' &&
      typeof dto.isActive === 'boolean' &&
      value === (dto.isActive ? 'ATIVAR' : 'DESATIVAR')
    );
  }

  defaultMessage(args: ValidationArguments) {
    const dto = args.object as Partial<BulkClaimCodeStatusDto>;
    return `confirmation deve ser ${dto.isActive ? 'ATIVAR' : 'DESATIVAR'}.`;
  }
}

function trimIds(value: unknown) {
  if (!Array.isArray(value)) return value;
  return (value as unknown[]).map((item) =>
    typeof item === 'string' ? item.trim() : item,
  );
}

export class BulkClaimCodeStatusDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 500 })
  @Transform(({ value }: { value: unknown }) => trimIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  ids!: string[];

  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ enum: CONFIRMATION_WORDS })
  @IsString()
  @IsIn(CONFIRMATION_WORDS)
  @Validate(MatchesBulkConfirmationConstraint)
  confirmation!: (typeof CONFIRMATION_WORDS)[number];
}

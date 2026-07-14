import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  Matches,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ActionType } from '@prisma/client';
import {
  normalizeEventCode,
  REUSABLE_EVENT_CODE_REGEX,
} from '../../common/event-code';

export class CreateActionDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    example: 'Check-in Dia 1',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Presença registrada no primeiro dia da Semcomp.',
  })
  @Transform(({ value }: { value: string | null | undefined }) => {
    if (value == null) {
      return undefined;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: ActionType,
    example: ActionType.CHECKIN,
  })
  @IsEnum(ActionType)
  type: ActionType;

  @ApiPropertyOptional({
    example: 'DIA1',
    description:
      'Código reutilizável da atividade pontuável. Normalizado para maiúsculas quando informado.',
  })
  @Transform(({ value }: { value: string | null | undefined }) =>
    normalizeEventCode(value),
  )
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'code deve conter apenas letras, números e hífen.',
  })
  @Matches(REUSABLE_EVENT_CODE_REGEX, {
    message: 'Este formato é reservado para códigos de uso único.',
  })
  code?: string;

  @ApiProperty({
    example: 10,
  })
  @Type(() => Number)
  @IsInt()
  points: number;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

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
} from 'class-validator';
import { ActionType } from '@prisma/client';

export class CreateActionDto {
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
  @Transform(({ value }: { value: string | null | undefined }) => {
    if (value == null) {
      return undefined;
    }

    const normalized = value.trim().toUpperCase();

    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'code deve conter apenas letras, números e hífen.',
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

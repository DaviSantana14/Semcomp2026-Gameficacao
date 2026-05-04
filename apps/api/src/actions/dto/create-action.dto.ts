import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
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

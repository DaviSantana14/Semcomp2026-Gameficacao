import { Transform, Type } from 'class-transformer';
import { ActionType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import {
  normalizeEventCode,
  REUSABLE_EVENT_CODE_REGEX,
} from '../../common/event-code';

export class UpdateActionDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: ActionType })
  @IsOptional()
  @IsEnum(ActionType)
  type?: ActionType;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: string | null | undefined }) =>
    value === null ? null : normalizeEventCode(value),
  )
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]+$/)
  @Matches(REUSABLE_EVENT_CODE_REGEX, {
    message: 'Este formato é reservado para códigos de uso único.',
  })
  code?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isCodeActive?: boolean;
}

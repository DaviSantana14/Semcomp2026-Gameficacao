import { Transform, Type } from 'class-transformer';
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
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  name: string;

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

  @IsEnum(ActionType)
  type: ActionType;

  @Type(() => Number)
  @IsInt()
  points: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

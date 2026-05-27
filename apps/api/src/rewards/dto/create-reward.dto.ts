import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

function optionalTrimmed(value: string | null | undefined) {
  if (value == null) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

export class CreateRewardDto {
  @ApiProperty({ example: 'Camiseta Semcomp 2026' })
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Camiseta oficial do evento.' })
  @Transform(({ value }: { value: string | null | undefined }) =>
    optionalTrimmed(value),
  )
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  costInPoints: number;

  @ApiProperty({ example: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/camiseta.png' })
  @Transform(({ value }: { value: string | null | undefined }) =>
    optionalTrimmed(value),
  )
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;
}

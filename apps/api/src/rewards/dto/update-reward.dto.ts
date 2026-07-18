import { Transform } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CreateRewardDto } from './create-reward.dto';

export class UpdateRewardDto extends PartialType(
  OmitType(CreateRewardDto, ['reason', 'description', 'imageUrl'] as const),
) {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    example: 'Camiseta oficial do evento.',
    nullable: true,
  })
  @Transform(({ value }: { value: string | null | undefined }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/camiseta.png',
    nullable: true,
  })
  @Transform(({ value }: { value: string | null | undefined }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string | null;
}

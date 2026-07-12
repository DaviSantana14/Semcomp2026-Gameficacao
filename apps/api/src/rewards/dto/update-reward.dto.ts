import { Transform } from 'class-transformer';
import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';
import { CreateRewardDto } from './create-reward.dto';

export class UpdateRewardDto extends PartialType(
  OmitType(CreateRewardDto, ['description', 'imageUrl'] as const),
) {
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

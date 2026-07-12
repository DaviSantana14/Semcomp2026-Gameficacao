import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateClaimCodeStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

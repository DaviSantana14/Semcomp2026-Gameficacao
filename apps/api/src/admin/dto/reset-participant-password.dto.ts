import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length } from 'class-validator';

export class ResetParticipantPasswordDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(10, 500)
  reason!: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  replacePending = false;
}

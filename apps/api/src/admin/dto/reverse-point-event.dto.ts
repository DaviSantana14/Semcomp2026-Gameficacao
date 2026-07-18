import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class ReversePointEventDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  idempotencyKey!: string;
}

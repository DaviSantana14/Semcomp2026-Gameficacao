import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ChangeRequiredPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 64, format: 'password' })
  @IsString()
  @Length(8, 64)
  newPassword!: string;
}

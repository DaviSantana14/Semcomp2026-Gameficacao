import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class ActivateAdminDto {
  @ApiProperty({ minLength: 20, maxLength: 40 })
  @IsString()
  @Length(20, 40)
  code!: string;

  @ApiProperty({ example: '123.456.789-01' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{11}$/)
  cpf!: string;

  @ApiProperty({ example: 'operador@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 64, format: 'password' })
  @IsString()
  @Length(12, 64)
  password!: string;

  @ApiPropertyOptional({ minLength: 12, maxLength: 64, format: 'password' })
  @IsOptional()
  @IsString()
  @Length(12, 64)
  passwordConfirmation?: string;
}

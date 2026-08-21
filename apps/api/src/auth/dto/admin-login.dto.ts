import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({
    example: '123.456.789-01',
    description:
      'CPF do administrador. Aceita máscara, mas será normalizado para apenas dígitos.',
  })
  @Transform(({ value }: { value: string }) => value?.replace(/\D/g, ''))
  @Matches(/^\d{11}$/)
  cpf: string;

  @ApiProperty({
    example: 'admin@example.com',
  })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Senha do administrador.',
    format: 'password',
    minLength: 12,
    maxLength: 64,
  })
  @IsString()
  @Length(12, 64)
  password: string;
}

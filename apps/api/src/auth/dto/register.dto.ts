import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'Maria Silva',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '123.456.789-01',
    description:
      'CPF do participante. Aceita máscara, mas será normalizado para apenas dígitos.',
  })
  @Transform(({ value }: { value: string }) => value?.replace(/\D/g, ''))
  @Matches(/^\d{11}$/)
  cpf: string;

  @ApiProperty({
    example: 'maria@example.com',
  })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'senha livre do participante',
    description:
      'Senha entre 8 e 64 caracteres Unicode e no máximo 72 bytes UTF-8, sem regra de composição.',
    format: 'password',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @Length(8, 64)
  password: string;
}

import { Transform } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'maria@example.com',
  })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'senha livre do participante',
    description:
      'Senha do participante entre 8 e 64 caracteres e no máximo 72 bytes UTF-8.',
    format: 'password',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  password: string;
}

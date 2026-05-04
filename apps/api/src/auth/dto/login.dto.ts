import { Transform } from 'class-transformer';
import { IsEmail, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
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
}

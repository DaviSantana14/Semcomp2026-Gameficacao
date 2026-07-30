import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { LoginDto } from './login.dto';

export class AdminLoginDto extends LoginDto {
  @ApiProperty({
    description: 'Senha do administrador.',
    format: 'password',
    minLength: 12,
    maxLength: 64,
  })
  @IsString()
  password: string;
}

import { Transform } from 'class-transformer';
import { IsEmail, Matches } from 'class-validator';

export class LoginUserDto {
  @Transform(({ value }: { value: string }) => value?.replace(/\D/g, ''))
  @Matches(/^\d{11}$/)
  cpf: string;

  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;
}

import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class RegisterUserDto {
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  name: string;

  @Transform(({ value }: { value: string }) => value?.replace(/\D/g, ''))
  @Matches(/^\d{11}$/)
  cpf: string;

  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;
}

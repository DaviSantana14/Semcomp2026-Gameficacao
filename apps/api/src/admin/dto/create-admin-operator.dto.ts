import { ApiProperty } from '@nestjs/swagger';
import { AdminProfile } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, Length, Matches } from 'class-validator';

export class CreateAdminOperatorDto {
  @ApiProperty({ example: 'Bia Operadora' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 120)
  name!: string;

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

  @ApiProperty({ enum: AdminProfile, example: AdminProfile.SHOP })
  @IsEnum(AdminProfile)
  adminProfile!: AdminProfile;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(10, 500)
  reason!: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdminProfile } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class UpdateAdminOperatorDto {
  @ApiPropertyOptional({ example: 'Bia Operadora' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ example: '123.456.789-01' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{11}$/)
  cpf?: string;

  @ApiPropertyOptional({ example: 'operador@example.com' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: AdminProfile, example: AdminProfile.ACTIVITIES })
  @IsOptional()
  @IsEnum(AdminProfile)
  adminProfile?: AdminProfile;

  @ApiPropertyOptional({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(10, 500)
  reason!: string;
}

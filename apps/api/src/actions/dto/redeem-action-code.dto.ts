import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RedeemActionCodeDto {
  @ApiProperty({
    example: 'DIA1',
    description: 'Código reutilizável da atividade pontuável.',
  })
  @Transform(({ value }: { value: string }) => value?.trim().toUpperCase())
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'code deve conter apenas letras, números e hífen.',
  })
  code: string;
}

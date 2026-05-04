import { ApiProperty } from '@nestjs/swagger';

export class HttpErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: 'Autenticação necessária ou token inválido.' })
  message: string;

  @ApiProperty({ example: 'Unauthorized' })
  error: string;
}

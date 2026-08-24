import { ApiProperty } from '@nestjs/swagger';

export class ResetParticipantPasswordResponseDto {
  @ApiProperty({
    example: 'temporary-password-shown-once',
    description: 'Credencial exibida somente na resposta do reset.',
  })
  temporaryPassword!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

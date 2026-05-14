import { ApiProperty } from '@nestjs/swagger';

export class CsrfTokenResponseDto {
  @ApiProperty({
    example: '0ZfR-QGLwixWYqrXYQyGvA5SNJTtPpBTLtLqoDXJB8I',
    description: 'Token que deve ser enviado no header X-CSRF-Token.',
  })
  csrfToken: string;
}

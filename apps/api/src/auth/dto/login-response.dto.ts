import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class LoginResponseDto {
  @ApiProperty({
    example: '0ZfR-QGLwixWYqrXYQyGvA5SNJTtPpBTLtLqoDXJB8I',
    description:
      'Token que deve ser enviado no header X-CSRF-Token em mutações autenticadas.',
  })
  csrfToken: string;

  @ApiProperty({
    type: UserResponseDto,
  })
  user: UserResponseDto;
}

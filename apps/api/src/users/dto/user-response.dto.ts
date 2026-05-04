import { UserRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: 'cmordu0xq0000xobwgmo5u1kl',
  })
  id: string;

  @ApiProperty({
    example: 'Maria Silva',
  })
  name: string;

  @ApiProperty({
    example: '12345678901',
  })
  cpf: string;

  @ApiProperty({
    example: 'maria@example.com',
  })
  email: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.PARTICIPANT,
  })
  role: UserRole;

  @ApiProperty({
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    example: '2026-05-04T16:20:34.140Z',
    nullable: true,
    type: String,
  })
  lastLoginAt: Date | null;

  @ApiProperty({
    example: '2026-05-04T15:56:48.830Z',
    type: String,
  })
  createdAt: Date;

  constructor(data: UserResponseSource) {
    this.id = data.id;
    this.name = data.name;
    this.cpf = data.cpf;
    this.email = data.email;
    this.role = data.role;
    this.isActive = data.isActive;
    this.lastLoginAt = data.lastLoginAt;
    this.createdAt = data.createdAt;
  }
}

export type UserResponseSource = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export function toUserResponseDto(user: UserResponseSource) {
  return new UserResponseDto(user);
}

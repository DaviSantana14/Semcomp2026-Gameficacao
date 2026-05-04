import { UserRole } from '@prisma/client';

export class UserResponseDto {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
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

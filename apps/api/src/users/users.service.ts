import { Injectable, NotFoundException } from '@nestjs/common';
import { toUserResponseDto } from './dto/user-response.dto';
import { UsersRepository } from './users.repository';

export interface CreateUserInput {
  name: string;
  cpf: string;
  email: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async findAll() {
    const users = await this.repository.findAll();
    return users.map(toUserResponseDto);
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return toUserResponseDto(user);
  }

  findActiveSummaryById(id: string) {
    return this.repository.findActiveSummaryById(id);
  }

  findByCpfOrEmail(cpf: string, email: string) {
    return this.repository.findByCpfOrEmail(cpf, email);
  }

  create(input: CreateUserInput) {
    return this.repository.create(input);
  }

  findActiveByCredentials(cpf: string, email: string) {
    return this.repository.findActiveByCredentials(cpf, email);
  }

  findByCredentialsWithPasswordHash(cpf: string, email: string) {
    return this.repository.findByCredentialsWithPasswordHash(cpf, email);
  }

  setAdminPassword(cpf: string, email: string, passwordHash: string) {
    return this.repository.setAdminPassword(cpf, email, passwordHash);
  }

  updateLastLoginAt(id: string) {
    return this.repository.updateLastLoginAt(id);
  }
}

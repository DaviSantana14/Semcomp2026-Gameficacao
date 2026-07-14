import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  findAll() {
    return this.repository.findAll();
  }
  findById(...args: Parameters<UsersRepository['findById']>) {
    return this.repository.findById(...args);
  }
  findActiveSummaryById(
    ...args: Parameters<UsersRepository['findActiveSummaryById']>
  ) {
    return this.repository.findActiveSummaryById(...args);
  }
  findByCpfOrEmail(...args: Parameters<UsersRepository['findByCpfOrEmail']>) {
    return this.repository.findByCpfOrEmail(...args);
  }
  create(...args: Parameters<UsersRepository['create']>) {
    return this.repository.create(...args);
  }
  findActiveByCredentials(
    ...args: Parameters<UsersRepository['findActiveByCredentials']>
  ) {
    return this.repository.findActiveByCredentials(...args);
  }
  updateLastLoginAt(...args: Parameters<UsersRepository['updateLastLoginAt']>) {
    return this.repository.updateLastLoginAt(...args);
  }
}

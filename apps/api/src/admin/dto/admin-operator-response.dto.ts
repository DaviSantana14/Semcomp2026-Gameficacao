import { ApiProperty } from '@nestjs/swagger';
import { AdminProfile } from '@prisma/client';

export type AdminOperatorState = 'PENDING_ACTIVATION' | 'ACTIVE' | 'INACTIVE';

export type AdminOperatorResponseSource = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  adminProfile: AdminProfile;
  isActive: boolean;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activationExpiresAt: Date | null;
};

export class AdminOperatorResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() cpf!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: AdminProfile }) adminProfile!: AdminProfile;
  @ApiProperty({ enum: ['PENDING_ACTIVATION', 'ACTIVE', 'INACTIVE'] })
  state!: AdminOperatorState;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true, type: String })
  activationExpiresAt!: string | null;
  @ApiProperty({ nullable: true, type: String })
  lastLoginAt!: string | null;
  @ApiProperty({ nullable: true, type: String })
  passwordChangedAt!: string | null;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: String }) updatedAt!: string;

  constructor(source: AdminOperatorResponseSource, state: AdminOperatorState) {
    this.id = source.id;
    this.name = source.name;
    this.cpf = source.cpf;
    this.email = source.email;
    this.adminProfile = source.adminProfile;
    this.state = state;
    this.isActive = source.isActive;
    this.activationExpiresAt =
      source.activationExpiresAt?.toISOString() ?? null;
    this.lastLoginAt = source.lastLoginAt?.toISOString() ?? null;
    this.passwordChangedAt = source.passwordChangedAt?.toISOString() ?? null;
    this.createdAt = source.createdAt.toISOString();
    this.updatedAt = source.updatedAt.toISOString();
  }
}

export class AdminOperatorsPageResponseDto {
  @ApiProperty({ type: [AdminOperatorResponseDto] })
  items!: AdminOperatorResponseDto[];
  @ApiProperty()
  meta!: { page: number; limit: number; total: number; totalPages: number };
}

export class AdminOperatorActivationResponseDto {
  @ApiProperty({ type: AdminOperatorResponseDto })
  operator!: AdminOperatorResponseDto;

  @ApiProperty({ minLength: 23, maxLength: 23 })
  activationCode!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

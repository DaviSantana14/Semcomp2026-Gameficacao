import { ActionType } from '@prisma/client';

export class ReusableCodeHistoryResponseDto {
  id!: string;
  name!: string;
  type!: ActionType;
  code!: string;
  points!: number;
  status!: 'ACTIVE' | 'INACTIVE';
  totalUses!: number;
  lastUsedAt!: string | null;
}

export class ReusableCodeRedemptionResponseDto {
  id!: string;
  points!: number;
  createdAt!: string;
  participant!: { id: string; name: string; email: string; cpf: string };
}

import type { AdminProfile } from "@/features/users/users.types";

export type AdminOperatorState =
  | "PENDING_ACTIVATION"
  | "ACTIVE"
  | "INACTIVE";

export type AdminOperator = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  adminProfile: AdminProfile;
  state: AdminOperatorState;
  isActive: boolean;
  activationExpiresAt: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperatorActivationResult = {
  operator: AdminOperator;
  activationCode: string;
  expiresAt: string;
};

export type OperatorsFilters = {
  page: number;
  limit: number;
  search?: string;
  adminProfile?: AdminProfile;
  state?: AdminOperatorState;
};

export type CreateOperatorPayload = {
  name: string;
  cpf: string;
  email: string;
  adminProfile: AdminProfile;
  reason: string;
};

export type UpdateOperatorPayload = Partial<
  Pick<CreateOperatorPayload, "name" | "cpf" | "email" | "adminProfile">
> & { reason: string };

export type UpdateOperatorStatusPayload = {
  isActive: boolean;
  reason: string;
};

export type ResetOperatorActivationPayload = { reason: string };

import type { User } from "@/features/users/users.types";

export type { AdminProfile } from "@/features/users/users.types";

export type LoginPayload = {
  email: string;
  password: string;
};

export type AdminLoginPayload = {
  cpf: string;
  email: string;
  password: string;
};

export type AdminActivationPayload = {
  code: string;
  cpf: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

export type RegisterPayload = {
  name: string;
  cpf: string;
  email: string;
  password: string;
};

export type LoginResponse = {
  user: User;
  csrfToken: string;
};

export type SessionSecurityResponse = {
  csrfToken: string;
  passwordChangeRequired: boolean;
};

export type ChangeRequiredPasswordPayload = {
  newPassword: string;
};

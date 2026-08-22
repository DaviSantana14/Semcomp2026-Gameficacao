import type { User } from "@/features/users/users.types";

export type LoginPayload = {
  email: string;
  password: string;
};

export type AdminLoginPayload = {
  cpf: string;
  email: string;
  password: string;
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

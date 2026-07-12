import type { User } from "@/features/users/users.types";

export type LoginPayload = {
  cpf: string;
  email: string;
};

export type RegisterPayload = LoginPayload & { name: string };

export type LoginResponse = {
  user: User;
  csrfToken: string;
};

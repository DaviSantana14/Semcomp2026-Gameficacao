export type UserRole = "ADMIN" | "PARTICIPANT";

export type User = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: UserRole;
  points: number;
  xp: number;
  level: number;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

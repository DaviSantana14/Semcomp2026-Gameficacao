export type UserRole = "ADMIN" | "PARTICIPANT";

export type AdminProfile = "GENERAL" | "SHOP" | "ACTIVITIES";

export type User = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: UserRole;
  adminProfile: AdminProfile | null;
  passwordChangeRequired: boolean;
  points: number;
  xp: number;
  level: number;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

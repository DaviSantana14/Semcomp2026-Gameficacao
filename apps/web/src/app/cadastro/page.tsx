import { AuthShell } from "../login/auth-shell";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="novo participante"
      title="Ative sua conta no evento"
      description="Cadastre seus dados uma vez, entre direto no painel e comece a acumular XP e pontos conforme resgata codigos."
    >
      <RegisterForm />
    </AuthShell>
  );
}

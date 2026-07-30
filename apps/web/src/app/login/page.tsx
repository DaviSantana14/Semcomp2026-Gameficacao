import { AuthShell } from "./auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="checkpoint de entrada"
      title="Sua jornada começa aqui."
      description="Entre para acompanhar conquistas, posição e recompensas."
    >
      <LoginForm />
    </AuthShell>
  );
}

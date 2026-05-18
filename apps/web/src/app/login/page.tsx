import { AuthShell } from "./auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="checkpoint de entrada"
      title="Entre no placar da Semcomp"
      description="Acesse sua conta para acompanhar XP, pontos de loja e os codigos conquistados durante a competicao."
    >
      <LoginForm />
    </AuthShell>
  );
}

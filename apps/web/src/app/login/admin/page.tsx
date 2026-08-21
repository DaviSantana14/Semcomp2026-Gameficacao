import { AuthShell } from "../auth-shell";
import { AdminLoginForm } from "./admin-login-form";

export default function AdminLoginPage() {
  return (
    <AuthShell
      eyebrow="acesso restrito"
      title="Administração do evento."
      description="Entre com suas credenciais administrativas para gerenciar a Semcomp."
    >
      <AdminLoginForm />
    </AuthShell>
  );
}

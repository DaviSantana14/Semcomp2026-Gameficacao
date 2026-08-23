import { AuthShell } from "@/app/login/auth-shell";
import { AdminActivationForm } from "./admin-activation-form";

export default function AdminActivationPage() {
  return (
    <AuthShell
      description="Ative seu acesso com o código fornecido pela administração."
      eyebrow="primeiro acesso"
      title="Seu posto começa aqui."
    >
      <AdminActivationForm />
    </AuthShell>
  );
}

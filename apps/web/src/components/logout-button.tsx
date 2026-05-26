"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, logout } from "@/lib/api";
import { cn } from "@/lib/utils";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
      queryClient.removeQueries({ queryKey: ["me"] });
      router.replace("/login");
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Nao foi possivel sair agora.";
      toast.error(message);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <Button
      className={cn("border-destructive/40 text-destructive hover:bg-destructive/10", className)}
      disabled={isLoggingOut}
      onClick={handleLogout}
      variant="outline"
    >
      <LogOut aria-hidden="true" data-icon="inline-start" />
      {isLoggingOut ? "Saindo..." : "Sair"}
    </Button>
  );
}

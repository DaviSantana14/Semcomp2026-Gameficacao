"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ClaimCodeGenerator } from "./claim-code-generator";
import { ClaimCodeHistory } from "./claim-code-history";
import { ReusableCodeHistory } from "./reusable-code-history";
export function CodesClient() {
  const [tab, setTab] = useState<"single" | "reusable">("single");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <p className="font-mono text-xs uppercase text-primary">
          Operação // Códigos
        </p>
        <h1 className="mt-2 text-3xl font-black md:text-5xl">
          Central de códigos
        </h1>
        <p className="mt-2 text-muted-foreground">
          Gere lotes e acompanhe disponibilidade e uso.
        </p>
      </header>
      <ClaimCodeGenerator />
      <nav aria-label="Tipo de código" className="flex gap-2">
        <Button
          onClick={() => setTab("single")}
          variant={tab === "single" ? "primary" : "outline"}
        >
          Uso único
        </Button>
        <Button
          onClick={() => setTab("reusable")}
          variant={tab === "reusable" ? "primary" : "outline"}
        >
          Reutilizáveis
        </Button>
      </nav>
      {tab === "single" ? <ClaimCodeHistory /> : <ReusableCodeHistory />}
    </div>
  );
}

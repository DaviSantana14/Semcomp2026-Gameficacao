"use client";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClaimCodeGenerator } from "./claim-code-generator";
import { ClaimCodeHistory } from "./claim-code-history";
import { ReusableCodeHistory } from "./reusable-code-history";
export function CodesClient() {
  const [tab, setTab] = useState<"single" | "reusable">("single");
  const tabs = ["single", "reusable"] as const;
  const selectTab = (nextTab: (typeof tabs)[number]) => {
    setTab(nextTab);
    document.getElementById(`${nextTab}-codes-tab`)?.focus();
  };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = tabs.indexOf(tab);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectTab(tabs[nextIndex]);
  };
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
      <div aria-label="Tipo de código" className="flex gap-2" role="tablist">
        <Button
          aria-controls="single-codes-panel"
          aria-selected={tab === "single"}
          id="single-codes-tab"
          onClick={() => setTab("single")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={tab === "single" ? 0 : -1}
          variant={tab === "single" ? "primary" : "outline"}
        >
          Uso único
        </Button>
        <Button
          aria-controls="reusable-codes-panel"
          aria-selected={tab === "reusable"}
          id="reusable-codes-tab"
          onClick={() => setTab("reusable")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={tab === "reusable" ? 0 : -1}
          variant={tab === "reusable" ? "primary" : "outline"}
        >
          Reutilizáveis
        </Button>
      </div>
      <div
        aria-labelledby={`${tab}-codes-tab`}
        id={`${tab}-codes-panel`}
        role="tabpanel"
      >
        {tab === "single" ? <ClaimCodeHistory /> : <ReusableCodeHistory />}
      </div>
    </div>
  );
}

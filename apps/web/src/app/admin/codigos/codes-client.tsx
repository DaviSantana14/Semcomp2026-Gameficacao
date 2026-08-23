"use client";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminPageHeader, AdminPanel } from "../_components/admin-page";
import { ClaimCodeGenerator } from "./claim-code-generator";
import { ClaimCodeBatchHistory } from "./claim-code-batch-history";
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
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectTab(tabs[nextIndex]);
  };
  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-8">
      <AdminPageHeader
        description={<p>Gere lotes e acompanhe disponibilidade e uso.</p>}
        eyebrow="operação // códigos"
        title="Central de códigos"
      />
      <ClaimCodeGenerator />
      <AdminPanel
        aria-label="Tipo de código"
        className="flex w-fit gap-1 rounded-[14px] p-1.5"
        role="tablist"
      >
        <Button
          aria-controls="single-codes-panel"
          aria-selected={tab === "single"}
          id="single-codes-tab"
          onClick={() => setTab("single")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={tab === "single" ? 0 : -1}
          variant={tab === "single" ? "secondary" : "ghost"}
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
          variant={tab === "reusable" ? "secondary" : "ghost"}
        >
          Reutilizáveis
        </Button>
      </AdminPanel>
      <div
        aria-labelledby={`${tab}-codes-tab`}
        id={`${tab}-codes-panel`}
        role="tabpanel"
      >
        {tab === "single" ? (
          <div className="grid gap-8">
            <ClaimCodeBatchHistory />
            <ClaimCodeHistory />
          </div>
        ) : (
          <ReusableCodeHistory />
        )}
      </div>
    </div>
  );
}

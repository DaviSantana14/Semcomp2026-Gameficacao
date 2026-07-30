import { type ReactNode } from "react";
import { BrandLogo } from "@/components/semcomp/brand-logo";

type AuthShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

export function AuthShell({
  children,
  description,
  eyebrow,
  title,
}: AuthShellProps) {
  return (
    <main className="semcomp-atmosphere relative isolate flex min-h-dvh items-center overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.75fr)]">
        <div className="relative min-h-64 lg:min-h-[34rem]">
          <BrandLogo className="w-44 lg:w-52" priority />

          <div className="relative z-10 mt-10 max-w-xl sm:mt-12 lg:mt-28">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {eyebrow}
            </p>
            <h1 className="mt-4 max-w-lg font-display text-5xl font-bold uppercase leading-[0.86] tracking-wide text-foreground sm:text-6xl lg:text-7xl">
              {title}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              {description}
            </p>
          </div>

          <div aria-hidden="true" className="auth-orbit-stage">
            <div className="auth-orbit-ring" />
            <span className="auth-orbit-node" />
          </div>
        </div>

        {children}
      </section>
    </main>
  );
}

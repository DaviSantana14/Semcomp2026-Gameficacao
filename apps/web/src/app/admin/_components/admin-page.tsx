import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminPageHeaderProps = ComponentPropsWithRef<"header"> & {
  action?: ReactNode;
  description: ReactNode;
  eyebrow: string;
  title: ReactNode;
};

export function AdminPageHeader({
  action,
  className,
  description,
  eyebrow,
  title,
  ...props
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "relative flex flex-col justify-between gap-6 border-b border-border/80 pb-8 after:absolute after:-bottom-px after:left-0 after:h-px after:w-28 after:bg-gradient-to-r after:from-secondary after:to-transparent md:flex-row md:items-end",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="semcomp-checkpoint text-primary" />
          <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </p>
        </div>
        <h1 className="mt-3 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.84] tracking-wide text-foreground md:text-6xl xl:text-7xl">
          {title}
        </h1>
        <div className="mt-4 max-w-3xl font-reading text-sm leading-6 text-muted-foreground md:text-base">
          {description}
        </div>
      </div>
      {action ? <div className="shrink-0 md:pb-1">{action}</div> : null}
    </header>
  );
}

export function AdminPanel({
  className,
  ...props
}: ComponentPropsWithRef<"section">) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[20px] border border-border/80 bg-card/75 backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

type AdminSectionHeaderProps = ComponentPropsWithRef<"header"> & {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  id?: string;
  title: ReactNode;
};

export function AdminSectionHeader({
  action,
  className,
  description,
  eyebrow,
  id,
  title,
  ...props
}: AdminSectionHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col justify-between gap-4 md:flex-row md:items-end",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-secondary">
            {eyebrow}
          </p>
        ) : null}
        <h2 className={cn("text-xl font-bold text-foreground", eyebrow && "mt-1")} id={id}>
          {title}
        </h2>
        {description ? (
          <div className="mt-1 font-reading text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export const adminSelectClassName =
  "min-h-11 min-w-0 rounded-[11px] border border-input bg-muted/70 px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

export const adminTextareaClassName =
  "min-h-24 w-full rounded-[11px] border border-input bg-muted/70 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";

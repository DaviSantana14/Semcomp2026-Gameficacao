import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <Image
      alt="SEMCOMP 2026"
      className={cn("h-auto w-40", className)}
      height={37}
      priority={priority}
      src="/assets/logo-semcomp.svg"
      width={211}
    />
  );
}

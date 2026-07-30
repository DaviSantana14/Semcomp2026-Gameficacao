import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrandLogo } from "./brand-logo";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span aria-label={alt} data-src={src} role="img" />
  ),
}));

describe("BrandLogo", () => {
  it("usa a assinatura oficial da SEMCOMP 2026", () => {
    render(<BrandLogo />);

    expect(screen.getByRole("img", { name: "SEMCOMP 2026" })).toHaveAttribute(
      "data-src",
      "/assets/logo-semcomp.svg",
    );
  });
});

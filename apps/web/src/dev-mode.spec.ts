import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("web development mode", () => {
  it("uses webpack to avoid the Turbopack memory regression on Windows", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: { dev?: string } };

    expect(packageJson.scripts?.dev).toBe("next dev --webpack");
  });
});

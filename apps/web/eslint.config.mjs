import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api",
              message: "Importe diretamente da feature ou de lib/http.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/http/**/*.{ts,tsx}"],
    ignores: ["src/lib/http/**/*.spec.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api",
              message: "O cliente HTTP não pode depender do antigo god file.",
            },
          ],
          patterns: [
            {
              group: ["@/features/*", "**/features/*"],
              message: "lib/http deve permanecer independente das features.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.service.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api",
              message: "Importe a infraestrutura por lib/http.",
            },
            {
              name: "react",
              message: "Services de domínio não devem depender de React.",
            },
            {
              name: "@tanstack/react-query",
              message: "Cache e query keys pertencem à camada de UI.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

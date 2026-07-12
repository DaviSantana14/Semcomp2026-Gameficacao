import "dotenv/config";
import { defineConfig } from "prisma/config";
import { buildDatabaseUrl } from "./src/prisma/database-url";

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node --project tsconfig.json prisma/seed.ts",
  },
  datasource: {
    url: buildDatabaseUrl(),
  },
});

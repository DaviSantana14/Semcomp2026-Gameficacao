-- Add reusable action codes. PostgreSQL unique indexes allow multiple NULL values.
ALTER TABLE "Action" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "Action_code_key" ON "Action"("code");

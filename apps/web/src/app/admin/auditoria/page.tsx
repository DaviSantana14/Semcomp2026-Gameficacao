import { Suspense } from "react";
import { AdminLoading } from "../_components/admin-loading";
import { AuditClient } from "./audit-client";

export default function AuditPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AuditClient />
    </Suspense>
  );
}

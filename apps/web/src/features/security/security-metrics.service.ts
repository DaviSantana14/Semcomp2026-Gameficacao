import { apiFetch } from "@/lib/http/client";
import type { SecurityMetricsOverview } from "./security-metrics.types";

export type {
  SecurityMetricsOverview,
  SecurityMetricsPeriod,
  SecurityMetricsStatus,
  SecurityMetricsThresholds,
} from "./security-metrics.types";

export function fetchSecurityMetricsOverview() {
  return apiFetch<SecurityMetricsOverview>(
    "/admin/security-metrics/overview",
  );
}

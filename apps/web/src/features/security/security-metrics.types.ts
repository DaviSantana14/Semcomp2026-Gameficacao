export type SecurityMetricsStatus = "NORMAL" | "ATTENTION" | "DEGRADED";

export type SecurityMetricsPeriod = {
  unauthorized: number;
  forbidden: number;
  rateLimited: number;
};

export type SecurityMetricsThresholds = {
  unauthorized: number;
  forbidden: number;
  rateLimited: number;
  windowMinutes: number;
};

export type SecurityMetricsOverview = {
  status: SecurityMetricsStatus;
  lastFlushedMinute: string | null;
  periods: {
    fiveMinutes: SecurityMetricsPeriod;
    oneHour: SecurityMetricsPeriod;
    twentyFourHours: SecurityMetricsPeriod;
  };
  thresholds: SecurityMetricsThresholds;
};

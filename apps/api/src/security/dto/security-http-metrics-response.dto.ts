export class SecurityHttpMetricsPeriodResponseDto {
  unauthorized!: number;
  forbidden!: number;
  rateLimited!: number;
}

export class SecurityHttpMetricsThresholdsResponseDto {
  unauthorized!: 20;
  forbidden!: 10;
  rateLimited!: 5;
  windowMinutes!: 5;
}

export class SecurityHttpMetricsResponseDto {
  status!: 'NORMAL' | 'ATTENTION' | 'DEGRADED';
  lastFlushedMinute!: string | null;
  periods!: {
    fiveMinutes: SecurityHttpMetricsPeriodResponseDto;
    oneHour: SecurityHttpMetricsPeriodResponseDto;
    twentyFourHours: SecurityHttpMetricsPeriodResponseDto;
  };
  thresholds!: SecurityHttpMetricsThresholdsResponseDto;
}

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  isSecurityHttpMetricStatus,
  SecurityHttpMetricsBuffer,
} from './security-http-metrics.buffer';

@Injectable()
export class SecurityHttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly buffer: SecurityHttpMetricsBuffer) {}

  use(_request: Request, response: Response, next: NextFunction): void {
    response.once('finish', () => {
      if (!isSecurityHttpMetricStatus(response.statusCode)) {
        return;
      }

      this.buffer.record({
        statusCode: response.statusCode,
        finishedAt: new Date(),
      });
    });

    next();
  }
}

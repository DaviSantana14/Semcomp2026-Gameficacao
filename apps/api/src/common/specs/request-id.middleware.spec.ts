import {
  Controller,
  Get,
  INestApplication,
  InternalServerErrorException,
  MiddlewareConsumer,
  Module,
  NestModule,
  Req,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../app.module';
import {
  AdminOperationContext,
  AuthenticatedRequest,
  getAdminOperationContext,
} from '../request-context';
import {
  REQUEST_ID_HEADER,
  RequestIdMiddleware,
} from '../request-id.middleware';

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function runMiddleware(headers: Record<string, string> = {}) {
  const middleware = new RequestIdMiddleware();
  const requestObject = { headers };
  const response = { setHeader: jest.fn() };
  const next = jest.fn();

  middleware.use(requestObject, response as never, next);

  return { next, request: requestObject, response };
}

describe('RequestIdMiddleware', () => {
  it('generates a UUID for a request without an identifier', () => {
    const result = runMiddleware();

    expect(isUuid(result.request.requestId)).toBe(true);
    expect(result.response.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      result.request.requestId,
    );
    expect(result.next).toHaveBeenCalledTimes(1);
  });

  it('ignores an external request identifier for audit identity', () => {
    const result = runMiddleware({ 'x-request-id': 'client-controlled' });

    expect(result.request.requestId).not.toBe('client-controlled');
    expect(isUuid(result.request.requestId)).toBe(true);
  });

  it('generates distinct identifiers for consecutive requests', () => {
    const first = runMiddleware();
    const second = runMiddleware();

    expect(first.request.requestId).not.toBe(second.request.requestId);
  });
});

describe('AppModule middleware registration', () => {
  it('registers request identifiers for every route', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn().mockReturnValue({ forRoutes });

    new AppModule().configure({ apply });

    expect(apply).toHaveBeenCalledWith(RequestIdMiddleware);
    expect(forRoutes).toHaveBeenCalledWith('{*path}');
  });
});

class ContextProbeService {
  lastContext?: AdminOperationContext;

  capture(context: AdminOperationContext) {
    this.lastContext = context;
    return context;
  }
}

@Controller('request-context-probe')
class ContextProbeController {
  constructor(private readonly service: ContextProbeService) {}

  @Get()
  capture(@Req() req: AuthenticatedRequest) {
    req.user = { id: 'admin-1' };
    return this.service.capture(getAdminOperationContext(req));
  }
}

@Controller()
class RootProbeController {
  @Get()
  getRoot() {
    return { ok: true };
  }
}

@Controller('request-context-error-probe')
class ErrorProbeController {
  @Get()
  getError(): never {
    throw new InternalServerErrorException('Probe failure.');
  }
}

@Module({
  controllers: [
    ContextProbeController,
    RootProbeController,
    ErrorProbeController,
  ],
  providers: [ContextProbeService],
})
class ContextProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}

describe('request identifier propagation', () => {
  let app: INestApplication<App>;
  let service: ContextProbeService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ContextProbeModule],
    }).compile();

    app = moduleRef.createNestApplication();
    service = moduleRef.get(ContextProbeService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the same generated UUID that the controller sends to the service', async () => {
    const response = await request(app.getHttpServer())
      .get('/request-context-probe')
      .set(REQUEST_ID_HEADER, 'external-id')
      .expect(200);

    const responseRequestId = response.headers['x-request-id'];

    expect(isUuid(responseRequestId)).toBe(true);
    expect(responseRequestId).not.toBe('external-id');
    expect(service.lastContext).toEqual({
      actorAdminId: 'admin-1',
      requestId: responseRequestId,
    });
    expect(Object.keys(service.lastContext ?? {}).sort()).toEqual([
      'actorAdminId',
      'requestId',
    ]);
  });

  it('returns a generated request identifier for the root route', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(isUuid(response.headers['x-request-id'])).toBe(true);
  });

  it('keeps the generated request identifier on error responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/request-context-error-probe')
      .expect(500);

    expect(isUuid(response.headers['x-request-id'])).toBe(true);
  });
});

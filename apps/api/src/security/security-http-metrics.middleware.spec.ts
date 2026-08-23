import { SecurityHttpMetricsMiddleware } from './security-http-metrics.middleware';

describe(SecurityHttpMetricsMiddleware.name, () => {
  it('records only the final status and timestamp, without request attributes', () => {
    type MetricEvent = { statusCode: number; finishedAt: Date };
    const record = jest.fn<void, [MetricEvent]>();
    let finish: (() => void) | undefined;
    const once = jest.fn<void, ['finish', () => void]>((_event, listener) => {
      finish = listener;
    });
    const response = {
      statusCode: 403,
      once,
    };
    const request = {
      body: {
        cpf: '529.982.247-25',
        email: 'person@example.com',
        password: 'secret',
      },
      cookies: { access_token: 'jwt-token' },
      headers: { cookie: 'access_token=jwt-token' },
    };
    const next = jest.fn();
    const middleware = new SecurityHttpMetricsMiddleware({ record } as never);

    middleware.use(request as never, response as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.once).toHaveBeenCalledWith('finish', expect.any(Function));

    finish?.();

    expect(record).toHaveBeenCalledTimes(1);
    const event = record.mock.calls[0]?.[0];
    expect(event?.statusCode).toBe(403);
    expect(event?.finishedAt).toBeInstanceOf(Date);
    expect(Object.keys(event ?? {}).sort()).toEqual([
      'finishedAt',
      'statusCode',
    ]);
    expect(JSON.stringify(record.mock.calls)).not.toContain('529.982.247-25');
    expect(JSON.stringify(record.mock.calls)).not.toContain(
      'person@example.com',
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain('jwt-token');
  });

  it('ignores responses outside the tracked status set', () => {
    type MetricEvent = { statusCode: number; finishedAt: Date };
    const record = jest.fn<void, [MetricEvent]>();
    let finish: (() => void) | undefined;
    const once = jest.fn<void, ['finish', () => void]>((_event, listener) => {
      finish = listener;
    });
    const response = { statusCode: 200, once };
    const next = jest.fn();
    const middleware = new SecurityHttpMetricsMiddleware({ record } as never);

    middleware.use({} as never, response as never, next);
    finish?.();

    expect(record).not.toHaveBeenCalled();
  });
});

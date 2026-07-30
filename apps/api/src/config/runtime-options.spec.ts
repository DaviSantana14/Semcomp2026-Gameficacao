import { getRuntimeOptions } from './runtime-options';

describe('getRuntimeOptions', () => {
  it.each([
    ['fora de produção', { NODE_ENV: 'development' }, true],
    ['em produção', { NODE_ENV: 'production' }, false],
    [
      'com true explícito em produção',
      { NODE_ENV: 'production', SWAGGER_ENABLED: 'true' },
      true,
    ],
    [
      'com false explícito fora de produção',
      { NODE_ENV: 'development', SWAGGER_ENABLED: 'false' },
      false,
    ],
  ])('configura Swagger %s', (_, environment, swaggerEnabled) => {
    expect(getRuntimeOptions(environment)).toEqual({ swaggerEnabled });
  });

  it.each(['', 'TRUE', 'False', '1', 'false '])(
    'rejeita SWAGGER_ENABLED inválido: %p',
    (swaggerEnabled) => {
      expect(() =>
        getRuntimeOptions({ SWAGGER_ENABLED: swaggerEnabled }),
      ).toThrow('SWAGGER_ENABLED deve ser true ou false.');
    },
  );
});

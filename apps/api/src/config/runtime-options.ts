export type RuntimeOptions = {
  swaggerEnabled: boolean;
};

export function getRuntimeOptions(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeOptions {
  const swaggerEnabled = environment.SWAGGER_ENABLED;

  if (swaggerEnabled === undefined) {
    return { swaggerEnabled: environment.NODE_ENV !== 'production' };
  }

  if (swaggerEnabled === 'true') {
    return { swaggerEnabled: true };
  }

  if (swaggerEnabled === 'false') {
    return { swaggerEnabled: false };
  }

  throw new Error('SWAGGER_ENABLED deve ser true ou false.');
}

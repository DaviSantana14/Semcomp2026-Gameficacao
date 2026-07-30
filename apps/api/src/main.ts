import { UnsupportedMediaTypeException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import {
  json,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

function rejectUnexpectedContentType(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const contentLength = request.headers['content-length'];
  const hasBody =
    (typeof contentLength === 'string' && Number(contentLength) > 0) ||
    request.headers['transfer-encoding'] !== undefined;

  if (hasBody && !request.is('application/json')) {
    next(
      new UnsupportedMediaTypeException(
        'Content-Type deve ser application/json.',
      ),
    );
    return;
  }

  next();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance() as Express;

  expressApp.set('trust proxy', 1);
  expressApp.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      strictTransportSecurity: false,
    }),
  );
  app.use(rejectUnexpectedContentType);
  app.use(json({ limit: '128kb', type: 'application/json' }));
  app.use(cookieParser());

  if (process.env.NODE_ENV === 'development') {
    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      throw new Error('Missing FRONTEND_URL environment variable');
    }

    app.enableCors({ origin: frontendUrl, credentials: true });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Semcomp Gamification API')
    .setDescription(
      'API para autenticação, usuários e ações de gamificação da Semcomp.',
    )
    .setVersion('1.0.0')
    .addSecurity('access-token-cookie', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    })
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap application.', error);
  process.exit(1);
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { UPLOADS_DIR } from './common/data-dir';

async function bootstrap() {
  try {
    mkdirSync(UPLOADS_DIR, { recursive: true });

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      // Verbose/debug logging on every request slows the server down.
      logger: ['error', 'warn', 'log'],
    });

    const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const allowedOrigins = configuredOrigins.length
      ? configuredOrigins
      : process.env.NODE_ENV === 'production' || process.env.RENDER
        ? []
        : ['http://localhost:5173', 'http://127.0.0.1:5173'];

    app.enableCors({
      origin: (origin, callback) => {
        // Requests without Origin are typically server-to-server/health checks.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed by CORS'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );

    // multer (profile.controller.ts) saves files to UPLOADS_DIR — must match.
    app.useStaticAssets(UPLOADS_DIR, {
      prefix: '/uploads/',
      maxAge: '7d',
    });

    const port = process.env.PORT || 3001;
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 Server running on port ${port}`);
  } catch (error) {
    console.error('❌ FATAL ERROR during startup:', error);
    process.exit(1);
  }
}

// Unhandled errors may leave shared game/database state inconsistent. Log and
// terminate so the process manager can restart a clean instance.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception; shutting down for a clean restart:', err);
  process.exit(1);
});

bootstrap();

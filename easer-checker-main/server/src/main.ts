import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { UPLOADS_DIR } from './common/data-dir';

async function bootstrap() {
  try {
    // ✅ Make sure the upload directory exists before multer/static serving
    // need it. Both this and the SQLite DB live under DATA_DIR (see
    // common/data-dir.ts) — on Render that's the persistent disk mount
    // (see render.yaml), so avatars and the DB survive redeploys.
    mkdirSync(UPLOADS_DIR, { recursive: true });

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'], // Enable all logs
    });

    app.enableCors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // NOTE: multer (profile.controller.ts) saves files to UPLOADS_DIR —
    // this must match exactly, otherwise uploaded avatars 404 when the
    // client requests them.
    app.useStaticAssets(UPLOADS_DIR, {
      prefix: '/uploads/',
    });

    // ✅ CRITICAL: Bind to 0.0.0.0 so Render can detect the port
    const port = process.env.PORT || 3001;
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 Server running on port ${port}`);
  } catch (error) {
    console.error('❌ FATAL ERROR during startup:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// ✅ Handle unhandled promise rejections globally
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

bootstrap();

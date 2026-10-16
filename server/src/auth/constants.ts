import { randomBytes } from 'crypto';

// HTTP and WebSocket authentication must share one secret. Production must
// provide a secret through the hosting environment; never ship a known fallback.
const isProduction =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is required in production. Generate a strong random secret and set it in the hosting environment.',
  );
}

// A per-process random secret keeps local development convenient without using
// a predictable credential. Local sessions reset whenever the server restarts.
export const JWT_SECRET =
  process.env.JWT_SECRET || randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET) {
  console.warn(
    'JWT_SECRET is not set. Using a temporary development-only secret; existing sessions will expire when the server restarts.',
  );
}

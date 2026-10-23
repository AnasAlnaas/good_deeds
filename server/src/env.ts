// Settings come from environment variables. In development they can sit in
// server/.env (copy .env.example); on the server machine, set them for real.

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: use the environment as it is.
}

const isProduction = process.env.NODE_ENV === 'production';

const databaseUrl = process.env.DATABASE_URL || undefined;
if (isProduction && !databaseUrl) throw new Error('DATABASE_URL must be set in production.');

const pgliteDir = process.env.PGLITE_DIR ?? '.data/pglite';

const JWT_SECRET_MIN = 32;

/**
 * The secret that signs sign-in tokens. A real database (DATABASE_URL) or
 * NODE_ENV=production needs JWT_SECRET, whatever NODE_ENV says about the other.
 * Development on PGlite makes a random one and keeps it next to the database
 * folder, so no secret is ever written in the code. Called only by the server
 * itself (src/node.ts), so the command-line scripts work without it.
 */
export function jwtSecret(): string {
  const value = process.env.JWT_SECRET;
  const real = isProduction || !!databaseUrl;
  if (value) {
    if (real && value.length < JWT_SECRET_MIN) throw new Error(`JWT_SECRET must be at least ${JWT_SECRET_MIN} characters (e.g. \`openssl rand -hex 32\`).`);
    return value;
  }
  if (real) throw new Error('JWT_SECRET must be set when DATABASE_URL is set or NODE_ENV=production (e.g. `openssl rand -hex 32`).');
  const file = join(dirname(pgliteDir), 'jwt-secret');
  try {
    const stored = readFileSync(file, 'utf8').trim();
    if (stored) return stored;
  } catch {
    // Not made yet.
  }
  const secret = randomBytes(32).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  /** Empty = PGlite in `pgliteDir` (development only). */
  databaseUrl,
  pgliteDir,
  /** Demo data is loaded only into an empty development database: PGlite, never a DATABASE_URL one. */
  mayLoadDemoData: !isProduction && !databaseUrl,
  /** `console` prints sign-in codes in the server log; `none` refuses to send until an SMS provider is added. */
  loginCodeDelivery: (process.env.LOGIN_CODE_DELIVERY ?? (isProduction ? 'none' : 'console')) as 'console' | 'none',
  /** `expo` sends through Expo's push service; `console` prints them (development); `none` turns them off. */
  pushDelivery: (process.env.PUSH_DELIVERY ?? (isProduction ? 'expo' : 'console')) as 'expo' | 'console' | 'none',
  /** Only needed if "enhanced push security" is on in the EAS dashboard. */
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  /** Times in notifications are written in this zone, wherever the server runs. */
  timeZone: process.env.TIME_ZONE || 'Africa/Tripoli',
  /** Lets an outside scheduler call POST /api/internal/tick. Empty = that endpoint is off. */
  cronSecret: process.env.CRON_SECRET || undefined,
  /**
   * Web origins allowed to call the API (the admin panel, the app's web build). Empty = any origin.
   * The phone app is not affected; set this in production once the admin panel has its address.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  /**
   * `1` = the server sits behind a reverse proxy (nginx, Caddy) that sets X-Forwarded-For,
   * so the caller's address for the sign-in limits is read from it. Otherwise the
   * connection's own address is used (a client could forge the header).
   */
  trustProxy: process.env.TRUST_PROXY === '1',
};

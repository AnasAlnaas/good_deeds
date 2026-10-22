// Settings come from environment variables. In development they can sit in
// server/.env (copy .env.example); on the server machine, set them for real.

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: use the environment as it is.
}

const isProduction = process.env.NODE_ENV === 'production';

function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (value) return value;
  if (isProduction) throw new Error('JWT_SECRET must be set in production.');
  return 'development-only-secret-do-not-use-in-production';
}

const databaseUrl = process.env.DATABASE_URL || undefined;
if (isProduction && !databaseUrl) throw new Error('DATABASE_URL must be set in production.');

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  /** Empty = PGlite in `pgliteDir` (development only). */
  databaseUrl,
  pgliteDir: process.env.PGLITE_DIR ?? '.data/pglite',
  jwtSecret: jwtSecret(),
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
};

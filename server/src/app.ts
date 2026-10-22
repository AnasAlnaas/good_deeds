// The API as one Hono app. It does not know where it runs: src/node.ts serves
// it on a VPS or a laptop, and the same app can be mounted on Vercel later.
// Tests build it with an in-memory database and a fixed clock.

import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { cors } from 'hono/cors';

import type { ErrorBody } from '../../shared/api';
import { type AppDeps, type AppEnv, errorResponse } from './http';
import { closeDueAndNotify } from './notify';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { eventRoutes } from './routes/events';
import { attendanceRoutes, meRoutes, userRoutes } from './routes/me';

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use(cors({ origin: deps.corsOrigins.length ? deps.corsOrigins : '*' }));
  app.use(async (c, next) => {
    c.set('deps', deps);
    await next();
  });
  app.onError(errorResponse);
  app.notFound((c) => c.json<ErrorBody>({ error: 'not_found' }, 404));

  app.get('/health', (c) => c.json({ ok: true, service: 'good-deeds-api', time: new Date(deps.now()).toISOString() }));

  app.route('/auth', authRoutes);
  app.route('/events', eventRoutes);
  app.route('/me', meRoutes);
  app.route('/attendance', attendanceRoutes);
  app.route('/users', userRoutes);
  app.route('/admin', adminRoutes);

  // For an outside scheduler (e.g. Vercel Cron). On a VPS, src/node.ts runs the same job on a timer.
  if (deps.cronSecret) {
    app.post('/internal/tick', bearerAuth({ token: deps.cronSecret }), async (c) =>
      c.json({ closed: await closeDueAndNotify(deps) }),
    );
  }

  return app;
}

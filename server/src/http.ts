// What every endpoint shares: the app's dependencies, the signed-in user,
// reading a JSON body, and turning errors into `{ "error": code }` responses.

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

import type { ErrorBody, ServerErrorCode } from '../../shared/api';
import { ApiError, type ApiErrorCode } from '../../shared/errors';
import type { User } from '../../shared/types';
import type { Database } from './db/client';
import type { SendPush } from './push';

export interface AppDeps {
  db: Database;
  /** The server's clock. The rules never use the phone's time; tests pass a fixed clock. */
  now: () => number;
  jwtSecret: string;
  /** Delivers a sign-in code (SMS later). `null` = no delivery set up: sign-in is refused. */
  sendLoginCode: ((phone: string, code: string) => Promise<void>) | null;
  /** Delivers push notifications. `null` = notifications are off. */
  sendPush: SendPush | null;
  /** Runs work the answer should not wait for (notifications). Tests collect it to wait on. */
  runLater: (task: () => Promise<void>) => void;
  cronSecret?: string;
  /** Empty = any origin. */
  corsOrigins: string[];
}

export type AppEnv = { Variables: { deps: AppDeps; user: User } };
export type AppContext = Context<AppEnv>;

export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ServerErrorCode;
  constructor(status: ContentfulStatusCode, code: ServerErrorCode) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// A rule violation is 409 unless it is about who you are or what exists.
const RULE_STATUS: Partial<Record<ApiErrorCode, ContentfulStatusCode>> = {
  not_found: 404,
  not_organizer: 403,
  cannot_record_self: 403,
  not_your_attendance: 403,
  gender_not_allowed: 403,
};

export function errorResponse(err: Error, c: Context): Response {
  if (err instanceof ApiError) return c.json<ErrorBody>({ error: err.code }, RULE_STATUS[err.code] ?? 409);
  if (err instanceof HttpError) return c.json<ErrorBody>({ error: err.code }, err.status);
  if (err instanceof HTTPException && err.status < 500) {
    return c.json<ErrorBody>({ error: err.status === 401 ? 'unauthorized' : 'invalid_request' }, err.status);
  }
  console.error(err);
  return c.json<ErrorBody>({ error: 'internal_error' }, 500);
}

/** Reads and checks a JSON body. An empty body counts as `{}`. */
export async function readBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const text = await c.req.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'invalid_request');
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'invalid_request');
  return parsed.data;
}

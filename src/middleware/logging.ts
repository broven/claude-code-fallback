import { MiddlewareHandler, Context } from "hono";
import { randomUUID } from "crypto";
import { logDb, RequestLog } from "../db";

// Type for logging context stored in Hono's context
export interface LogContext {
  requestId: string;
  startTime: number;
  requestBody: any;
  requestHeaders: Record<string, string>;
  providerUsed: string | null;
  fallbackTriggered: boolean;
  attemptCount: number;
}

// Helper to set log context
export function setLogContext(c: Context, key: keyof LogContext, value: any) {
  const ctx = (c.get("logContext") as LogContext) || {
    requestId: randomUUID(),
    startTime: Date.now(),
    requestBody: null,
    requestHeaders: {},
    providerUsed: null,
    fallbackTriggered: false,
    attemptCount: 0,
  };
  (ctx as any)[key] = value;
  c.set("logContext", ctx);
}

// Helper to get log context
export function getLogContext(c: Context): LogContext | null {
  return c.get("logContext") as LogContext | null;
}

// Log a completed request
export function logRequest(
  c: Context,
  response: Response,
  responseBody?: string | null
) {
  const ctx = getLogContext(c);
  if (!ctx) return;

  const duration = Date.now() - ctx.startTime;

  // Get response headers
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const log: RequestLog = {
    requestId: ctx.requestId,
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    requestHeaders: JSON.stringify(ctx.requestHeaders),
    requestBody: JSON.stringify(ctx.requestBody),
    model: ctx.requestBody?.model || null,
    responseStatus: response.status,
    responseHeaders: JSON.stringify(responseHeaders),
    responseBody: responseBody || null,
    providerUsed: ctx.providerUsed,
    fallbackTriggered: ctx.fallbackTriggered ? 1 : 0,
    attemptCount: ctx.attemptCount,
    durationMs: duration,
  };

  logDb.insertLog(log);
}

// Middleware that initializes logging context
export const loggingMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = randomUUID();
  const startTime = Date.now();

  // Initialize log context
  c.set("logContext", {
    requestId,
    startTime,
    requestBody: null,
    requestHeaders: c.req.header(),
    providerUsed: null,
    fallbackTriggered: false,
    attemptCount: 0,
  } as LogContext);

  await next();
};

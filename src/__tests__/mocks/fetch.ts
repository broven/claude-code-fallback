import { vi } from 'vitest';
import { successResponse, errorResponses } from '../fixtures/requests';

/**
 * Create a mock Response object
 */
export function createMockResponse(
  body: unknown,
  init: ResponseInit = {}
): Response {
  const { status = 200, headers = {} } = init;
  const responseHeaders = new Headers(headers as HeadersInit);

  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/json');
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

/**
 * Create a successful API response
 */
export function createSuccessResponse(data: unknown = successResponse): Response {
  return createMockResponse(data, { status: 200 });
}

/**
 * Create an error response
 */
export function createErrorResponse(
  status: number,
  body: unknown = errorResponses.serverError
): Response {
  return createMockResponse(body, { status });
}

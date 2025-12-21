/**
 * Centralized error handling wrapper for API routes
 * Note: This complements the existing apiErrorHandler.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../utils/logger';

type ApiHandler = (req: NextRequest, ...args: unknown[]) => Promise<NextResponse>;

/**
 * Wraps an API route handler with centralized error handling and logging
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (req: NextRequest, ...args: unknown[]) => {
    const startTime = Date.now();
    const path = req.nextUrl.pathname;

    try {
      const response = await handler(req, ...args);

      const duration = Date.now() - startTime;
      logger.info('API request completed', {
        method: req.method,
        path,
        status: response.status,
        duration
      });

      return response;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;

      logger.error('API request failed', error, {
        method: req.method,
        path,
        duration
      });

      // Don't expose internal error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';

      return NextResponse.json(
        {
          success: false,
          error: 'Internal Server Error',
          ...(isDevelopment && { details: errorMessage })
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  message: string = 'An error occurred',
  status: number = 500
): NextResponse {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorDetails = error instanceof Error ? error.message : String(error);

  logger.error(message, error);

  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(isDevelopment && { details: errorDetails })
    },
    { status }
  );
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  headers?: Record<string, string>
): NextResponse {
  const response = NextResponse.json(
    {
      success: true,
      data
    },
    { status }
  );

  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}


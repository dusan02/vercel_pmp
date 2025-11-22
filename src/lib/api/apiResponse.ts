/**
 * Centralized API Response Helpers
 * Provides consistent response formatting across all endpoints
 */

import { NextResponse } from 'next/server';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

// Re-export ApiResponse from types.ts for convenience
export type { ApiResponse };

/**
 * Create success response
 */
export function createSuccessResponse<T>(
  data: T,
  options: {
    cached?: boolean;
    cacheAge?: number;
    duration?: number;
    count?: number;
    headers?: Record<string, string>;
    status?: number;
  } = {}
): NextResponse<ApiResponse<T>> {
  const {
    cached = false,
    cacheAge,
    duration,
    count,
    headers = {},
    status = 200
  } = options;

  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(cached !== undefined && { cached }),
    ...(cacheAge !== undefined && { cacheAge }),
    ...(duration !== undefined && { duration }),
    ...(count !== undefined && { count })
  };

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cached && { 'X-Cache': 'HIT' }),
    ...(cacheAge !== undefined && { 'X-Cache-Age': cacheAge.toString() }),
    ...(duration !== undefined && { 'X-Duration-ms': duration.toString() }),
    ...headers
  };

  return NextResponse.json(response, { status, headers: responseHeaders });
}

/**
 * Create error response
 */
export function createErrorResponse(
  error: Error | unknown,
  message?: string,
  status: number = 500,
  headers: Record<string, string> = {}
): NextResponse<ApiResponse> {
  const errorMessage = message || (error instanceof Error ? error.message : 'Internal server error');

  logger.error({ err: error }, errorMessage);

  const response: ApiResponse = {
    success: false,
    error: errorMessage,
    message: errorMessage
  };

  return NextResponse.json(response, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

/**
 * Create validation error response
 */
export function createValidationErrorResponse(
  errors: string[] | string,
  status: number = 400
): NextResponse<ApiResponse> {
  const errorList = Array.isArray(errors) ? errors : [errors];

  return NextResponse.json(
    {
      success: false,
      error: 'Validation error',
      message: errorList.join(', '),
      errors: errorList
    },
    {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}


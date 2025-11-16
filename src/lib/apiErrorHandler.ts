/**
 * Centralized error handling for API endpoints
 */

import { NextResponse } from 'next/server';
import { ApiResponse } from './types';

export interface ApiError {
  message: string;
  statusCode: number;
  details?: string;
  code?: string;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = 'Internal server error',
  defaultStatusCode: number = 500
): NextResponse<ApiResponse<never>> {
  let message = defaultMessage;
  let statusCode = defaultStatusCode;
  let details: string | undefined;

  if (error instanceof Error) {
    message = error.message || defaultMessage;
    details = error.stack;
    
    // Handle specific error types
    if (error.name === 'PrismaClientKnownRequestError') {
      statusCode = 400;
      message = 'Database error';
    } else if (error.name === 'AbortError') {
      statusCode = 408;
      message = 'Request timeout';
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  console.error(`❌ API Error [${statusCode}]:`, message, details ? `\n${details}` : '');

  return NextResponse.json(
    {
      success: false,
      error: message,
      details,
    },
    { status: statusCode }
  );
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  statusCode: number = 200,
  headers?: Record<string, string>
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { 
      status: statusCode,
      ...(headers ? { headers } : {})
    }
  );
}

/**
 * Wraps an async API handler with error handling
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}

/**
 * Validates required parameters
 */
export function validateRequiredParams(
  params: Record<string, unknown>,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing = required.filter(key => !params[key] || params[key] === '');
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Creates a validation error response
 */
export function createValidationErrorResponse(
  missing: string[]
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    {
      success: false,
      error: 'Missing required parameters',
      details: `Missing: ${missing.join(', ')}`,
    },
    { status: 400 }
  );
}


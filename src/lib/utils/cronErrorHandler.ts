/**
 * Cron Job Error Handler Utilities
 * Shared error handling patterns for cron job endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { addToDLQ } from '@/lib/dlq';

/**
 * Handle cron job error and return standardized error response.
 * Also records the failure in the DLQ (fire-and-forget, never blocks the response).
 */
export function handleCronError(
  error: unknown,
  jobName: string
): NextResponse {
  console.error(`❌ Error in ${jobName}:`, error);

  // Record failure in the dead-letter queue for later inspection/retry.
  // Fire-and-forget: DLQ is best-effort and must never block or throw here.
  void addToDLQ(jobName, undefined, error).catch(() => {});

  return NextResponse.json({
    success: false,
    error: 'Internal server error',
    message: error instanceof Error ? error.message : 'Unknown error',
    timestamp: new Date().toISOString(),
  }, { status: 500 });
}

/**
 * Create standardized success response for cron jobs
 */
export function createCronSuccessResponse(data: {
  message: string;
  results?: any;
  summary?: any;
}): NextResponse {
  return NextResponse.json({
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Helper for GET endpoints that just call POST handler
 * Useful for manual testing of cron jobs
 */
export async function createGetEndpointWrapper(
  request: NextRequest,
  postHandler: (request: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await postHandler(request);
  } catch (error) {
    return handleCronError(error, 'GET endpoint wrapper');
  }
}

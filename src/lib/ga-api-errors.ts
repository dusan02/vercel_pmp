/**
 * Google Analytics API error tracking utility
 * 
 * This module provides a helper function to track API errors in GA4.
 * Use this in catch blocks or error handlers for fetch requests.
 */

import { event } from './ga';

/**
 * Track an API error event
 * @param endpoint - The API endpoint that failed (e.g., '/api/stocks', '/api/heatmap')
 * @param status - HTTP status code (e.g., 404, 500, 0 for network errors)
 * @param errorMessage - Optional error message for debugging
 */
export function trackApiError(
  endpoint: string,
  status: number,
  errorMessage?: string
): void {
  event('api_error', {
    endpoint,
    status,
    ...(errorMessage && { error_message: errorMessage })
  });
}


/**
 * Zod validation schemas for API routes
 */

import { z } from 'zod';

// Tickers validation
export const tickersSchema = z.object({
  symbols: z.array(z.string().min(1).max(10)).min(1).max(500),
  session: z.enum(['pre', 'regular', 'post', 'live', 'after', 'closed']).optional()
});

// Session parameter validation
export const sessionSchema = z.enum(['pre', 'live', 'after', 'closed']).optional();

// Market endpoint validation
export const marketQuerySchema = z.object({
  tickers: z.string().min(1).optional(), // Comma-separated tickers
  session: sessionSchema,
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  project: z.string().optional()
});

// Heatmap validation
export const heatmapQuerySchema = z.object({
  session: sessionSchema,
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  reverse: z.coerce.boolean().optional().default(true)
});

// Helper to parse and validate request body
export async function parseRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation error: ${parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      };
    }
    
    return { success: true, data: parsed.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid request body'
    };
  }
}

// Helper to parse and validate query parameters
export function parseQueryParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const params: Record<string, unknown> = {};
    
    // Convert URLSearchParams to object
    for (const [key, value] of searchParams.entries()) {
      // Handle arrays (comma-separated)
      if (value.includes(',')) {
        params[key] = value.split(',').map(v => v.trim());
      } else {
        params[key] = value;
      }
    }
    
    const parsed = schema.safeParse(params);
    
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation error: ${parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      };
    }
    
    return { success: true, data: parsed.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid query parameters'
    };
  }
}


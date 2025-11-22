/**
 * Admin API for Dead-Letter Queue management
 * GET: List failed jobs
 * POST: Requeue a job
 * DELETE: Clear DLQ
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDLQJobs, removeFromDLQ, clearDLQ, getDLQStats, shouldRetry } from '@/lib/dlq';
import { logger } from '@/lib/utils/logger';
import { ingestBatch } from '@/workers/polygonWorker';

// Simple auth check (in production, use proper authentication)
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const apiKey = process.env.ADMIN_API_KEY;

  if (!apiKey) {
    // If no API key is set, allow in development
    return process.env.NODE_ENV === 'development';
  }

  return authHeader === `Bearer ${apiKey}`;
}

/**
 * GET /api/admin/dlq - List failed jobs
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const stats = searchParams.get('stats') === 'true';

    if (stats) {
      const statsData = await getDLQStats();
      return NextResponse.json({
        success: true,
        data: statsData
      });
    }

    const jobs = await getDLQJobs(type, limit);

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        count: jobs.length
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get DLQ jobs');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/dlq/requeue - Requeue a failed job
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { jobId, requeueAll } = body;

    if (requeueAll) {
      // Requeue all jobs that should be retried
      const jobs = await getDLQJobs();
      const jobsToRequeue = jobs.filter(shouldRetry);

      let requeued = 0;
      let failed = 0;

      for (const job of jobsToRequeue) {
        try {
          if (job.type === 'ingest' && job.payload && typeof job.payload === 'object') {
            const payload = job.payload as { symbol?: string; tickers?: string[] };
            const apiKey = process.env.POLYGON_API_KEY;

            if (!apiKey) {
              logger.error('POLYGON_API_KEY not set');
              failed++;
              continue;
            }

            if (payload.tickers && Array.isArray(payload.tickers)) {
              await ingestBatch(payload.tickers, apiKey);
              await removeFromDLQ(job.id);
              requeued++;
            } else if (payload.symbol) {
              await ingestBatch([payload.symbol], apiKey);
              await removeFromDLQ(job.id);
              requeued++;
            } else {
              failed++;
            }
          } else {
            failed++;
          }
        } catch (error) {
          logger.error({ err: error }, `Failed to requeue job ${job.id}`);
          failed++;
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          requeued,
          failed,
          total: jobsToRequeue.length
        }
      });
    }

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId is required' },
        { status: 400 }
      );
    }

    // Get the job from DLQ
    const jobs = await getDLQJobs();
    const job = jobs.find(j => j.id === jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Requeue based on job type
    if (job.type === 'ingest' && job.payload && typeof job.payload === 'object') {
      const payload = job.payload as { symbol?: string; tickers?: string[] };
      const apiKey = process.env.POLYGON_API_KEY;

      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: 'POLYGON_API_KEY not set' },
          { status: 500 }
        );
      }

      if (payload.tickers && Array.isArray(payload.tickers)) {
        await ingestBatch(payload.tickers, apiKey);
      } else if (payload.symbol) {
        await ingestBatch([payload.symbol], apiKey);
      } else {
        return NextResponse.json(
          { success: false, error: 'Invalid job payload' },
          { status: 400 }
        );
      }

      // Remove from DLQ after successful requeue
      await removeFromDLQ(jobId);

      return NextResponse.json({
        success: true,
        data: { message: 'Job requeued successfully', jobId }
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported job type' },
      { status: 400 }
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to requeue job');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/dlq - Clear DLQ
 */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const count = await clearDLQ();

    return NextResponse.json({
      success: true,
      data: { message: `Cleared ${count} jobs from DLQ`, count }
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to clear DLQ');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


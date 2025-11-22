import { NextRequest, NextResponse } from 'next/server';
import { blogScheduler } from '@/lib/jobs/blogScheduler';

export async function POST(request: NextRequest) {
  try {
    // Check for basic authentication or API key
    const authHeader = request.headers.get('authorization');
    const apiKey = request.headers.get('x-api-key');

    // Simple API key check (you should use a proper secret)
    const validApiKey = process.env.BLOG_API_KEY || 'dev-key-12345';

    if (!apiKey || apiKey !== validApiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Trigger blog generation manually
    await blogScheduler.triggerNow();

    return NextResponse.json({
      success: true,
      message: 'Blog report generated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Manual blog generation error:', error);
    return NextResponse.json({
      error: 'Failed to generate blog report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    info: 'Blog generation API',
    endpoints: {
      POST: '/api/blog/generate - Manually trigger blog generation',
      'GET /api/blog/daily-report': 'View latest daily report',
      'GET /api/blog/daily-report?format=json': 'Get report data as JSON'
    },
    authentication: 'Required: x-api-key header',
    note: 'Use POST to manually trigger blog generation'
  });
}
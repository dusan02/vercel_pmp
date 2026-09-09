import { handlers } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

// Wrap handlers with error handling to return JSON instead of HTML
async function handleRequest(
  handler: (req: NextRequest) => Promise<Response>,
  req: NextRequest
): Promise<Response> {
  try {
    const response = await handler(req);
    return response;
  } catch (error) {
    // If error occurs, return JSON response instead of HTML
    console.error('Auth.js error:', error);
    return NextResponse.json(
      {
        error: 'Authentication error',
        message: error instanceof Error ? error.message : 'Internal Server Error'
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(handlers.GET, req);
}

export async function POST(req: NextRequest) {
  return handleRequest(handlers.POST, req);
}

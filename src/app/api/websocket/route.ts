import { NextRequest, NextResponse } from 'next/server';

// WebSocket status endpoint
export async function GET(request: NextRequest) {
  try {
    // Check if websocket server is available (set in server.ts)
    const websocketServer = (global as any).websocketServer;
    
    if (!websocketServer) {
      return NextResponse.json({
        success: true,
        data: {
          isRunning: false,
          connectedClients: 0,
          topTickers: 50,
          lastUpdate: null,
          message: 'WebSocket server not initialized - make sure server.ts is running'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get Socket.io server instance
    const io = (websocketServer as any).io;
    const connectedClients = io ? io.sockets.sockets.size : 0;
    const isRunning = (websocketServer as any).isRunning || false;

    return NextResponse.json({
      success: true,
      data: {
        isRunning,
        connectedClients,
        topTickers: 50,
        lastUpdate: null,
        message: isRunning 
          ? 'WebSocket server is running and ready for connections'
          : 'WebSocket server initialized but not started'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting WebSocket status:', error);
    return NextResponse.json(
      { error: 'Failed to get WebSocket status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    const websocketServer = (global as any).websocketServer;

    if (!websocketServer) {
      return NextResponse.json({
        success: false,
        error: 'WebSocket server not initialized - make sure server.ts is running',
        timestamp: new Date().toISOString()
      });
    }

    switch (action) {
      case 'start':
        try {
          await (websocketServer as any).startRealTimeUpdates();
          return NextResponse.json({
            success: true,
            message: 'WebSocket real-time updates started',
            timestamp: new Date().toISOString()
          });
        } catch (error: any) {
          return NextResponse.json({
            success: false,
            error: `Failed to start: ${error.message}`,
            timestamp: new Date().toISOString()
          });
        }

      case 'stop':
        try {
          (websocketServer as any).stopRealTimeUpdates();
          return NextResponse.json({
            success: true,
            message: 'WebSocket real-time updates stopped',
            timestamp: new Date().toISOString()
          });
        } catch (error: any) {
          return NextResponse.json({
            success: false,
            error: `Failed to stop: ${error.message}`,
            timestamp: new Date().toISOString()
          });
        }

      case 'restart':
        try {
          (websocketServer as any).stopRealTimeUpdates();
          await new Promise(resolve => setTimeout(resolve, 500));
          await (websocketServer as any).startRealTimeUpdates();
          return NextResponse.json({
            success: true,
            message: 'WebSocket real-time updates restarted',
            timestamp: new Date().toISOString()
          });
        } catch (error: any) {
          return NextResponse.json({
            success: false,
            error: `Failed to restart: ${error.message}`,
            timestamp: new Date().toISOString()
          });
        }

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: start, stop, or restart'
        });
    }

  } catch (error) {
    console.error('Error managing WebSocket:', error);
    return NextResponse.json(
      { error: 'Failed to manage WebSocket' },
      { status: 500 }
    );
  }
} 
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { WebSocketPriceServer } from './src/lib/websocket-server';
import { initializeSectorIndustryScheduler } from './src/lib/jobs/sectorIndustryScheduler';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
// Force port to 3000 if not explicitly set, or use environment variable
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Debug: Log the actual port being used
console.log(`🔍 DEBUG: process.env.PORT = ${process.env.PORT || 'undefined'}`);
console.log(`🔍 DEBUG: Using port = ${port}`);

// Prepare the Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Create Socket.io server
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? ['https://premarketprice.com', 'https://www.premarketprice.com']
        : ['http://localhost:3000', 'http://localhost:3001'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // Initialize WebSocket price server
  const websocketServer = new WebSocketPriceServer(io);
  // Type assertion for global assignment
  (global as any).websocketServer = websocketServer;

  // Start WebSocket real-time updates (only in production or when explicitly enabled)
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_WEBSOCKET === 'true') {
    websocketServer.startRealTimeUpdates().catch(error => {
      console.error('Failed to start WebSocket updates:', error);
    });
  }

  // Initialize sector/industry scheduler (runs daily at 02:00 UTC)
  initializeSectorIndustryScheduler();
  // Store scheduler instance in global for API route access
  (global as any).sectorIndustrySchedulerInitialized = true;

  // Start the server
  server.listen(port, () => {
    console.log(`🚀 Next.js server ready on http://${hostname}:${port}`);
    console.log(`🔌 WebSocket server ready on ws://${hostname}:${port}`);

    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_WEBSOCKET === 'true') {
      console.log('📡 WebSocket real-time updates: ENABLED');
    } else {
      console.log('📡 WebSocket real-time updates: DISABLED (set ENABLE_WEBSOCKET=true to enable)');
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    websocketServer.stopRealTimeUpdates();
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    websocketServer.stopRealTimeUpdates();
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}); 
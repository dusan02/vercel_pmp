/**
 * WebSocket Server Entry Point
 */
import { createServer } from 'http';
import { Server } from 'socket.io';
import { WebSocketPriceServer } from '../src/lib/websocket-server';

const port = parseInt(process.env.WS_PORT || '3002', 10);
const httpServer = createServer();
const origin = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '*';

const io = new Server(httpServer, {
  cors: {
    origin: origin === '*' ? true : origin,
    methods: ['GET', 'POST']
  }
});

const wsServer = new WebSocketPriceServer(io);
wsServer.startRealTimeUpdates();

httpServer.listen(port, () => {
  console.log(`🚀 WebSocket server listening on port ${port}`);
});


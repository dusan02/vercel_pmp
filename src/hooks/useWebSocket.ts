'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { PriceUpdate, BatchPriceUpdate } from '@/lib/types';

interface WebSocketStatus {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastUpdate: number | null;
  connectedClients: number;
  isImplemented: boolean; // New: Track if WebSocket is actually implemented
}

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  onPriceUpdate?: (updates: PriceUpdate[]) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  favorites?: string[]; // New: Favorites tickers to subscribe to
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 3000,
    onPriceUpdate,
    onConnect,
    onDisconnect,
    onError,
    favorites = []
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastUpdate: null,
    connectedClients: 0,
    isImplemented: false // Default to false
  });

  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Store callbacks in refs to avoid dependency issues
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  
  // Update refs when callbacks change
  useEffect(() => {
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
    onPriceUpdateRef.current = onPriceUpdate;
  }, [onConnect, onDisconnect, onError, onPriceUpdate]);

  // Check if WebSocket server is implemented (with throttling)
  const checkWebSocketStatus = useCallback(async () => {
    // Throttle: only check once per 60 seconds
    const lastCheckKey = 'websocket_last_check';
    const lastCheck = typeof window !== 'undefined' ? parseInt(sessionStorage.getItem(lastCheckKey) || '0', 10) : 0;
    const now = Date.now();
    if (now - lastCheck < 60000) {
      // Return cached status if available
      const cachedStatus = typeof window !== 'undefined' ? sessionStorage.getItem('websocket_status') : null;
      if (cachedStatus === 'false') {
        return false;
      }
    }
    
    try {
      const response = await fetch('/api/websocket');
      const data = await response.json();
      
      // Cache the check time
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(lastCheckKey, now.toString());
        sessionStorage.setItem('websocket_status', data.success && data.data?.isRunning ? 'true' : 'false');
      }
      
      if (data.success && data.data) {
        // WebSocket je implementovaný len ak isRunning je true a message neobsahuje "not yet implemented"
        const isImplemented = data.data.isRunning === true && 
                             !data.data.message?.includes('not yet implemented');
        
        setStatus(prev => ({ ...prev, isImplemented }));
        
        if (!isImplemented) {
          console.log('ℹ️ WebSocket server not yet implemented - using background updates');
          setStatus(prev => ({ 
            ...prev, 
            error: 'WebSocket server not yet implemented - using background updates',
            isConnecting: false,
            isConnected: false
          }));
          return false;
        }
        return true;
      }
      return false;
    } catch (error) {
      console.warn('⚠️ Could not check WebSocket status:', error);
      return false;
    }
  }, []);

  // Initialize socket connection
  const connect = useCallback(async () => {
    if (socketRef.current?.connected) {
      return;
    }

    // Check if WebSocket is implemented first
    const isImplemented = await checkWebSocketStatus();
    if (!isImplemented) {
      console.log('🚫 WebSocket not implemented - skipping connection attempt');
      return; // Don't try to connect if not implemented
    }

    console.log('🔌 Attempting to connect to WebSocket server...');
    setStatus(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Create socket connection
      socketRef.current = io(process.env.NODE_ENV === 'production' 
        ? 'https://premarketprice.com' 
        : 'http://localhost:3000', {
        transports: ['websocket', 'polling'],
        timeout: 30000, // Increased timeout to 30 seconds
        reconnection: false // We'll handle reconnection manually
      });

      // Connection events
      socketRef.current.on('connect', () => {
        console.log('🔌 WebSocket connected');
        setStatus(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null
        }));
        reconnectAttemptsRef.current = 0;
        onConnectRef.current?.();
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('🔌 WebSocket disconnected:', reason);
        setStatus(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false
        }));
        onDisconnectRef.current?.();

        // Handle reconnection
        if (reconnectAttemptsRef.current < reconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`🔄 Attempting to reconnect (${reconnectAttemptsRef.current}/${reconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else {
          setStatus(prev => ({
            ...prev,
            error: 'Failed to reconnect after multiple attempts'
          }));
          onErrorRef.current?.('Failed to reconnect after multiple attempts');
        }
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('❌ WebSocket connection error:', error);
        setStatus(prev => ({
          ...prev,
          isConnecting: false,
          error: error.message
        }));
        onErrorRef.current?.(error.message);
      });

      // Price update events
      socketRef.current.on('priceUpdate', (data: BatchPriceUpdate) => {
        console.log('📡 Received price updates:', data.updates.length, 'tickers');
        setStatus(prev => ({
          ...prev,
          lastUpdate: data.timestamp
        }));
        onPriceUpdateRef.current?.(data.updates);
      });

      // Ping/pong for connection health
      socketRef.current.on('pong', (data) => {
        console.log('🏓 WebSocket pong received:', data.timestamp);
      });

    } catch (error) {
      console.error('❌ Error creating WebSocket connection:', error);
      setStatus(prev => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      onErrorRef.current?.(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [reconnectAttempts, reconnectDelay, checkWebSocketStatus]); // Added checkWebSocketStatus dependency

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setStatus(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      error: null,
      lastUpdate: null,
      connectedClients: 0
    }));
  }, []);

  // Send ping to test connection
  const ping = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('ping');
    }
  }, []);

  // Subscribe to specific tickers
  const subscribe = useCallback((tickers: string[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', tickers);
    }
  }, []);

  // Subscribe to favorites tickers
  const subscribeFavorites = useCallback((favorites: string[]) => {
    if (socketRef.current?.connected && favorites.length > 0) {
      console.log('📡 Subscribing to favorites:', favorites);
      socketRef.current.emit('subscribeFavorites', favorites);
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [autoConnect]); // Removed connect and disconnect from dependencies

  // Subscribe to favorites when connected and favorites change
  useEffect(() => {
    if (status.isConnected && favorites.length > 0) {
      subscribeFavorites(favorites);
    }
  }, [status.isConnected, favorites, subscribeFavorites]);

  return {
    status,
    connect,
    disconnect,
    ping,
    subscribe,
    subscribeFavorites,
    socket: socketRef.current
  };
} 
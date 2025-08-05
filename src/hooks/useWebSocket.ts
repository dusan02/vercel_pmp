'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { PriceUpdate, BatchPriceUpdate } from '@/lib/websocket-server';

interface WebSocketStatus {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastUpdate: number | null;
  connectedClients: number;
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
    connectedClients: 0
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

  // Initialize socket connection
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

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
  }, [reconnectAttempts, reconnectDelay]); // Removed callback dependencies

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

    setStatus({
      isConnected: false,
      isConnecting: false,
      error: null,
      lastUpdate: null,
      connectedClients: 0
    });
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
'use client';

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface WebSocketStatusProps {
  showDetails?: boolean;
  className?: string;
}

export function WebSocketStatus({ showDetails = false, className = '' }: WebSocketStatusProps) {
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { status, connect, disconnect, ping } = useWebSocket({
    onConnect: () => {
      console.log('✅ WebSocket connected successfully');
    },
    onDisconnect: () => {
      console.log('❌ WebSocket disconnected');
    },
    onError: (error) => {
      console.error('❌ WebSocket error:', error);
    }
  });

  // Fetch server status
  const fetchServerStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/websocket');
      const data = await response.json();
      setServerStatus(data.success ? data.data : null);
    } catch (error) {
      console.error('Error fetching WebSocket status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Control WebSocket server
  const controlServer = async (action: 'start' | 'stop' | 'restart') => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/websocket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ WebSocket server ${action}ed successfully`);
        await fetchServerStatus(); // Refresh status
      } else {
        console.error(`❌ Failed to ${action} WebSocket server:`, data.error);
      }
    } catch (error) {
      console.error(`Error ${action}ing WebSocket server:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServerStatus();
    const interval = setInterval(fetchServerStatus, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    if (status.isConnecting) {
      return <RefreshCw className="w-4 h-4 animate-spin text-yellow-500" />;
    }
    if (status.isConnected) {
      return <Wifi className="w-4 h-4 text-green-500" />;
    }
    if (status.error) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    return <WifiOff className="w-4 h-4 text-gray-500" />;
  };

  const getStatusText = () => {
    if (status.isConnecting) return 'Connecting...';
    if (status.isConnected) return 'Connected';
    if (status.error) return 'Error';
    return 'Disconnected';
  };

  const getStatusColor = () => {
    if (status.isConnecting) return 'text-yellow-600';
    if (status.isConnected) return 'text-green-600';
    if (status.error) return 'text-red-600';
    return 'text-gray-600';
  };

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className={`websocket-status ${className}`}>
      {/* Basic Status */}
      <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
        {getStatusIcon()}
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
        
        {status.lastUpdate && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>Last update: {formatTimestamp(status.lastUpdate)}</span>
          </div>
        )}

        <button
          onClick={() => ping()}
          disabled={!status.isConnected}
          className="ml-auto p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
          title="Ping WebSocket"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Detailed Status */}
      {showDetails && (
        <div className="mt-3 space-y-3">
          {/* Client Controls */}
          <div className="flex gap-2">
            <button
              onClick={() => connect()}
              disabled={status.isConnected || status.isConnecting}
              className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              Connect
            </button>
            <button
              onClick={() => disconnect()}
              disabled={!status.isConnected}
              className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>

          {/* Server Status */}
          {serverStatus && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                Server Status
              </h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Running:</span>
                  <span className={serverStatus.isRunning ? 'text-green-600' : 'text-red-600'}>
                    {serverStatus.isRunning ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Connected Clients:</span>
                  <span>{serverStatus.connectedClients}</span>
                </div>
                <div className="flex justify-between">
                  <span>TOP Tickers:</span>
                  <span>{serverStatus.topTickers}</span>
                </div>
                {serverStatus.lastUpdate && (
                  <div className="flex justify-between">
                    <span>Last Update:</span>
                    <span>{new Date(serverStatus.lastUpdate).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>

              {/* Server Controls */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => controlServer('start')}
                  disabled={isLoading || serverStatus.isRunning}
                  className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                >
                  Start Server
                </button>
                <button
                  onClick={() => controlServer('stop')}
                  disabled={isLoading || !serverStatus.isRunning}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                >
                  Stop Server
                </button>
                <button
                  onClick={() => controlServer('restart')}
                  disabled={isLoading}
                  className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  Restart
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {status.error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
              <div className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>Error: {status.error}</span>
              </div>
            </div>
          )}

          {/* Connection Info */}
          <div className="text-xs text-gray-500 space-y-1">
            <div>Client ID: {status.socket?.id || 'Not connected'}</div>
            <div>Transport: {status.socket?.io?.engine?.transport?.name || 'Unknown'}</div>
          </div>
        </div>
      )}
    </div>
  );
} 
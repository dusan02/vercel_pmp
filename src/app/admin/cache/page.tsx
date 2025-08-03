'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Activity, Database, Zap } from 'lucide-react';

interface CacheStatus {
  redisConnected: boolean;
  memoryFallback: boolean;
  lastTest: string;
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
  hitRate: number;
  averageResponseTime: number;
  errors: string[];
}

interface CacheKey {
  key: string;
  ttl: number;
  size: number;
  lastAccessed?: string;
}

export default function AdminCachePage() {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [cacheKeys, setCacheKeys] = useState<CacheKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCacheStatus = async () => {
    try {
      const response = await fetch('/api/cache/status?test=true');
      const data = await response.json();
      
      if (data.success) {
        setCacheStatus(data.data);
      } else {
        setError(data.error || 'Failed to fetch cache status');
      }
    } catch (err) {
      setError('Failed to fetch cache status');
    }
  };

  const fetchCacheKeys = async () => {
    try {
      const response = await fetch('/api/admin/cache/keys');
      const data = await response.json();
      
      if (data.success) {
        setCacheKeys(data.data);
      } else {
        setError(data.error || 'Failed to fetch cache keys');
      }
    } catch (err) {
      setError('Failed to fetch cache keys');
    }
  };

  const invalidateCache = async (key?: string) => {
    try {
      const url = key ? `/api/admin/cache/invalidate?key=${encodeURIComponent(key)}` : '/api/admin/cache/invalidate';
      const response = await fetch(url, { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        await refreshData();
      } else {
        setError(data.error || 'Failed to invalidate cache');
      }
    } catch (err) {
      setError('Failed to invalidate cache');
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([fetchCacheStatus(), fetchCacheKeys()]);
    setRefreshing(false);
  };

  useEffect(() => {
    refreshData().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="container">
        <h1>Cache Administration</h1>
        <div className="loading">Loading cache information...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="admin-header">
        <h1>Cache Administration</h1>
        <button 
          onClick={refreshData} 
          disabled={refreshing}
          className="refresh-btn"
        >
          <RefreshCw className={refreshing ? 'spinning' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Cache Status */}
      {cacheStatus && (
        <section className="cache-status">
          <h2>Cache Status</h2>
          <div className="status-grid">
            <div className="status-card">
              <div className="status-icon">
                {cacheStatus.redisConnected ? <Database className="connected" /> : <Database className="disconnected" />}
              </div>
              <div className="status-info">
                <h3>Redis Connection</h3>
                <p className={cacheStatus.redisConnected ? 'connected' : 'disconnected'}>
                  {cacheStatus.redisConnected ? 'Connected' : 'Disconnected'}
                </p>
                {cacheStatus.memoryFallback && (
                  <small>Using memory fallback</small>
                )}
              </div>
            </div>

            <div className="status-card">
              <div className="status-icon">
                <Activity />
              </div>
              <div className="status-info">
                <h3>Performance</h3>
                <p>Hit Rate: {cacheStatus.hitRate}%</p>
                <p>Avg Response: {cacheStatus.averageResponseTime}ms</p>
              </div>
            </div>

            <div className="status-card">
              <div className="status-icon">
                <Zap />
              </div>
              <div className="status-info">
                <h3>Requests</h3>
                <p>Total: {cacheStatus.totalRequests}</p>
                <p>Hits: {cacheStatus.cacheHits}</p>
                <p>Misses: {cacheStatus.cacheMisses}</p>
              </div>
            </div>
          </div>

          {cacheStatus.errors.length > 0 && (
            <div className="errors-section">
              <h3>Recent Errors</h3>
              <ul className="error-list">
                {cacheStatus.errors.map((error, index) => (
                  <li key={index} className="error-item">{error}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Cache Keys */}
      <section className="cache-keys">
        <div className="section-header">
          <h2>Cache Keys ({cacheKeys.length})</h2>
          <button 
            onClick={() => invalidateCache()} 
            className="invalidate-all-btn"
            title="Invalidate all cache keys"
          >
            <Trash2 />
            Clear All
          </button>
        </div>

        <div className="keys-table">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>TTL</th>
                <th>Size</th>
                <th>Last Accessed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cacheKeys.map((cacheKey) => (
                <tr key={cacheKey.key}>
                  <td className="key-name">{cacheKey.key}</td>
                  <td>{cacheKey.ttl === -1 ? 'No TTL' : `${cacheKey.ttl}s`}</td>
                  <td>{cacheKey.size} bytes</td>
                  <td>{cacheKey.lastAccessed || 'Unknown'}</td>
                  <td>
                    <button 
                      onClick={() => invalidateCache(cacheKey.key)}
                      className="invalidate-btn"
                      title="Invalidate this key"
                    >
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--clr-primary);
          color: white;
          border: none;
          border-radius: var(--radius);
          cursor: pointer;
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .error-message {
          background: var(--clr-error-bg);
          color: var(--clr-error);
          padding: 1rem;
          border-radius: var(--radius);
          margin-bottom: 1rem;
        }

        .cache-status {
          margin-bottom: 2rem;
        }

        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .status-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: var(--clr-surface);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius);
        }

        .status-icon {
          font-size: 2rem;
        }

        .status-icon .connected {
          color: var(--clr-positive);
        }

        .status-icon .disconnected {
          color: var(--clr-negative);
        }

        .status-info h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1rem;
        }

        .status-info p {
          margin: 0.25rem 0;
          font-size: 0.875rem;
        }

        .status-info .connected {
          color: var(--clr-positive);
        }

        .status-info .disconnected {
          color: var(--clr-negative);
        }

        .status-info small {
          color: var(--clr-subtext);
          font-size: 0.75rem;
        }

        .errors-section {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--clr-error-bg);
          border-radius: var(--radius);
        }

        .error-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .error-item {
          padding: 0.5rem 0;
          border-bottom: 1px solid rgba(220, 38, 38, 0.2);
          font-size: 0.875rem;
        }

        .error-item:last-child {
          border-bottom: none;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .invalidate-all-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--clr-negative);
          color: white;
          border: none;
          border-radius: var(--radius);
          cursor: pointer;
        }

        .keys-table {
          overflow-x: auto;
        }

        .keys-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .keys-table th,
        .keys-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid var(--clr-border);
        }

        .keys-table th {
          background: var(--clr-bg);
          font-weight: 600;
        }

        .key-name {
          font-family: monospace;
          font-size: 0.875rem;
          word-break: break-all;
        }

        .invalidate-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.25rem;
          background: var(--clr-negative);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.75rem;
        }

        .loading {
          text-align: center;
          padding: 2rem;
          color: var(--clr-subtext);
        }
      `}</style>
    </div>
  );
} 
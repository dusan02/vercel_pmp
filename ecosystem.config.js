/**
 * PM2 Ecosystem Config
 * 
 * Manages all workers and processes for the PMP application
 */

module.exports = {
  apps: [
    {
      name: 'pmp-api',
      script: 'server.ts',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'pmp-polygon-worker',
      script: 'src/workers/polygonWorker.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        MODE: 'snapshot'
      },
      error_file: './logs/polygon-worker-error.log',
      out_file: './logs/polygon-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // Restart every 24 hours to prevent memory leaks
      cron_restart: '0 0 * * *'
    },
    {
      name: 'pmp-bulk-preloader',
      script: 'src/workers/backgroundPreloader.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/bulk-preloader-error.log',
      out_file: './logs/bulk-preloader-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: false, // Run once, then exit (cron will restart)
      watch: false,
      max_memory_restart: '500M',
      // Run every 5 minutes during market hours (09:00-16:00 ET, Mon-Fri)
      // Note: PM2 cron format uses UTC, so we need to adjust for ET (UTC-5 or UTC-4)
      // 09:00 ET = 14:00 UTC (EST) or 13:00 UTC (EDT)
      // 16:00 ET = 21:00 UTC (EST) or 20:00 UTC (EDT)
      // Using 13:00-20:00 UTC to cover both EST and EDT
      cron_restart: '*/5 13-20 * * 1-5' // Every 5 min, 13:00-20:00 UTC, Mon-Fri
    },
    {
      name: 'pmp-refs-worker',
      script: 'src/workers/polygonWorker.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        MODE: 'refs'
      },
      error_file: './logs/refs-worker-error.log',
      out_file: './logs/refs-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    }
  ]
};

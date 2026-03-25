module.exports = {
  apps: [
    {
      name: 'premarketprice',
      script: 'npm',
      args: 'run start',
      cwd: '/var/www/premarketprice',
      env: {
        NODE_ENV: 'production',
        ENABLE_WEBSOCKET: 'true',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        ENABLE_WEBSOCKET: 'true',
        PORT: 3000
      }
    },
    {
      name: 'pmp-polygon-worker',
      script: 'src/workers/polygonWorker.ts',
      cwd: '/var/www/premarketprice',
      interpreter: 'node',
      interpreter_args: '--loader tsx',
      env: {
        NODE_ENV: 'production',
        POLYGON_API_KEY: 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M'
    },
    {
      name: 'pmp-bulk-preloader',
      script: 'src/workers/backgroundPreloader.ts',
      cwd: '/var/www/premarketprice',
      interpreter: 'node',
      interpreter_args: '--loader tsx',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M'
    },
    {
      name: 'pmp-health-monitor',
      script: 'src/workers/healthMonitor.ts',
      cwd: '/var/www/premarketprice',
      interpreter: 'node',
      interpreter_args: '--loader tsx',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M'
    }
  ]
};

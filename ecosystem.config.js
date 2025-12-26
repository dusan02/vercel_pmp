module.exports = {
  apps: [
    {
      name: "premarketprice",
      script: "server.ts",
      interpreter: "npx",
      interpreter_args: "tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        ENABLE_WEBSOCKET: "true",
      },
      error_file: "/var/log/pm2/premarketprice-error.log",
      out_file: "/var/log/pm2/premarketprice-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "pmp-polygon-worker",
      script: "src/workers/polygonWorker.ts",
      interpreter: "npx",
      interpreter_args: "tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        MODE: "snapshot",
        ENABLE_WEBSOCKET: "true",
      },
      error_file: "/var/log/pm2/polygon-worker-error.log",
      out_file: "/var/log/pm2/polygon-worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
    {
      name: "pmp-bulk-preloader",
      script: "src/workers/backgroundPreloader.ts",
      interpreter: "npx",
      interpreter_args: "tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/pm2/bulk-preloader-error.log",
      out_file: "/var/log/pm2/bulk-preloader-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      cron_restart: "*/5 13-20 * * 1-5", // Každých 5 minút počas trading hours (13-20 UTC = 8-15 ET)
      autorestart: false, // Cron job sa spúšťa automaticky, nepotrebuje autorestart
    },
  ],
};

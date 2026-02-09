// Load environment variables from .env file manually
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
const envVars = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=');
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        envVars[key.trim()] = value.trim();
      }
    }
  });
}

module.exports = {
  apps: [
    {
      name: "premarketprice",
      script: "server.ts",
      // Use the locally installed tsx binary (more reliable than npx in production).
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      
      // Fork mode - cluster mode causes crashes with Next.js custom server
      instances: 1,
      exec_mode: "fork",
      
      // Resource management - prevent memory leaks and ensure restarts
      max_memory_restart: "1G",
      kill_timeout: 5000,
      
      // Restart strategy
      max_restarts: 10,
      min_uptime: "10s",
      autorestart: true,
      
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        // Ensure the custom server binds on IPv4 loopback (matches nginx + monitors)
        LISTEN_HOST: "127.0.0.1",
        ENABLE_WEBSOCKET: "true",
        DATABASE_URL: envVars.DATABASE_URL || process.env.DATABASE_URL,
        // Redis - use local Redis if Upstash not configured
        REDIS_URL: envVars.REDIS_URL || process.env.REDIS_URL || "redis://127.0.0.1:6379",
        USE_LOCAL_REDIS: "true",
        // Google OAuth
        GOOGLE_CLIENT_ID: envVars.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: envVars.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
        // NextAuth
        AUTH_SECRET: envVars.AUTH_SECRET || envVars.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
        NEXTAUTH_URL: envVars.NEXTAUTH_URL || process.env.NEXTAUTH_URL || "https://premarketprice.com",
        // Single source of truth: scheduled jobs run via PM2 cron processes (below).
        ENABLE_INTERNAL_SECTOR_INDUSTRY_SCHEDULER: "false",
      },
      error_file: "/var/log/pm2/premarketprice-error.log",
      out_file: "/var/log/pm2/premarketprice-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
    {
      name: "pmp-polygon-worker",
      script: "src/workers/polygonWorker.ts",
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        MODE: "snapshot",
        ENABLE_WEBSOCKET: "true",
        DATABASE_URL: envVars.DATABASE_URL || process.env.DATABASE_URL,
        POLYGON_API_KEY: envVars.POLYGON_API_KEY || process.env.POLYGON_API_KEY,
        // Redis - use local Redis if Upstash not configured
        REDIS_URL: envVars.REDIS_URL || process.env.REDIS_URL || "redis://127.0.0.1:6379",
        USE_LOCAL_REDIS: "true",
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
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        DATABASE_URL: envVars.DATABASE_URL || process.env.DATABASE_URL,
        POLYGON_API_KEY: envVars.POLYGON_API_KEY || process.env.POLYGON_API_KEY,
      },
      error_file: "/var/log/pm2/bulk-preloader-error.log",
      out_file: "/var/log/pm2/bulk-preloader-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      cron_restart: "*/5 13-20 * * 1-5", // Každých 5 minút počas trading hours (13-20 UTC = 8-15 ET)
      autorestart: false, // Cron job sa spúšťa automaticky, nepotrebuje autorestart
    },
    {
      name: "daily-ticker-validator",
      script: "scripts/daily-ticker-validator.ts",
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        DATABASE_URL: envVars.DATABASE_URL || process.env.DATABASE_URL,
      },
      error_file: "/var/log/pm2/daily-ticker-validator-error.log",
      out_file: "/var/log/pm2/daily-ticker-validator-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      cron_restart: "0 2 * * *", // Raz denne o 02:00 UTC
      autorestart: false, // Cron job sa spúšťa automaticky, nepotrebuje autorestart
    },
    {
      name: "daily-integrity-check",
      script: "scripts/daily-integrity-check.ts",
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        DATABASE_URL: envVars.DATABASE_URL || process.env.DATABASE_URL,
        POLYGON_API_KEY: envVars.POLYGON_API_KEY || process.env.POLYGON_API_KEY,
      },
      error_file: "/var/log/pm2/daily-integrity-check-error.log",
      out_file: "/var/log/pm2/daily-integrity-check-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // 10:00 UTC ~= 05:00 ET (winter) / 06:00 ET (summer) -> safely AFTER prevClose bootstrap (04:00 ET)
      cron_restart: "0 10 * * *",
      autorestart: false,
    },
    {
      // Daily early-morning refresh (prevClose + sharesOutstanding + consistency checks)
      // Runs the same logic as Vercel cron (/api/cron/update-static-data) but on the VPS via PM2.
      name: "daily-static-data-refresh",
      script: "scripts/trigger-daily-refresh.ts",
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        // Call the local Next.js server directly (avoids external DNS/SSL issues)
        BASE_URL: "http://127.0.0.1:3000",
        CRON_SECRET_KEY: envVars.CRON_SECRET_KEY || envVars.CRON_SECRET || process.env.CRON_SECRET_KEY || process.env.CRON_SECRET,
      },
      error_file: "/var/log/pm2/daily-static-data-refresh-error.log",
      out_file: "/var/log/pm2/daily-static-data-refresh-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // 09:00 UTC ~= 04:00 ET (winter) / 05:00 ET (summer)
      cron_restart: "0 9 * * *",
      autorestart: false,
    },
    {
      // Verify/fix prevClose values vs Polygon (lightweight, safe)
      name: "cron-verify-prevclose",
      script: "scripts/trigger-verify-prevclose.ts",
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        BASE_URL: "http://127.0.0.1:3000",
        CRON_SECRET_KEY: envVars.CRON_SECRET_KEY || envVars.CRON_SECRET || process.env.CRON_SECRET_KEY || process.env.CRON_SECRET,
      },
      error_file: "/var/log/pm2/cron-verify-prevclose-error.log",
      out_file: "/var/log/pm2/cron-verify-prevclose-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Matches previous Vercel schedule: 08:00, 14:00, 20:00 UTC
      cron_restart: "0 8,14,20 * * *",
      autorestart: false,
    },
    {
      // Verify/fix sector/industry taxonomy once daily
      name: "cron-verify-sector-industry",
      script: "scripts/trigger-verify-sector-industry.ts",
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        BASE_URL: "http://127.0.0.1:3000",
        CRON_SECRET_KEY: envVars.CRON_SECRET_KEY || envVars.CRON_SECRET || process.env.CRON_SECRET_KEY || process.env.CRON_SECRET,
      },
      error_file: "/var/log/pm2/cron-verify-sector-industry-error.log",
      out_file: "/var/log/pm2/cron-verify-sector-industry-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      cron_restart: "0 2 * * *",
      autorestart: false,
    },
    {
      // Lightweight health/staleness monitor (alerts via optional webhook)
      name: "pmp-health-monitor",
      script: "scripts/health-monitor.ts",
      interpreter: "./node_modules/.bin/tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        BASE_URL: "http://127.0.0.1:3000",
        ALERT_WEBHOOK_URL: envVars.ALERT_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL,
        HEALTH_ALERT_COOLDOWN_MIN: envVars.HEALTH_ALERT_COOLDOWN_MIN || process.env.HEALTH_ALERT_COOLDOWN_MIN || "10",
      },
      error_file: "/var/log/pm2/pmp-health-monitor-error.log",
      out_file: "/var/log/pm2/pmp-health-monitor-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      cron_restart: "*/5 * * * *", // every 5 minutes
      autorestart: false,
    },
  ],
};

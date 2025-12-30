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
      interpreter: "npx",
      interpreter_args: "tsx",
      cwd: "/var/www/premarketprice",
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        ENABLE_WEBSOCKET: "true",
        DATABASE_URL: envVars.DATABASE_URL || process.env.DATABASE_URL,
        // Google OAuth
        GOOGLE_CLIENT_ID: envVars.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: envVars.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
        // NextAuth
        AUTH_SECRET: envVars.AUTH_SECRET || envVars.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
        NEXTAUTH_URL: envVars.NEXTAUTH_URL || process.env.NEXTAUTH_URL || "https://premarketprice.com",
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
        DATABASE_URL: envVars.DATABASE_URL || process.env.DATABASE_URL,
        POLYGON_API_KEY: envVars.POLYGON_API_KEY || process.env.POLYGON_API_KEY,
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
      interpreter: "npx",
      interpreter_args: "tsx",
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
  ],
};

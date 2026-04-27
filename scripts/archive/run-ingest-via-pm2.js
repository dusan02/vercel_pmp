/**
 * Run ingest via PM2 (which has .env.local loaded)
 * This ensures DATABASE_URL is available
 */

const { spawn } = require('child_process');
const path = require('path');

// Load .env.local manually
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Spawn tsx with environment variables
const child = spawn('npx', ['tsx', path.join(__dirname, 'force-ingest.ts')], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
    POLYGON_API_KEY: process.env.POLYGON_API_KEY
  },
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});


const { spawn } = require('child_process');
const path = require('path');
const { execSync } = require('child_process');

const script = path.join(__dirname, '../src/workers/polygonWorker.ts');
// Use npx directly with shell: true to handle Windows paths
// windowsHide: true prevents cmd.exe windows from appearing
const tsx = spawn('npx', ['tsx', script], {
  stdio: ['ignore', 'pipe', 'pipe'], // Don't inherit to avoid cmd windows
  env: { ...process.env, MODE: 'refs' },
  shell: true,
  windowsHide: true,
  detached: false
});

// Pipe output to console without opening windows
tsx.stdout.on('data', (data) => process.stdout.write(data));
tsx.stderr.on('data', (data) => process.stderr.write(data));

tsx.on('error', (err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});

tsx.on('exit', (code) => {
  process.exit(code || 0);
});


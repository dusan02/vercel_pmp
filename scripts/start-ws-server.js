/**
 * WebSocket Server Entry Point (JavaScript wrapper for TypeScript)
 */
const { spawn } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'start-ws-server.ts');
const projectRoot = path.join(__dirname, '..');

const child = spawn('npx', ['tsx', scriptPath], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  shell: true,
  env: { ...process.env }
});

child.stdout.on('data', (data) => {
  process.stdout.write(data);
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`WebSocket server exited with code ${code}`);
  }
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Failed to start WebSocket server:', error);
  process.exit(1);
});

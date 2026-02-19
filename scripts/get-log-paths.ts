import { execSync } from 'child_process';

try {
    const output = execSync('pm2 jlist').toString();
    const processes = JSON.parse(output);
    const worker = processes.find((p: any) => p.name === 'pmp-polygon-worker');

    if (worker) {
        console.log('Out Log:', worker.pm2_env.pm_out_log_path);
        console.log('Error Log:', worker.pm2_env.pm_err_log_path);
        console.log('PID:', worker.pid);
    } else {
        console.log('Worker not found');
    }
} catch (error) {
    console.error('Error parsing PM2 jlist:', error);
}

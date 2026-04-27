import { execSync } from 'child_process';

try {
    const output = execSync('pm2 jlist').toString();
    const processes = JSON.parse(output);

    const summary = processes.map((p: any) => ({
        pm_id: p.pm_id,
        name: p.name,
        status: p.pm2_env.status,
        uptime: Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000) + 's',
        restarts: p.pm2_env.restart_time,
        cpu: p.monit.cpu,
        memory: Math.round(p.monit.memory / 1024 / 1024) + 'MB'
    }));

    console.log(JSON.stringify(summary, null, 2));
} catch (error) {
    console.error('Error fetching PM2 info:', error);
}

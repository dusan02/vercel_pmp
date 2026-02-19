import { execSync } from 'child_process';

try {
    const output = execSync('pm2 describe pmp-polygon-worker').toString();
    console.log(output);
} catch (error) {
    console.error('Error describing PM2 process:', error);
}

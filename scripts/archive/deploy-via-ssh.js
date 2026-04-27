import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
    const cmds = [
        'cd /var/www/premarketprice',
        'git add .',
        'git stash',
        'git clean -fd',
        'git pull origin main',
        'cp ecosystem.config.cjs ecosystem.config.cjs.backup 2>/dev/null || true',
        'rm -rf .next',
        'npm run build',
        'pm2 start ecosystem.config.cjs --env production --update-env'
    ];
    
    console.log('Running: ' + cmds.join(' && '));
    
    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Finished with code: ' + code);
            conn.end();
            process.exit(code);
        }).on('data', (data) => {
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            process.stderr.write(data);
        });
    });
}).connect({
    host: '89.185.250.213',
    port: 22,
    username: 'root',
    password: 'CcO15gcCwu'
});

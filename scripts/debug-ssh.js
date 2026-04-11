import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
    // We want to check pm2 status and nginx logs maybe?
    const cmds = [
        'pm2 status',
        'pm2 logs --lines 50 --nostream'
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

import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
    const cmds = [
        'pm2 logs 0 --lines 100 --nostream'
    ];
    
    console.log('Running: ' + cmds.join(' && '));
    
    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
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

import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
    const cmds = [
        'cd /var/www/premarketprice',
        'pm2 restart premarketprice post-market-daily-reset'
    ];
    
    console.log('Running: ' + cmds.join(' && '));
    
    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('\n--- OUTPUT START ---');
            console.log('Finished with code: ' + code);
            console.log('--- OUTPUT END ---');
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

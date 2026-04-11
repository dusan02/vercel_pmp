import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
    const cmds = [
        'pm2 jlist',
        'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000',
        'tail -n 100 /root/.pm2/logs/premarketprice-error.log',
        'tail -n 100 /root/.pm2/logs/premarketprice-out.log'
    ];
    
    console.log('Running commands on remote...');
    
    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) throw err;
        let out = '';
        stream.on('close', (code, signal) => {
            console.log('\n--- OUTPUT START ---');
            console.log(out);
            console.log('--- OUTPUT END ---\nFinished with code: ' + code);
            conn.end();
            process.exit(code);
        }).on('data', (data) => {
            out += data.toString();
        }).stderr.on('data', (data) => {
            console.error(data.toString());
        });
    });
}).connect({
    host: '89.185.250.213',
    port: 22,
    username: 'root',
    password: 'CcO15gcCwu'
});

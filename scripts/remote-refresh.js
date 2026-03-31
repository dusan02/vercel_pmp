import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    conn.exec('cd /var/www/premarketprice && npm run update-universe', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Finished with code: ' + code);
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });
    });
}).connect({
    host: '89.185.250.213',
    port: 22,
    username: 'root',
    password: 'CcO15gcCwu'
});

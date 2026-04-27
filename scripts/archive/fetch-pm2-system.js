const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if(err) throw err;
        sftp.fastGet('/root/.pm2/pm2.log', 'D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\pm2_system.log', () => {
             console.log('Downloaded pm2_system.log!');
             conn.end();
        });
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });

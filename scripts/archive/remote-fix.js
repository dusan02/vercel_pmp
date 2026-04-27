import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    conn.sftp((err, sftp) => {
        if (err) throw err;
        const localFile = path.join(process.cwd(), 'scripts', 'fix-user-metadata.ts');
        const remoteFile = '/var/www/premarketprice/scripts/fix-user-metadata.ts';
        
        sftp.fastPut(localFile, remoteFile, (err) => {
            if (err) throw err;
            console.log('Uploaded script to production server.');
            
            conn.exec('cd /var/www/premarketprice && npx tsx scripts/fix-user-metadata.ts', (err, stream) => {
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
        });
    });
}).connect({
    host: '89.185.250.213',
    port: 22,
    username: 'root',
    password: 'CcO15gcCwu'
});

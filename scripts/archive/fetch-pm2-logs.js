const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('pm2 logs premarketprice --lines 150 --nostream', (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log(output);
      conn.end();
    }).on('data', (data) => output += data).stderr.on('data', (d) => output += d);
  });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });

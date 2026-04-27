const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmds = [
    'cd /var/www/premarketprice',
    'rm -rf .next',
    'npm run build',
    'pm2 restart premarketprice --update-env'
  ];
  const command = cmds.join(' && ');
  console.log('Running:', command);
  
  conn.exec(command, (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log('Finished with code:', code);
      console.log('Output:', output.slice(-2000));
      conn.end();
    }).on('data', (data) => output += data).stderr.on('data', (d) => output += d);
  });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });

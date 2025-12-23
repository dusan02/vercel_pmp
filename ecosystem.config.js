module.exports = {
  apps: [{
    name: 'premarketprice',
    script: 'server.ts',
    interpreter: 'node',
    interpreter_args: '--loader tsx',
    cwd: '/var/www/premarketprice/pmp_prod',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/pm2/premarketprice-error.log',
    out_file: '/var/log/pm2/premarketprice-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};

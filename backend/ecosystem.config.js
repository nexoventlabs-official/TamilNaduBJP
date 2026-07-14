module.exports = {
  apps: [
    {
      name:               'bjptn-backend',
      script:             'src/index.js',
      cwd:                '/var/www/bjptn/backend',
      instances:          4,            // one per vCPU (box has 4)
      exec_mode:          'cluster',    // shares port 5000 across workers
      watch:              false,
      max_memory_restart: '1500M',      // restart a worker if it leaks past 1.5GB
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file:      '/root/.pm2/logs/bjptn-backend-error.log',
      out_file:        '/root/.pm2/logs/bjptn-backend-out.log',
      merge_logs:      true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};

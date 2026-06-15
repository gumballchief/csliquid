module.exports = {
  apps: [
    {
      name: 'csliquid-keeper',
      script: './dist/index.js',
      cwd: __dirname,

      // Restart policy
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5_000,
      exp_backoff_restart_delay: 100,

      // Logging
      out_file:   './logs/keeper-out.log',
      error_file: './logs/keeper-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Environment
      env: {
        NODE_ENV: 'production',
        // Set these via: pm2 set csliquid-keeper:HELIUS_RPC_URL https://...
        // Or use a .env file and dotenv-load, or export in the shell before pm2 start
      },
    },
  ],
};

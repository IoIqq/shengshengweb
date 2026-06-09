module.exports = {
  apps: [
    {
      name: "shengsheng-studio",
      script: "server/server-new.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "60s",
      restart_delay: 2000,
      max_memory_restart: "512M",
      kill_timeout: 8000,
      out_file: "server/logs/pm2-out.log",
      error_file: "server/logs/pm2-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};

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
      // 默认即生产环境（与 .env 的 NODE_ENV=production 一致）。
      // 注意：dotenv 不会覆盖 pm2 已设的环境变量，故这里必须与 .env 保持一致，
      // 否则 `pm2 start` 不带 --env production 会静默退化为开发模式。
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};

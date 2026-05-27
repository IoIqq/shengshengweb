module.exports = {
  apps: [
    {
      name: "shengsheng-studio",
      script: "server/server.js",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};

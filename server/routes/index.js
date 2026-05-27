const express = require("express");
const authRoutes = require("./auth");
const wishRoutes = require("./wish");

function setupRoutes(app) {
  // 认证相关路由
  app.use("/api", authRoutes);
  
  // 留言墙路由（新功能）
  app.use("/api/wishes", wishRoutes);
  
  // 其他路由保持在 server.js 中
  // 包括: media, devices, borrow-requests, todos, team, settings 等
}

module.exports = { setupRoutes };

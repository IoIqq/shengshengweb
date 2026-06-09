@echo off
chcp 65001 >nul
title 声声工作室 · PM2 守护启动
cd /d "%~dp0\.."

where pm2 >nul 2>nul
if errorlevel 1 (
  echo [×] 未找到 PM2，请先在管理员命令行执行：npm install -g pm2
  pause
  exit /b 1
)

echo [→] 通过 PM2 启动服务（生产模式）...
pm2 start ecosystem.config.js --env production
if errorlevel 1 (
  echo [×] PM2 启动失败，请查看上方输出。
  pause
  exit /b 1
)

echo.
echo [√] 服务已交给 PM2 守护，关闭此窗口不会影响服务。
echo.
echo 常用命令：
echo   pm2 status                    查看服务状态
echo   pm2 logs shengsheng-studio    查看实时日志
echo   pm2 reload shengsheng-studio  零停机重启
echo   pm2 stop shengsheng-studio    停止服务
echo   pm2 startup                   配置开机自启（按提示执行回显命令）
echo.
pause

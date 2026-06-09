@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
for /f "delims=" %%P in ('node -e "try{require(''dotenv'').config();console.log(require(''./server/config'').PORT)}catch(e){console.log(3002)}"') do set "APP_PORT=%%P"
echo ========================================
echo   声声网络思政工作室 - 自动部署脚本
echo ========================================
echo.

:: 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 npm
    pause
    exit /b 1
)

echo [1/6] 检查环境...
echo Node.js 版本:
node --version
echo npm 版本:
npm --version
echo.

echo [2/6] 安装依赖...
echo 正在安装项目依赖，请稍候...
call npm install
if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络连接
    echo 提示: 可以尝试使用国内镜像源
    echo   npm config set registry https://registry.npmmirror.com
    pause
    exit /b 1
)
echo 依赖安装完成
echo.

echo [3/6] 配置环境变量...
if not exist .env (
    copy .env.example .env >nul
    echo 已创建 .env 文件
    echo 提示: 请编辑 .env 文件修改管理员密码和其他配置
) else (
    echo .env 文件已存在，跳过创建
)
echo.

echo [4/6] 创建必要目录...
if not exist server\data mkdir server\data
if not exist server\uploads mkdir server\uploads
if not exist server\uploads\media mkdir server\uploads\media
if not exist server\uploads\inbox mkdir server\uploads\inbox
echo 目录结构创建完成
echo.

echo [5/6] 初始化数据库...
if not exist server\data\studio.sqlite (
    echo 正在创建数据库...
    node server\scripts\init-db.js
    if errorlevel 1 (
        echo [警告] 数据库初始化失败，将在首次启动时自动创建
    ) else (
        echo 数据库初始化完成
    )
) else (
    echo 数据库已存在，跳过初始化
)
echo.

echo [6/6] 环境检查...
node server\scripts\check-env.js
if errorlevel 1 (
    echo [警告] 环境检查发现问题，但可以继续
)
echo.

echo ========================================
echo   部署完成！
echo ========================================
echo.
echo 🎉 项目已准备就绪
echo.
echo 📝 下一步操作：
echo   1. 编辑 .env 文件修改配置（重要！）
echo   2. 启动服务
echo.
echo 🚀 启动命令：
echo   开发模式: npm run dev
echo   生产模式: npm run start
echo   PM2 部署: npm run pm2:start
echo.
echo 🌐 访问地址：
echo   本地: http://localhost:%APP_PORT%
echo   局域网: http://你的IP:%APP_PORT%
echo.
echo 📚 更多信息请查看 docs\GUIDE.md
echo.
pause

#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
APP_PORT=$(node -e "try{require('dotenv').config();console.log(require('./server/config').PORT)}catch(e){console.log(3002)}")

echo "========================================"
echo "  声声网络思政工作室 - 自动部署脚本"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误] 未检测到 Node.js，请先安装 Node.js 18+${NC}"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[错误] 未检测到 npm${NC}"
    exit 1
fi

echo "[1/6] 检查环境..."
echo "Node.js 版本: $(node --version)"
echo "npm 版本: $(npm --version)"
echo ""

echo "[2/6] 安装依赖..."
echo "正在安装项目依赖，请稍候..."
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}[错误] 依赖安装失败，请检查网络连接${NC}"
    echo "提示: 可以尝试使用国内镜像源"
    echo "  npm config set registry https://registry.npmmirror.com"
    exit 1
fi
echo -e "${GREEN}依赖安装完成${NC}"
echo ""

echo "[3/6] 配置环境变量..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}已创建 .env 文件${NC}"
    echo -e "${YELLOW}提示: 请编辑 .env 文件修改管理员密码和其他配置${NC}"
else
    echo ".env 文件已存在，跳过创建"
fi
echo ""

echo "[4/6] 创建必要目录..."
mkdir -p server/data
mkdir -p server/uploads/media
mkdir -p server/uploads/inbox
chmod -R 755 server/uploads 2>/dev/null || true
echo -e "${GREEN}目录结构创建完成${NC}"
echo ""

echo "[5/6] 初始化数据库..."
if [ ! -f server/data/studio.sqlite ]; then
    echo "正在创建数据库..."
    node server/scripts/init-db.js
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}[警告] 数据库初始化失败，将在首次启动时自动创建${NC}"
    else
        echo -e "${GREEN}数据库初始化完成${NC}"
    fi
else
    echo "数据库已存在，跳过初始化"
fi
echo ""

echo "[6/6] 环境检查..."
node server/scripts/check-env.js
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}[警告] 环境检查发现问题，但可以继续${NC}"
fi
echo ""

echo "========================================"
echo "  部署完成！"
echo "========================================"
echo ""
echo "🎉 项目已准备就绪"
echo ""
echo "📝 下一步操作："
echo "  1. 编辑 .env 文件修改配置（重要！）"
echo "  2. 启动服务"
echo ""
echo "🚀 启动命令："
echo "  开发模式: npm run dev"
echo "  生产模式: npm run start"
echo "  PM2 部署: npm run pm2:start"
echo ""
echo "🌐 访问地址："
echo "  本地: http://localhost:${APP_PORT}"
echo "  局域网: http://你的IP:${APP_PORT}"
echo ""
echo "📚 更多信息请查看 docs/GUIDE.md"
echo ""

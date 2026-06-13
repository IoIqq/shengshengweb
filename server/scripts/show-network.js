#!/usr/bin/env node
/**
 * 显示本机所有局域网访问地址 + 生成二维码（终端 ASCII + 浏览器 SVG）
 * 用法：npm run network  或  node server/scripts/show-network.js
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getLanAddresses } = require('../utils/network');
const { render: renderQR } = require('../utils/qr-code');
const { buildMobilePage } = require('../utils/mobile-page');
const dotenv = (() => {
  try {
    return require('dotenv');
  } catch (e) {
    return null;
  }
})();

if (dotenv) {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
}

const PORT = Number(process.env.PORT || 48080);

// ============================================================
// 辅助函数
// ============================================================

function getLanIPs() {
  return getLanAddresses().map(({ name, address }) => ({ name, address }));
}

function checkPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, host);
  });
}

function openInBrowser(filepath) {
  const platform = process.platform;
  const cmd =
    platform === 'win32'
      ? `start "" "${filepath}"`
      : platform === 'darwin'
        ? `open "${filepath}"`
        : `xdg-open "${filepath}"`;
  exec(cmd, () => {}); // 静默失败，控制台已有提示
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('');
  console.log('================================================');
  console.log('  📱 声声工作室 - 手机访问助手');
  console.log('================================================');
  console.log('');

  const ips = getLanIPs();
  if (!ips.length) {
    console.log('❌ 未检测到任何局域网网卡，请检查 Wi-Fi/有线网络是否已连接。');
    return;
  }

  console.log(`🔍 检测到 ${ips.length} 个局域网地址（端口 ${PORT}）：\n`);

  const results = [];
  for (const ip of ips) {
    const open = await checkPortOpen(ip.address, PORT);
    results.push({ ...ip, open });
    const status = open ? '✅ 可访问' : '⚠️  端口未监听或被防火墙拦截';
    const link = `http://${ip.address}:${PORT}`;
    console.log(`  [${ip.name}] ${link}  ${status}`);
  }

  const primary = results.find((r) => r.open) || ips[0];
  const url = `http://${primary.address}:${PORT}`;

  console.log('');
  console.log('------------------------------------------------');
  console.log('  📲 推荐访问地址（手机浏览器输入这个）：');
  console.log(`     ${url}`);
  console.log('------------------------------------------------');
  console.log('');

  // 生成网页版二维码（清晰、好扫）
  try {
    const html = buildMobilePage(url, results, primary, PORT);
    const tmpDir = path.join(__dirname, '..', '..');
    const outFile = path.join(tmpDir, '.mobile-access.html');
    fs.writeFileSync(outFile, html, 'utf-8');
    console.log('🌐 已生成大尺寸二维码页面，正在用浏览器打开...');
    console.log(`   文件位置：${outFile}`);
    console.log('');
    openInBrowser(outFile);
  } catch (err) {
    console.log('（网页二维码生成失败：' + err.message + '）');
  }

  // 同时打印终端二维码作为备用
  console.log('（如果浏览器没自动打开，看下面的终端二维码也可以扫）');
  console.log('');
  try {
    console.log(renderQR(url));
  } catch (err) {
    console.log('（终端二维码渲染失败：' + err.message + '）');
  }

  console.log('================================================');
  console.log('  📋 手机操作步骤：');
  console.log('================================================');
  console.log('  1. 把手机连接到和电脑【同一个 Wi-Fi】');
  console.log('  2. 用【微信扫一扫】或【手机相机】对准二维码');
  console.log('  3. 点击弹出的链接，选择"在浏览器打开"');
  console.log('     —— 或者直接在手机浏览器输入：');
  console.log(`     ${url}`);
  console.log('');

  if (!results.some((r) => r.open)) {
    console.log('⚠️  当前端口不可达，可能原因：');
    console.log('   1. 服务器尚未启动 → 先运行：npm start');
    console.log('   2. Windows 防火墙拦截 → 以管理员身份运行：open-firewall.bat');
    console.log('   3. 手机与电脑不在同一 Wi-Fi');
    console.log('');
  } else {
    console.log('💡 扫码后仍打不开？常见原因：');
    console.log('   • 手机连的是流量/别的 Wi-Fi → 切到电脑同一个 Wi-Fi');
    console.log('   • 公司/校园网客户端隔离 → 电脑开热点，让手机连热点');
    console.log('   • Windows 防火墙拦截 → 管理员运行 open-firewall.bat');
    console.log('');
  }
}

main().catch((err) => {
  console.error('❌ 错误：', err.message);
  process.exit(1);
});
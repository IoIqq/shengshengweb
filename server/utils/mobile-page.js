/**
 * 手机访问引导页 HTML 模板
 * 生成包含 QR 码、操作步骤、地址列表的自包含 HTML 页面
 */

const { toSvg } = require('./qr-code');

/**
 * @param {string} url    推荐访问 URL
 * @param {Array<{name: string, address: string, open: boolean}>} ips 所有地址列表
 * @param {{name: string, address: string, open: boolean}} primary 首选地址
 * @param {number} port   服务端口
 * @returns {string} 完整 HTML 文档
 */
function buildMobilePage(url, ips, primary, port) {
  const svg = toSvg(url, 12);
  const ipRows = ips
    .map(
      (ip) =>
        `<tr><td>${ip.name}</td><td><code>http://${ip.address}:${port}</code></td><td>${ip.open ? '✅' : '⚠️'}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>📱 手机访问 - 声声工作室</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh; color: #2c3e50;
}
.card {
  max-width: 720px; margin: 0 auto; background: #fff;
  border-radius: 16px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,.2);
}
h1 { margin: 0 0 8px; font-size: 28px; color: #2c3e50; }
.sub { color: #7f8c8d; margin-bottom: 24px; font-size: 14px; }
.qr-wrap {
  text-align: center; padding: 24px; background: #fafbfc;
  border-radius: 12px; margin-bottom: 24px;
  border: 2px dashed #e1e4e8;
}
.qr-wrap svg { max-width: 100%; height: auto; max-height: 380px; }
.url {
  text-align: center; font-size: 18px; font-weight: 600; color: #1976d2;
  margin-top: 16px; word-break: break-all;
}
.steps {
  background: #f8f9fa; border-radius: 12px; padding: 20px 24px;
  margin: 16px 0; line-height: 1.9;
}
.steps h3 { margin: 0 0 12px; color: #2c3e50; font-size: 18px; }
.steps ol { margin: 0; padding-left: 24px; }
.steps li { margin: 6px 0; }
.steps strong { color: #e74c3c; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #ecf0f1; font-size: 14px; }
th { background: #f8f9fa; font-weight: 600; color: #34495e; }
code { background: #fff3e0; padding: 2px 8px; border-radius: 4px; color: #d84315; font-family: Consolas, monospace; }
.tip { background: #fff8e1; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 4px; margin-top: 16px; font-size: 14px; }
.tip b { color: #f57c00; }
.foot { text-align: center; color: #95a5a6; font-size: 12px; margin-top: 24px; }
</style>
</head>
<body>
<div class="card">
  <h1>📱 手机访问</h1>
  <div class="sub">用手机摄像头/微信对准下方二维码扫码即可</div>

  <div class="qr-wrap">
    ${svg}
    <div class="url">${url}</div>
  </div>

  <div class="steps">
    <h3>📋 三步打开</h3>
    <ol>
      <li><strong>手机连接和电脑同一个 Wi-Fi</strong>（这是关键，必须同网段）</li>
      <li>用手机<strong>微信扫一扫</strong>，或者<strong>相机/支付宝扫码</strong>对准上面的二维码</li>
      <li>点开链接，用浏览器打开（微信里点右上角"…"→ 在浏览器打开）</li>
    </ol>
  </div>

  <div class="steps">
    <h3>🔗 也可以手动输入</h3>
    <p style="margin:0">如果扫码不方便，在手机浏览器地址栏输入：</p>
    <p style="margin:8px 0 0; text-align: center;"><code style="font-size:16px">${url}</code></p>
  </div>

  <h3 style="margin-top:24px">🌐 所有可用地址</h3>
  <table>
    <thead><tr><th>网卡</th><th>地址</th><th>状态</th></tr></thead>
    <tbody>${ipRows}</tbody>
  </table>

  <div class="tip">
    <b>⚠️ 扫码后打不开？</b><br>
    1. 确认手机和电脑连同一个 Wi-Fi<br>
    2. 公司/校园网可能开了"客户端隔离"，电脑开热点让手机连过来即可<br>
    3. Windows 防火墙拦截端口 ${port}，<b>右键以管理员身份运行</b> <code>open-firewall.bat</code>
  </div>

  <div class="foot">声声网络思政工作室 · ${new Date().toLocaleString('zh-CN')}</div>
</div>
</body>
</html>`;
}

module.exports = { buildMobilePage };
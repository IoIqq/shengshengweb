#!/usr/bin/env node
/**
 * 显示本机所有局域网访问地址 + 生成二维码（终端 ASCII）
 * 用法：npm run network  或  node server/scripts/show-network.js
 *
 * 零依赖：内置极简 QR 编码器（数字/字母数字/字节模式，纠错级 L/M）
 * 支持手机扫码访问，无需安装任何 npm 包。
 */

const os = require('os');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
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

const PORT = Number(process.env.PORT || 3002);

// ============================================================
// 极简 QR Code 编码器（字节模式，纠错级 L）
// 参考 ISO/IEC 18004，仅实现常见 URL 长度（version 1-10）
// ============================================================
const QR = (() => {
  const GF_EXP = new Array(512);
  const GF_LOG = new Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGenerator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], 1);
        next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const result = data.concat(new Array(ecLen).fill(0));
    for (let i = 0; i < data.length; i++) {
      const factor = result[i];
      if (factor !== 0) {
        for (let j = 0; j < gen.length; j++) {
          result[i + j] ^= gfMul(gen[j], factor);
        }
      }
    }
    return result.slice(data.length);
  }

  // 各版本+纠错级 L 的容量参数：[版本, 总码字, 数据码字, EC码字/块, 块数]
  const VERSIONS_L = [
    [1, 26, 19, 7, 1],
    [2, 44, 34, 10, 1],
    [3, 70, 55, 15, 1],
    [4, 100, 80, 20, 1],
    [5, 134, 108, 26, 1],
    [6, 172, 136, 18, 2],
    [7, 196, 156, 20, 2],
    [8, 242, 194, 24, 2],
    [9, 292, 232, 30, 2],
    [10, 346, 274, 18, 4],
  ];

  function pickVersion(byteLen) {
    // 头部：4 bit 模式 + 8/16 bit 长度
    for (const v of VERSIONS_L) {
      const lenBits = v[0] < 10 ? 8 : 16;
      const overhead = 4 + lenBits;
      const dataBits = v[2] * 8;
      if (overhead + byteLen * 8 + 4 <= dataBits) return v;
    }
    throw new Error('URL 太长，无法编码到 version 10 以内');
  }

  function encode(text) {
    const bytes = Buffer.from(text, 'utf-8');
    const ver = pickVersion(bytes.length);
    const [version, , dataCw, ecPerBlock, blocks] = ver;
    const dataPerBlock = Math.floor(dataCw / blocks);
    const dataBlocks = [];
    const remainder = dataCw - dataPerBlock * blocks;
    const lenBits = version < 10 ? 8 : 16;

    // 构建比特流
    const bits = [];
    const writeBits = (val, n) => {
      for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    writeBits(0b0100, 4); // 字节模式
    writeBits(bytes.length, lenBits);
    for (const b of bytes) writeBits(b, 8);
    // 终止符
    const totalBits = dataCw * 8;
    const term = Math.min(4, totalBits - bits.length);
    writeBits(0, term);
    while (bits.length % 8 !== 0) bits.push(0);
    // 转字节
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }
    // 填充
    const PAD = [0xec, 0x11];
    let pi = 0;
    while (data.length < dataCw) data.push(PAD[pi++ % 2]);

    // 分块
    let offset = 0;
    for (let i = 0; i < blocks; i++) {
      const size = dataPerBlock + (i >= blocks - remainder ? 1 : 0);
      dataBlocks.push(data.slice(offset, offset + size));
      offset += size;
    }
    const ecBlocks = dataBlocks.map((b) => rsEncode(b, ecPerBlock));

    // 交错
    const finalBytes = [];
    const maxData = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxData; i++) {
      for (const b of dataBlocks) if (i < b.length) finalBytes.push(b[i]);
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const b of ecBlocks) finalBytes.push(b[i]);
    }

    // 转比特
    const codeBits = [];
    for (const b of finalBytes) for (let i = 7; i >= 0; i--) codeBits.push((b >> i) & 1);

    return { version, codeBits };
  }

  // 矩阵尺寸
  const size = (v) => v * 4 + 17;

  function buildMatrix(version) {
    const n = size(version);
    const m = Array.from({ length: n }, () => new Array(n).fill(null));
    const reserved = Array.from({ length: n }, () => new Array(n).fill(false));

    const placeFinder = (r, c) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          let v;
          if (dr === -1 || dr === 7 || dc === -1 || dc === 7) v = 0;
          else if (dr === 0 || dr === 6 || dc === 0 || dc === 6) v = 1;
          else if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) v = 1;
          else v = 0;
          m[rr][cc] = v;
          reserved[rr][cc] = true;
        }
      }
    };
    placeFinder(0, 0);
    placeFinder(0, n - 7);
    placeFinder(n - 7, 0);

    // 时序
    for (let i = 8; i < n - 8; i++) {
      m[6][i] = i % 2 === 0 ? 1 : 0;
      m[i][6] = i % 2 === 0 ? 1 : 0;
      reserved[6][i] = true;
      reserved[i][6] = true;
    }
    // 暗模块
    m[n - 8][8] = 1;
    reserved[n - 8][8] = true;

    // 格式信息占位
    for (let i = 0; i < 9; i++) {
      if (m[8][i] === null) reserved[8][i] = true;
      if (m[i][8] === null) reserved[i][8] = true;
    }
    for (let i = n - 8; i < n; i++) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }

    // 校准（version 2-10）
    const ALIGN = {
      2: [6, 18],
      3: [6, 22],
      4: [6, 26],
      5: [6, 30],
      6: [6, 34],
      7: [6, 22, 38],
      8: [6, 24, 42],
      9: [6, 26, 46],
      10: [6, 28, 50],
    };
    if (ALIGN[version]) {
      const pos = ALIGN[version];
      for (const r of pos) {
        for (const c of pos) {
          if (reserved[r][c]) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              const isOuter = Math.abs(dr) === 2 || Math.abs(dc) === 2;
              const isCenter = dr === 0 && dc === 0;
              m[rr][cc] = isOuter || isCenter ? 1 : 0;
              reserved[rr][cc] = true;
            }
          }
        }
      }
    }

    return { matrix: m, reserved, n };
  }

  function placeData(matrix, reserved, n, codeBits) {
    let bitIdx = 0;
    let upward = true;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col = 5; // 跳过时序列
      for (let i = 0; i < n; i++) {
        const row = upward ? n - 1 - i : i;
        for (let dx = 0; dx < 2; dx++) {
          const c = col - dx;
          if (!reserved[row][c]) {
            matrix[row][c] = bitIdx < codeBits.length ? codeBits[bitIdx] : 0;
            bitIdx++;
          }
        }
      }
      upward = !upward;
    }
  }

  function applyMask(matrix, reserved, n, mask) {
    const fns = [
      (r, c) => (r + c) % 2 === 0,
      (r) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];
    const fn = fns[mask];
    const out = matrix.map((row) => row.slice());
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!reserved[r][c] && fn(r, c)) out[r][c] ^= 1;
      }
    }
    return out;
  }

  function maskScore(m, n) {
    let score = 0;
    // 规则 1：连续相同
    for (let r = 0; r < n; r++) {
      let runC = 1, runR = 1;
      for (let c = 1; c < n; c++) {
        if (m[r][c] === m[r][c - 1]) {
          runC++;
        } else {
          if (runC >= 5) score += 3 + (runC - 5);
          runC = 1;
        }
        if (m[c][r] === m[c - 1][r]) {
          runR++;
        } else {
          if (runR >= 5) score += 3 + (runR - 5);
          runR = 1;
        }
      }
      if (runC >= 5) score += 3 + (runC - 5);
      if (runR >= 5) score += 3 + (runR - 5);
    }
    return score;
  }

  function placeFormat(matrix, n, ecLevel, mask) {
    // ecLevel: L=01
    const ecBits = { L: 0b01, M: 0b00 }[ecLevel] ?? 0b01;
    const data = (ecBits << 3) | mask;
    let bch = data << 10;
    const G = 0b10100110111;
    for (let i = 14; i >= 10; i--) {
      if ((bch >> i) & 1) bch ^= G << (i - 10);
    }
    const fmt = ((data << 10) | bch) ^ 0b101010000010010;
    const bits = [];
    for (let i = 14; i >= 0; i--) bits.push((fmt >> i) & 1);

    // 左上
    for (let i = 0; i < 6; i++) matrix[8][i] = bits[i];
    matrix[8][7] = bits[6];
    matrix[8][8] = bits[7];
    matrix[7][8] = bits[8];
    for (let i = 9; i < 15; i++) matrix[14 - i][8] = bits[i];

    // 左下 + 右上
    for (let i = 0; i < 7; i++) matrix[n - 1 - i][8] = bits[i];
    for (let i = 7; i < 15; i++) matrix[8][n - 15 + i] = bits[i];
  }

  function generate(text) {
    const { version, codeBits } = encode(text);
    const { matrix, reserved, n } = buildMatrix(version);
    placeData(matrix, reserved, n, codeBits);

    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const masked = applyMask(matrix, reserved, n, mask);
      placeFormat(masked, n, 'L', mask);
      const score = maskScore(masked, n);
      if (best === null || score < best.score) best = { score, masked, mask };
    }
    return { matrix: best.masked, n };
  }

  // 终端渲染：用上下半块字符压缩，每行覆盖 2 个 QR 模块
  // 不依赖 ANSI 颜色，cmd/PowerShell/Terminal 通用
  // 输出对深色背景终端：黑模块=空(背景透出)，白模块=█；
  // 在浅色背景终端会反色显示，主流扫码 APP 仍可识别
  function render(text, options = {}) {
    const invert = options.invert === true;
    const { matrix, n } = generate(text);
    const pad = 4; // 静默区
    const total = n + pad * 2;
    const grid = Array.from({ length: total }, () => new Array(total).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        grid[r + pad][c + pad] = matrix[r][c];
      }
    }
    // 1 = 黑模块, 0 = 白模块
    // 深色背景：黑=" ", 白="█"。半块组合：
    //   上白下白 -> "█"   上白下黑 -> "▀"
    //   上黑下白 -> "▄"   上黑下黑 -> " "
    // 浅色背景（invert=true）：颠倒 0/1 即可
    let out = '';
    for (let r = 0; r < total; r += 2) {
      let line = '';
      for (let c = 0; c < total; c++) {
        let top = grid[r][c];
        let bot = r + 1 < total ? grid[r + 1][c] : 0;
        if (invert) {
          top = 1 - top;
          bot = 1 - bot;
        }
        // 1 = 黑模块（在深色终端用"空"，背景透出表示黑色 QR 模块）
        // 0 = 白模块（用"█"，亮字符表示白色 QR 模块）
        if (!top && !bot) line += '█';
        else if (!top && bot) line += '▀';
        else if (top && !bot) line += '▄';
        else line += ' ';
      }
      out += line + '\n';
    }
    return out;
  }

  return { render, generate };
})();

// ============================================================
// 主流程
// ============================================================
function getLanIPs() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        list.push({ name, address: a.address });
      }
    }
  }
  return list;
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

// 把 QR 矩阵转成 SVG，便于在网页里清晰显示
function qrToSvg(text, scale = 12) {
  const { matrix, n } = QR.generate(text);
  const pad = 4;
  const total = n + pad * 2;
  const sz = total * scale;
  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = (c + pad) * scale;
        const y = (r + pad) * scale;
        rects += `<rect x="${x}" y="${y}" width="${scale}" height="${scale}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

function buildMobilePage(url, ips, primary) {
  const svg = qrToSvg(url, 12);
  const ipRows = ips
    .map(
      (ip) =>
        `<tr><td>${ip.name}</td><td><code>http://${ip.address}:${PORT}</code></td><td>${ip.open ? '✅' : '⚠️'}</td></tr>`
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
    3. Windows 防火墙拦截端口 3002，<b>右键以管理员身份运行</b> <code>open-firewall.bat</code>
  </div>

  <div class="foot">声声网络思政工作室 · ${new Date().toLocaleString('zh-CN')}</div>
</div>
</body>
</html>`;
}

function openInBrowser(filepath) {
  const platform = process.platform;
  const cmd =
    platform === 'win32' ? `start "" "${filepath}"` : platform === 'darwin' ? `open "${filepath}"` : `xdg-open "${filepath}"`;
  exec(cmd, (err) => {
    if (err) {
      // 静默失败，控制台已有提示
    }
  });
}

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

  const score = (ip) => {
    if (ip.startsWith('192.168.')) return 3;
    if (ip.startsWith('10.')) return 2;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    if (ip.startsWith('169.254.')) return 0;
    return 1;
  };
  const sorted = ips.slice().sort((a, b) => score(b.address) - score(a.address));

  const results = [];
  for (const ip of sorted) {
    const open = await checkPortOpen(ip.address, PORT);
    results.push({ ...ip, open });
    const status = open ? '✅ 可访问' : '⚠️  端口未监听或被防火墙拦截';
    const link = `http://${ip.address}:${PORT}`;
    console.log(`  [${ip.name}] ${link}  ${status}`);
  }

  const primary = results.find((r) => r.open) || sorted[0];
  const url = `http://${primary.address}:${PORT}`;

  console.log('');
  console.log('------------------------------------------------');
  console.log('  📲 推荐访问地址（手机浏览器输入这个）：');
  console.log(`     ${url}`);
  console.log('------------------------------------------------');
  console.log('');

  // 生成网页版二维码（清晰、好扫）
  try {
    const html = buildMobilePage(url, results, primary);
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
    console.log(QR.render(url));
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

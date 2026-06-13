/**
 * 零依赖 QR Code 编码器 — 数字/字母数字/字节模式，纠错级 L/M
 * 参考 ISO/IEC 18004，支持 version 1-10（常见 URL 长度）
 *
 * 导出：
 *   render(text, options) — 终端 ASCII 二维码（半块字符，通用）
 *   generate(text)        — 返回 { matrix, n }，供 SVG/Canvas 渲染
 *   toSvg(text, scale)    — 把 QR 矩阵转成内联 SVG
 */

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

/**
 * 生成 QR Code 矩阵
 * @param {string} text 要编码的文本
 * @returns {{ matrix: number[][], n: number }}
 */
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

/**
 * 终端 ASCII 渲染 — 用上下半块字符压缩，每行覆盖 2 个 QR 模块
 * 不依赖 ANSI 颜色，cmd/PowerShell/Terminal 通用
 * @param {string} text 要编码的文本
 * @param {{ invert?: boolean }} options
 * @returns {string} ASCII QR 码字符串
 */
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
      if (!top && !bot) line += '█';
      else if (!top && bot) line += '▀';
      else if (top && !bot) line += '▄';
      else line += ' ';
    }
    out += line + '\n';
  }
  return out;
}

/**
 * 把 QR 矩阵转成内联 SVG，便于在网页里清晰显示
 * @param {string} text 要编码的文本
 * @param {number} scale 每个模块的像素尺寸
 * @returns {string} SVG 字符串
 */
function toSvg(text, scale = 12) {
  const { matrix, n } = generate(text);
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

module.exports = { render, generate, toSvg };
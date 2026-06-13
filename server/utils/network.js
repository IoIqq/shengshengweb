const os = require('os');
const net = require('net');

/**
 * 给局域网地址打分：优先家用/办公常见网段，过滤无效地址。
 * 分数越高越适合作为推荐访问地址。
 */
function scoreAddress(ip) {
  if (ip.startsWith('192.168.')) return 3;
  if (ip.startsWith('10.')) return 2;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  if (ip.startsWith('169.254.')) return 0; // APIPA：未拿到 DHCP，基本不可用
  return 1;
}

/**
 * 列出本机所有 IPv4 局域网地址，按可用性排序。
 * 每次调用都重新读取网卡，因此切换 Wi-Fi / 有线后会自动反映当前网络。
 * @returns {Array<{name: string, address: string, score: number}>}
 */
function getLanAddresses() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(nets || {})) {
    for (const a of addrs || []) {
      // Node 18+ 用数字 4，旧版用字符串 'IPv4'，两者都兼容
      const isIpv4 = a.family === 'IPv4' || a.family === 4;
      if (isIpv4 && !a.internal) {
        list.push({ name, address: a.address, score: scoreAddress(a.address) });
      }
    }
  }
  return list.sort((a, b) => b.score - a.score);
}

/**
 * 取一个最适合分享给手机的局域网地址；没有则回退 localhost。
 */
function primaryLanAddress() {
  const list = getLanAddresses().filter((ip) => ip.score > 0);
  return list.length ? list[0].address : 'localhost';
}

/**
 * 探测某个 TCP 端口在本机是否可以被监听（true = 空闲可用）。
 */
function isPortAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

/**
 * 从首选端口开始，返回第一个空闲端口。
 * @param {number} preferred 首选端口
 * @param {number[]} fallbacks 备用端口列表（首选被占用时依次尝试）
 */
async function findAvailablePort(preferred, fallbacks = [], host = '0.0.0.0') {
  const candidates = [preferred, ...fallbacks];
  for (const port of candidates) {
    if (await isPortAvailable(port, host)) return port;
  }
  return null;
}

module.exports = {
  scoreAddress,
  getLanAddresses,
  primaryLanAddress,
  isPortAvailable,
  findAvailablePort,
};

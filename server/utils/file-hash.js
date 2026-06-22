const fs = require('fs');
const crypto = require('crypto');

const CHUNK_SIZE = 1024 * 1024; // 1MB 分块，避免大视频整文件入内存

/**
 * 流式计算文件 SHA-256（十六进制）。
 * @param {string} absPath
 * @returns {Promise<string>}
 */
function computeFileHash(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(absPath, { highWaterMark: CHUNK_SIZE });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

module.exports = { computeFileHash };

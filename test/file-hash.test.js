const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { computeFileHash } = require('../server/utils/file-hash');

test('computeFileHash 返回流式 SHA-256 且与一次性计算一致', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-'));
  const file = path.join(dir, 'big.bin');
  const buf = Buffer.from(Array.from({ length: 100000 }, (_, i) => i & 0xff));
  fs.writeFileSync(file, buf);
  const expected = crypto.createHash('sha256').update(buf).digest('hex');
  const got = await computeFileHash(file);
  assert.strictEqual(got, expected);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('computeFileHash 对空文件返回固定哈希', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-'));
  const file = path.join(dir, 'empty.bin');
  fs.writeFileSync(file, Buffer.alloc(0));
  const got = await computeFileHash(file);
  assert.strictEqual(got, crypto.createHash('sha256').digest('hex'));
  fs.rmSync(dir, { recursive: true, force: true });
});

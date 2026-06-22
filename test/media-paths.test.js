const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  sanitizeSegment,
  buildEventFolderName,
  buildTargetRelPath,
  yearFromDate,
  isUncPath,
  resolveCollidingFilename,
} = require('../server/utils/media-paths');

test('sanitizeSegment 去掉非法字符并 trim', () => {
  assert.strictEqual(sanitizeSegment('物流/运动会:*?'), '物流运动会');
  assert.strictEqual(sanitizeSegment('  活动  '), '活动');
  assert.strictEqual(sanitizeSegment('..隐藏.'), '隐藏');
  assert.strictEqual(sanitizeSegment(''), '');
});

test('buildEventFolderName 生成 YYYYMMDD+活动名', () => {
  assert.strictEqual(buildEventFolderName('2026-06-22', '物流运动会'), '20260622物流运动会');
  assert.strictEqual(buildEventFolderName('2026/06/22', '党史学习'), '20260622党史学习');
});

test('yearFromDate 从 YYYYMMDD 取年', () => {
  assert.strictEqual(yearFromDate('20260622物流运动会'), '2026');
  assert.strictEqual(yearFromDate('20260622'), '2026');
});

test('buildTargetRelPath 生成 media/年/活动/设备', () => {
  const p = buildTargetRelPath({ date: '2026-06-22', eventName: '物流运动会', deviceName: 'Sony A7M4' });
  assert.strictEqual(p, 'media/2026/20260622物流运动会/Sony A7M4');
});

test('isUncPath 识别 UNC 前缀', () => {
  assert.strictEqual(isUncPath('\\\\NAS\\素材'), true);
  assert.strictEqual(isUncPath('//NAS/素材'), true);
  assert.strictEqual(isUncPath('D:\\素材库'), false);
  assert.strictEqual(isUncPath('C:/data/media'), false);
});

test('resolveCollidingFilename 同名追加序号', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-'));
  assert.strictEqual(resolveCollidingFilename(dir, 'a.jpg'), 'a.jpg');
  fs.closeSync(fs.openSync(path.join(dir, 'a.jpg'), 'w'));
  assert.strictEqual(resolveCollidingFilename(dir, 'a.jpg'), 'a (1).jpg');
  fs.closeSync(fs.openSync(path.join(dir, 'a (1).jpg'), 'w'));
  assert.strictEqual(resolveCollidingFilename(dir, 'a.jpg'), 'a (2).jpg');
});

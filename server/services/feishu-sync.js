/**
 * 飞书多维表格 ↔ NAS 设备申请 同步服务
 *
 * runSync()：拉取飞书表格新行 → 按设备名匹配 → 导入为待审核借用申请（复用 borrow 模型）
 * writeBackApproval()：管理员审核后把"已通过/已拒绝+审批人"回写飞书对应行
 *
 * 设计要点：
 *  - record_id 为去重键，已 synced/backed 的行不重复导入；error 行每次重试
 *  - 设备名匹配不到 → markError 跳过，不产生脏数据，管理员改对名字后下次自动重试
 *  - 整体 try/catch，绝不崩定时器；回写尽力而为，失败仅 log
 */
const config = require('../config');
const feishu = require('./feishu');
const { borrow: borrowModel, device: deviceModel, feishuSync: syncModel } = require('../models');

// 飞书表格列名契约（成员建表时按此命名列）
const COL = {
  applicant: '申请人',
  device: '设备',
  purpose: '用途',
  borrowAt: '借用时间',
  expectedReturnAt: '预计归还',
  note: '备注',
  status: '审批状态',
  approver: '审批人',
};

// 内存中的最近一次同步状态（供 /status 接口读取）
let lastSync = { at: null, imported: 0, errors: 0, message: '尚未同步' };

/**
 * 把飞书字段值归一化为字符串。
 * 飞书按列类型返回不同结构：文本=string / 多行文本=[{text:"…"}] / 日期=毫秒时间戳 number / 单选=选项名 string
 */
function normalizeField(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    // 日期字段返回毫秒时间戳；合理范围过滤后转成本地 YYYY-MM-DDTHH:mm
    if (value > 946684800000 && value < 32503680000000) {
      const d = new Date(value);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return String(value);
  }
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    // 多行文本 / 富文本 / 人员等数组结构，取每段 text 拼接
    return value
      .map((seg) => (seg && typeof seg === 'object' ? (seg.text || seg.name || '') : String(seg)))
      .join('')
      .trim();
  }
  if (typeof value === 'object') return String(value.text || value.name || '');
  return String(value);
}

/** 处理单行：导入或标记异常。返回 'imported' | 'error' | 'skipped' */
function processRecord(record) {
  const { record_id, fields } = record;
  if (!record_id) return 'skipped';

  // 已成功导入（synced/backed）→ 跳过；error 行则重试
  const existing = syncModel.getByRecordId(record_id);
  if (existing && (existing.status === 'synced' || existing.status === 'backed')) return 'skipped';

  const applicant = normalizeField(fields[COL.applicant]);
  const deviceName = normalizeField(fields[COL.device]);
  const purpose = normalizeField(fields[COL.purpose]);
  const borrowAt = normalizeField(fields[COL.borrowAt]);
  const expectedReturnAt = normalizeField(fields[COL.expectedReturnAt]);
  const note = normalizeField(fields[COL.note]);

  // 必填校验
  if (!applicant || !deviceName || !purpose || !borrowAt || !expectedReturnAt) {
    syncModel.markError(record_id, `信息不完整（申请人/设备/用途/借用时间/预计归还 必填）`);
    return 'error';
  }

  // 设备名匹配
  const device = deviceModel.getDeviceByName(deviceName);
  if (!device) {
    syncModel.markError(record_id, `设备「${deviceName}」未找到，请核对设备名`);
    return 'error';
  }

  // 导入为待审核借用申请
  try {
    const created = borrowModel.createBorrowRequest({
      applicant,
      device_id: device.id,
      purpose,
      borrow_at: borrowAt,
      expected_return_at: expectedReturnAt,
      note,
      created_by: 'feishu-sync',
    });
    syncModel.markImported(record_id, created.id);
    return 'imported';
  } catch (e) {
    syncModel.markError(record_id, `导入失败: ${e.message || e}`);
    return 'error';
  }
}

/** 回写审批状态到飞书（尽力而为，失败仅 log，不抛出） */
async function writeBackApproval(borrowRequestId, action, approverName) {
  try {
    const entry = syncModel.getByBorrowId(borrowRequestId);
    if (!entry || entry.status === 'backed') return;
    const statusText = action === 'approved' ? '已通过' : action === 'rejected' ? '已拒绝' : '';
    if (!statusText) return;
    await feishu.updateRecord(entry.record_id, {
      [COL.status]: statusText,
      [COL.approver]: approverName || '',
    });
    syncModel.markBacked(entry.record_id);
  } catch (e) {
    console.error('[Feishu] 回写失败:', e.message || e);
    // 不抛出：审核本身已成功，回写失败留给下次 runSync 重试
  }
}

/** 重试未回写的已审核申请（每次 runSync 顺带跑一遍，保证最终一致） */
async function retryWritebacks() {
  const pending = syncModel.listPendingWriteback();
  for (const entry of pending) {
    if (!entry.borrow_request_id) continue;
    const br = borrowModel.getBorrowRequestById(entry.borrow_request_id);
    if (!br) continue;
    if (br.status === 'approved' || br.status === 'rejected') {
      await writeBackApproval(entry.borrow_request_id, br.status, br.approved_by || '');
    }
  }
}

/** 主同步流程：拉取 → 逐行处理 → 重试回写 */
async function runSync() {
  if (!config.FEISHU.enabled) {
    lastSync = { ...lastSync, message: '未启用' };
    return lastSync;
  }
  let imported = 0;
  let errors = 0;
  let message = '';
  try {
    const records = await feishu.listAllRecords();
    for (const rec of records) {
      const r = processRecord(rec);
      if (r === 'imported') imported++;
      else if (r === 'error') errors++;
    }
    await retryWritebacks();
    message = `拉取 ${records.length} 行，新导入 ${imported}，异常 ${errors}`;
    lastSync = { at: new Date().toISOString(), imported, errors, message };
  } catch (e) {
    message = `同步失败: ${e.message || e}`;
    lastSync = { at: new Date().toISOString(), imported, errors, message };
    console.error('[Feishu] 同步失败:', e.message || e);
  }
  return lastSync;
}

function getStatus() {
  const stats = syncModel.stats();
  return {
    enabled: config.FEISHU.enabled,
    intervalSec: config.FEISHU.intervalSec,
    lastSyncAt: lastSync.at,
    message: lastSync.message,
    imported: lastSync.imported,
    errors: lastSync.errors,
    stats,
  };
}

module.exports = { runSync, writeBackApproval, getStatus, normalizeField, COL };

/**
 * 飞书开放平台 API 客户端（零依赖，用 Node 内置 fetch）
 * 文档：https://open.feishu.cn/document
 *
 * 仅做三件事：
 *   1. getTenantAccessToken() —— 自建应用换取 tenant_access_token（带缓存）
 *   2. listAllRecords()       —— 分页拉取多维表格全部记录
 *   3. updateRecord()         —— 回写单行字段（用于双向同步的审批状态回写）
 *
 * 所有网络错误 / 业务非零 code 都抛异常，由调用方（feishu-sync.js）兜底，绝不崩进程。
 */
const config = require('../config');

const BASE = 'https://open.feishu.cn';

// tenant_access_token 缓存（飞书默认有效期约 2 小时）
let tokenCache = { token: '', expireAt: 0 };

/** 带 10 秒超时的 fetch 封装 */
async function fetchJSON(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    const text = await resp.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch (_) { throw new Error(`飞书返回非 JSON: ${text.slice(0, 200)}`); }
    if (!resp.ok) {
      const msg = data?.msg || data?.message || `HTTP ${resp.status}`;
      throw new Error(`飞书请求失败: ${msg}`);
    }
    // 飞书业务层用 code != 0 表示失败
    if (data && typeof data.code === 'number' && data.code !== 0) {
      throw new Error(`飞书业务错误[${data.code}]: ${data.msg || ''}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** 获取（或刷新）tenant_access_token */
async function getTenantAccessToken() {
  const now = Date.now();
  // 临近过期（≤5 分钟）则刷新
  if (tokenCache.token && now < tokenCache.expireAt - 5 * 60 * 1000) {
    return tokenCache.token;
  }
  const data = await fetchJSON(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: config.FEISHU.appId, app_secret: config.FEISHU.appSecret }),
  });
  const token = data?.tenant_access_token;
  if (!token) throw new Error('未取到 tenant_access_token');
  const expire = Number(data?.expire) || 7200;
  tokenCache = { token, expireAt: now + expire * 1000 };
  return token;
}

/**
 * 分页拉取多维表格全部记录。
 * 返回 [{ record_id, fields }] —— fields 以列名为键，值类型随列类型而异
 * （文本=string / 多行文本=[{text}] / 日期=毫秒时间戳 number / 单选=选项名 string）
 */
async function listAllRecords() {
  const token = await getTenantAccessToken();
  const { appToken, tableId } = config.FEISHU;
  const base = `${BASE}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
  const headers = { Authorization: `Bearer ${token}` };
  const out = [];
  let pageToken = '';
  for (let guard = 0; guard < 100; guard++) {
    const url = `${base}?page_size=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
    const data = await fetchJSON(url, { method: 'GET', headers });
    const items = data?.data?.items || [];
    for (const it of items) out.push({ record_id: it.record_id, fields: it.fields || {} });
    if (!data?.data?.has_more) break;
    pageToken = data?.data?.page_token || '';
    if (!pageToken) break;
  }
  return out;
}

/** 回写单行字段（用于把审批状态/审批人写回飞书） */
async function updateRecord(recordId, fields) {
  const token = await getTenantAccessToken();
  const { appToken, tableId } = config.FEISHU;
  const url = `${BASE}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
  const data = await fetchJSON(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ fields }),
  });
  return data?.data?.record || null;
}

module.exports = { getTenantAccessToken, listAllRecords, updateRecord };

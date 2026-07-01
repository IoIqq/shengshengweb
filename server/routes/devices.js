const express = require('express');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { device: deviceModel } = require('../models');
const { run, saveDatabase } = require('../models/database');
const { requireAuth, requireAdmin, requireEditor, requirePermission } = require('../middleware/auth');
const config = require('../config');
const { nowIso } = require('../utils');

// 设备图片上传限流（与媒体/头像一致）
const deviceImageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: '上传过于频繁，请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

const DEVICE_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const deviceImageUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, config.DEVICE_IMAGE_DIR);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      cb(null, `device-${timestamp}-${random}${ext}`);
    },
  }),
  limits: {
    fileSize: (config.MAX_AVATAR_MB || 5) * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImage = typeof file.mimetype === 'string' && file.mimetype.startsWith('image/');
    if (!isImage || !DEVICE_IMAGE_EXTS.has(ext)) {
      const err = new Error('只能上传图片文件（PNG、JPG、WEBP、GIF）。');
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

function logDeviceActivity(title, meta, detail) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  run(
    `INSERT INTO activity (id, title, meta, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [`act-${timestamp}-${random}`, title, meta, detail, nowIso()],
  );
  saveDatabase();
}

// GET /api/devices/options - datalist 推荐数据（先于 /:id 注册避免被吞）
router.get('/options', requireAuth, requirePermission('device:read'), (req, res) => {
  try {
    res.json({
      ok: true,
      categories: deviceModel.getDistinctValues('category'),
      locations: deviceModel.getDistinctValues('location'),
      owners: deviceModel.getDistinctValues('owner'),
    });
  } catch (error) {
    res.status(500).json({ error: '获取设备选项失败。' });
  }
});

// GET /api/devices - Get device list with filters
router.get('/', requireAuth, requirePermission('device:read'), (req, res) => {
  try {
    const items = deviceModel.getDeviceList(req.query || {});
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ error: '获取设备列表失败。' });
  }
});

// GET /api/devices/:id - Get single device
router.get('/:id', requireAuth, requirePermission('device:read'), (req, res) => {
  try {
    const id = String(req.params.id || '');
    const device = deviceModel.getDeviceById(id);

    if (!device) {
      return res.status(404).json({ error: '设备不存在。' });
    }

    res.json({ ok: true, item: deviceModel.deviceRowToItem(device) });
  } catch (error) {
    res.status(500).json({ error: '获取设备信息失败。' });
  }
});

function parsePrice(value) {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function isValidDateOrEmpty(value) {
  if (!value) return true;
  return !Number.isNaN(Date.parse(value));
}

// POST /api/devices - Create device
router.post('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const category = String(body.category || '').trim();
    const assetNo = String(body.assetNo || '').trim();

    if (!name || !category || !assetNo) {
      return res.status(400).json({ error: '请填写设备名称、类别和编号。' });
    }

    const price = parsePrice(body.price);
    if (price === null) {
      return res.status(400).json({ error: '采购价格需为非负数字。' });
    }

    const status = String(body.status || 'available');
    const model = String(body.model || '').trim();
    const purchaseDate = String(body.purchaseDate || '').trim();
    const image = String(body.image || '').trim();
    const serialNo = String(body.serialNo || '').trim();
    const warrantyUntil = String(body.warrantyUntil || '').trim();
    const location = String(body.location || '').trim();
    const owner = String(body.owner || '').trim();
    const note = String(body.note || '').trim();

    if (!isValidDateOrEmpty(purchaseDate)) {
      return res.status(400).json({ error: '采购日期格式无效。' });
    }
    if (!isValidDateOrEmpty(warrantyUntil)) {
      return res.status(400).json({ error: '保修到期日期格式无效。' });
    }

    const device = deviceModel.createDevice({
      name,
      category,
      asset_no: assetNo,
      status,
      model,
      purchase_date: purchaseDate,
      image,
      serial_no: serialNo,
      warranty_until: warrantyUntil,
      price,
      location,
      owner,
      note,
    });

    logDeviceActivity('设备登记', req.user?.username || 'unknown', `新增设备 ${name}（${assetNo}）`);

    res.json({ ok: true, item: deviceModel.deviceRowToItem(device) });
  } catch (error) {
    if (error.message.includes('资产编号已存在')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: '创建设备失败。' });
  }
});

// PATCH /api/devices/:id - Update device
router.patch('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const body = req.body || {};

    const updates = {};
    if (body.name !== undefined) updates.name = String(body.name || '').trim();
    if (body.category !== undefined) updates.category = String(body.category || '').trim();
    if (body.assetNo !== undefined) updates.assetNo = String(body.assetNo || '').trim();
    if (body.status !== undefined) updates.status = String(body.status || '').trim();
    if (body.location !== undefined) updates.location = String(body.location || '').trim();
    if (body.owner !== undefined) updates.owner = String(body.owner || '').trim();
    if (body.note !== undefined) updates.note = String(body.note || '').trim();
    if (body.model !== undefined) updates.model = String(body.model || '').trim();
    if (body.purchaseDate !== undefined) updates.purchaseDate = String(body.purchaseDate || '').trim();
    if (body.image !== undefined) updates.image = String(body.image || '').trim();
    if (body.serialNo !== undefined) updates.serialNo = String(body.serialNo || '').trim();
    if (body.warrantyUntil !== undefined) updates.warrantyUntil = String(body.warrantyUntil || '').trim();
    if (body.price !== undefined) {
      const price = parsePrice(body.price);
      if (price === null) {
        return res.status(400).json({ error: '采购价格需为非负数字。' });
      }
      updates.price = price;
    }

    if (updates.purchaseDate !== undefined && !isValidDateOrEmpty(updates.purchaseDate)) {
      return res.status(400).json({ error: '采购日期格式无效。' });
    }
    if (updates.warrantyUntil !== undefined && !isValidDateOrEmpty(updates.warrantyUntil)) {
      return res.status(400).json({ error: '保修到期日期格式无效。' });
    }

    const updated = deviceModel.updateDevice(id, updates);

    if (!updated) {
      return res.status(404).json({ error: '设备不存在。' });
    }

    res.json({ ok: true, item: deviceModel.deviceRowToItem(updated) });
  } catch (error) {
    if (error.message.includes('资产编号已存在')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: '更新设备失败。' });
  }
});

// POST /api/devices/:id/image - 上传设备图片
router.post(
  '/:id/image',
  deviceImageLimiter,
  requireAuth,
  requireEditor,
  (req, res) => {
    deviceImageUpload.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `图片大小超过 ${config.MAX_AVATAR_MB || 5}MB 限制。` });
        }
        if (err.statusCode === 400) {
          return res.status(400).json({ error: err.message });
        }
        return res.status(500).json({ error: '图片上传失败，请重试。' });
      }

      const id = String(req.params.id || '');
      if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的图片。' });
      }

      // 设备 ID 为空表示新建模式：仅返回 URL，不绑定。设备保存时随表单提交。
      const imageUrl = `/uploads/devices/${req.file.filename}`;
      if (!id || id === 'new') {
        return res.json({ ok: true, imageUrl });
      }

      const existing = deviceModel.getDeviceById(id);
      if (!existing) {
        return res.status(404).json({ error: '设备不存在。' });
      }

      const updated = deviceModel.updateDevice(id, { image: imageUrl });
      logDeviceActivity('设备图片更新', req.user?.username || 'unknown', `${existing.name} 更新了图片`);

      res.json({ ok: true, imageUrl, item: deviceModel.deviceRowToItem(updated) });
    });
  },
);

// DELETE /api/devices/:id - Delete device
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = String(req.params.id || '');
    const existing = deviceModel.getDeviceById(id);

    if (!existing) {
      return res.status(404).json({ error: '设备不存在。' });
    }

    deviceModel.deleteDevice(id);
    logDeviceActivity('设备删除', req.user?.username || 'unknown', `${existing.name} 已删除`);
    res.json({ ok: true });
  } catch (error) {
    if (error.message.includes('借出中')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: '删除设备失败。' });
  }
});

module.exports = router;

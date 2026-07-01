const express = require('express');
const router = express.Router();
const { topicLibrary: topicModel } = require('../models');
const { requireAuth, requireEditor } = require('../middleware/auth');
const crypto = require('crypto');

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// 提取域名
function extractHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

// 根据域名猜测平台类型
function detectPlatform(url) {
  try {
    const host = new URL(url).hostname;
    if (/bilibili\.com$/i.test(host)) return 'bilibili';
    if (/youtube\.com$/i.test(host)) return 'youtube';
    if (/vimeo\.com$/i.test(host)) return 'vimeo';
    if (/douyin\.com$/i.test(host)) return 'douyin';
    return 'other';
  } catch (_) {
    return 'other';
  }
}

// 白名单生成嵌入 URL
function buildEmbedUrl(url, platform) {
  try {
    const u = new URL(url);
    if (platform === 'bilibili') {
      const bvMatch = u.pathname.match(/\/(BV\w+)/) || u.pathname.match(/\/video\/(\w+)/);
      if (bvMatch) return `//player.bilibili.com/player.html?bvid=${bvMatch[1]}`;
    }
    if (platform === 'youtube') {
      const ytId = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
      if (ytId) return `//www.youtube.com/embed/${ytId}`;
    }
    if (platform === 'vimeo') {
      const vimeoId = u.pathname.split('/').filter(Boolean).pop();
      if (vimeoId && /^\d+$/.test(vimeoId)) return `//player.vimeo.com/video/${vimeoId}`;
    }
    return '';
  } catch (_) {
    return '';
  }
}

// 简单 URL 校验
function isValidUrl(value) {
  try {
    const u = new URL(value);
    if (!/^https?:$/i.test(u.protocol)) return false;
    const host = u.hostname;
    if (!host || host === 'localhost' || host.startsWith('127.') || host.startsWith('10.') ||
        host.startsWith('192.168.') || host.startsWith('172.16.') || host.startsWith('169.254.')) return false;
    return true;
  } catch (_) {
    return false;
  }
}

router.get('/', requireAuth, (req, res) => {
  try {
    const topics = topicModel.getTopicList();
    res.json({ ok: true, items: topics });
  } catch (error) {
    console.error('获取选题库失败:', error);
    res.status(500).json({ error: '获取选题库失败。' });
  }
});

router.post('/', requireAuth, requireEditor, (req, res) => {
  const title = String(req.body?.title || '').trim();
  const sourceUrl = String(req.body?.sourceUrl || '').trim();

  if (!title) return res.status(400).json({ error: '请输入选题标题。' });
  if (!sourceUrl) return res.status(400).json({ error: '请输入流媒体链接。' });
  if (!isValidUrl(sourceUrl)) return res.status(400).json({ error: '链接无效或包含不安全的地址。' });

  const host = extractHost(sourceUrl);
  const platform = detectPlatform(sourceUrl);
  const embedUrl = buildEmbedUrl(sourceUrl, platform);
  const id = randomId('topic');
  const createdBy = req.user?.username || '';

  try {
    const topic = topicModel.createTopic({
      id, title,
      sourceUrl, sourceHost: host, sourcePlatform: platform,
      embedUrl, description: String(req.body?.description || '').trim(),
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      status: ['idea', 'researching', 'selected', 'archived'].includes(req.body?.status) ? req.body.status : 'idea',
      createdBy,
    });
    res.json({ ok: true, item: topic });
  } catch (error) {
    console.error('创建选题失败:', error);
    res.status(500).json({ error: '创建选题失败。' });
  }
});

router.patch('/:id', requireAuth, requireEditor, (req, res) => {
  const id = req.params.id;
  try {
    const existing = topicModel.getTopicById(id);
    if (!existing) return res.status(404).json({ error: '选题不存在。' });

    const updates = {};
    if (req.body.title !== undefined) {
      updates.title = String(req.body.title).trim();
      if (!updates.title) return res.status(400).json({ error: '标题不能为空。' });
    }
    if (req.body.sourceUrl !== undefined) {
      const url = String(req.body.sourceUrl).trim();
      if (url && !isValidUrl(url)) return res.status(400).json({ error: '链接无效或包含不安全的地址。' });
      if (url) {
        updates.sourceUrl = url;
        updates.sourceHost = extractHost(url);
        updates.sourcePlatform = detectPlatform(url);
        updates.embedUrl = buildEmbedUrl(url, updates.sourcePlatform);
      }
    }
    if (req.body.description !== undefined) updates.description = String(req.body.description).trim();
    if (req.body.tags !== undefined) updates.tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    if (req.body.status !== undefined) {
      if (!['idea', 'researching', 'selected', 'archived'].includes(req.body.status)) {
        return res.status(400).json({ error: '状态值不合法。' });
      }
      updates.status = req.body.status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '没有提供需要更新的字段。' });
    }

    const updated = topicModel.updateTopic(id, updates);
    res.json({ ok: true, item: updated });
  } catch (error) {
    console.error('更新选题失败:', error);
    res.status(500).json({ error: '更新选题失败。' });
  }
});

router.delete('/:id', requireAuth, requireEditor, (req, res) => {
  const id = req.params.id;
  try {
    const existing = topicModel.getTopicById(id);
    if (!existing) return res.status(404).json({ error: '选题不存在。' });
    topicModel.deleteTopic(id);
    res.json({ ok: true });
  } catch (error) {
    console.error('删除选题失败:', error);
    res.status(500).json({ error: '删除选题失败。' });
  }
});

module.exports = router;

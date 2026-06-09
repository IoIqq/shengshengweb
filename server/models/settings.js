const config = require('../config');
const { get, run, saveDatabase, transaction } = require('./database');
const { nowIso } = require('../utils');

const DEFAULT_SHOWCASE_SETTINGS = {
  enabled: true,
  brand: '声声工作室 · 创作展示',
  heroLabel: 'CREATIVE SHOWCASE',
  title: '探索创作内容',
  subtitle: '浏览工作室的图片素材与视频作品，感受视觉创意的魅力。',
  footerText: '© 声声网络思政工作室 · Voice Studio',
  limit: 50,
  kindFilter: 'all',
};

const SETTING_DEFAULTS = {
  siteTitle: config.SITE_TITLE,
  siteSubtitle: config.SITE_SUBTITLE,
  homeHeroMessage: '首页只保留最关键的摘要，方便快速进入工作状态。',
  publicUrl: config.PUBLIC_URL,
  adminUsername: config.ADMIN_USERNAME,
  syncMessage: '等待同步',
  lastSyncAt: '',
  showcaseEnabled: '1',
  showcaseBrand: DEFAULT_SHOWCASE_SETTINGS.brand,
  showcaseHeroLabel: DEFAULT_SHOWCASE_SETTINGS.heroLabel,
  showcaseTitle: DEFAULT_SHOWCASE_SETTINGS.title,
  showcaseSubtitle: DEFAULT_SHOWCASE_SETTINGS.subtitle,
  showcaseFooterText: DEFAULT_SHOWCASE_SETTINGS.footerText,
  showcaseLimit: String(DEFAULT_SHOWCASE_SETTINGS.limit),
  showcaseKindFilter: DEFAULT_SHOWCASE_SETTINGS.kindFilter,
};

function getSetting(key, fallback = '') {
  const row = get('SELECT value FROM settings WHERE key = ? LIMIT 1', [key]);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  const existing = get('SELECT key FROM settings WHERE key = ? LIMIT 1', [key]);
  if (existing) {
    run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [value, nowIso(), key]);
  } else {
    run('INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      key,
      value,
      nowIso(),
      nowIso(),
    ]);
  }
}

function boolSetting(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function intSetting(value, fallback, min, max) {
  const next = Number.parseInt(value, 10);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}

function normalizeKindFilter(value) {
  return ['all', 'photo', 'video'].includes(value) ? value : 'all';
}

function getShowcaseSettings() {
  return {
    enabled: boolSetting(getSetting('showcaseEnabled', SETTING_DEFAULTS.showcaseEnabled), true),
    brand: getSetting('showcaseBrand', DEFAULT_SHOWCASE_SETTINGS.brand),
    heroLabel: getSetting('showcaseHeroLabel', DEFAULT_SHOWCASE_SETTINGS.heroLabel),
    title: getSetting('showcaseTitle', DEFAULT_SHOWCASE_SETTINGS.title),
    subtitle: getSetting('showcaseSubtitle', DEFAULT_SHOWCASE_SETTINGS.subtitle),
    footerText: getSetting('showcaseFooterText', DEFAULT_SHOWCASE_SETTINGS.footerText),
    limit: intSetting(getSetting('showcaseLimit', String(DEFAULT_SHOWCASE_SETTINGS.limit)), DEFAULT_SHOWCASE_SETTINGS.limit, 1, 100),
    kindFilter: normalizeKindFilter(getSetting('showcaseKindFilter', DEFAULT_SHOWCASE_SETTINGS.kindFilter)),
  };
}

function getSettings() {
  return {
    siteTitle: getSetting('siteTitle', SETTING_DEFAULTS.siteTitle),
    siteSubtitle: getSetting('siteSubtitle', SETTING_DEFAULTS.siteSubtitle),
    homeHeroMessage: getSetting('homeHeroMessage', SETTING_DEFAULTS.homeHeroMessage),
    publicUrl: getSetting('publicUrl', SETTING_DEFAULTS.publicUrl),
    adminUsername: getSetting('adminUsername', SETTING_DEFAULTS.adminUsername),
    syncMessage: getSetting('syncMessage', SETTING_DEFAULTS.syncMessage),
    lastSyncAt: getSetting('lastSyncAt', SETTING_DEFAULTS.lastSyncAt),
    showcase: getShowcaseSettings(),
  };
}

function getPublicShowcaseSettings() {
  return getShowcaseSettings();
}

function updateSettings(updates = {}) {
  const allowedStringKeys = [
    'siteTitle',
    'siteSubtitle',
    'homeHeroMessage',
    'publicUrl',
    'showcaseBrand',
    'showcaseHeroLabel',
    'showcaseTitle',
    'showcaseSubtitle',
    'showcaseFooterText',
  ];

  transaction(() => {
    for (const key of allowedStringKeys) {
      if (updates[key] !== undefined) {
        setSetting(key, String(updates[key] || '').trim());
      }
    }

    if (updates.showcaseEnabled !== undefined) {
      setSetting('showcaseEnabled', updates.showcaseEnabled ? '1' : '0');
    }
    if (updates.showcaseLimit !== undefined) {
      setSetting('showcaseLimit', String(intSetting(updates.showcaseLimit, DEFAULT_SHOWCASE_SETTINGS.limit, 1, 100)));
    }
    if (updates.showcaseKindFilter !== undefined) {
      setSetting('showcaseKindFilter', normalizeKindFilter(String(updates.showcaseKindFilter)));
    }
  });

  saveDatabase();
  return getSettings();
}

module.exports = {
  getSetting,
  setSetting,
  getSettings,
  getPublicShowcaseSettings,
  updateSettings,
  getShowcaseSettings,
};

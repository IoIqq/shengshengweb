/**
 * 业务模块按需动态加载（路由级 / 角色级代码分割）
 *
 * 设计目标：
 * - 登录页面只加载 core/utils/ui，不加载任何业务模块
 * - 登录成功后先拉「core 包」（所有角色都要的）
 * - admin 角色再拉「admin 包」（settings / users / audit / storage / maintenance / system-admin）
 *   editor / guest 永远不下载这 6 个文件，首屏 JS 进一步缩水
 *
 * 角色提升场景（editor → admin 在线变更）目前需要刷新页面以重新拉 admin 包；
 * 项目无热升级路径。
 *
 * 缓存：浏览器原生 ES Module 加载是天然单例，loadCoreModules / loadAdminModules
 * 都可重复调用。proxies.js 在模块未加载前 no-op，admin 代理在 editor / guest 会话里
 * 也按 no-op 处理（getModules() 返回值里没有那些 key）。
 */

let coreMods = null;
let adminMods = null;

/**
 * 加载所有角色都需要的模块（dashboard / media / todo / team / device / borrow / topics / wishWall / preferences / showcase）
 *
 * 注：
 * - topics 在 router.js 中标为 admin+editor，这里仍放 core 是为了保住「编辑也能看选题库」入口
 * - showcase 是登录前展示页用的，已经在登录前加载，但放进 core 让 getModules() 完整，
 *   避免 proxies.showcase 不同期执行
 * - preferences 在 bootstrap 启动时被调用（应用主题），所有角色必备
 */
export async function loadCoreModules() {
  if (coreMods) return coreMods;
  const [
    dashboard,
    media,
    todo,
    team,
    device,
    borrow,
    topics,
    wishWall,
    preferences,
  ] = await Promise.all([
    import('../modules/dashboard.js'),
    import('../modules/media.js'),
    import('../modules/todo.js'),
    import('../modules/team.js'),
    import('../modules/device.js'),
    import('../modules/borrow.js'),
    import('../modules/topics.js'),
    import('../modules/wish-wall.js'),
    import('../modules/preferences.js'),
  ]);
  coreMods = { dashboard, media, todo, team, device, borrow, topics, wishWall, preferences };
  return coreMods;
}

/**
 * 加载仅 admin 用到的模块（settings / users / audit / storage / maintenance / systemAdmin）
 *
 * 仅在 state.session.user.role === 'admin' 时调用。
 */
export async function loadAdminModules() {
  if (adminMods) return adminMods;
  const [
    settings,
    users,
    audit,
    storage,
    maintenance,
    systemAdmin,
  ] = await Promise.all([
    import('../modules/settings.js'),
    import('../modules/users.js'),
    import('../modules/audit.js'),
    import('../modules/storage.js'),
    import('../modules/maintenance.js'),
    import('../modules/system-admin.js'),
  ]);
  adminMods = { settings, users, audit, storage, maintenance, systemAdmin };
  return adminMods;
}

/**
 * 兼容入口：一次性加载所有模块。
 * 现仅在测试 / 强制场景下使用；常规登录路径请走 loadCoreModules + loadAdminModules（按角色）。
 */
export async function ensureModulesLoaded() {
  await Promise.all([loadCoreModules(), loadAdminModules()]);
  return getModules();
}

/**
 * 获取已加载的业务模块集合（admin 包未加载时不会包含其 key）
 * @returns {object|null} 模块集合；加载完成前为 null
 */
export function getModules() {
  if (!coreMods && !adminMods) return null;
  return { ...(coreMods || {}), ...(adminMods || {}) };
}

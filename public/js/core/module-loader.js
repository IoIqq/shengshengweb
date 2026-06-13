/**
 * 业务模块按需动态加载（路由级代码分割）
 *
 * 设计目标：
 * - 登录页面只加载 core/utils/ui，不加载任何业务模块
 * - 用户登录成功后才并发拉取所有业务模块（仍可缓存复用）
 * - 这样首屏 JS 体积砍掉约 60%+，第二次访问由 HTTP 缓存兜底
 *
 * 缓存：浏览器原生 ES Module 加载是天然单例，ensureModulesLoaded() 可重复调用。
 * 在 ensureModulesLoaded 完成前调用 render* 是安全的：proxies.js 中的代理会直接 no-op。
 */

let mods = null;

/**
 * 并发加载全部业务模块（幂等）
 * @returns {Promise<object>} 模块集合单例
 */
export async function ensureModulesLoaded() {
  if (mods) return mods;
  const [
    dashboard,
    media,
    todo,
    team,
    device,
    borrow,
    settings,
    users,
    audit,
    storage,
    wishWall,
    topics,
    systemAdmin,
  ] = await Promise.all([
    import('../modules/dashboard.js'),
    import('../modules/media.js'),
    import('../modules/todo.js'),
    import('../modules/team.js'),
    import('../modules/device.js'),
    import('../modules/borrow.js'),
    import('../modules/settings.js'),
    import('../modules/users.js'),
    import('../modules/audit.js'),
    import('../modules/storage.js'),
    import('../modules/wish-wall.js'),
    import('../modules/topics.js'),
    import('../modules/system-admin.js'),
  ]);
  mods = { dashboard, media, todo, team, device, borrow, settings, users, audit, storage, wishWall, topics, systemAdmin };
  return mods;
}

/**
 * 获取已加载的业务模块集合
 * @returns {object|null} 模块集合；加载完成前为 null
 */
export function getModules() {
  return mods;
}

// 角色权限映射
const ROLE_PERMISSIONS = {
  admin: ['*'],  // 全部权限
  editor: [
    'media:read', 'media:create', 'media:update', 'media:review',
    'todo:read', 'todo:create', 'todo:update', 'todo:delete',
    'team:read',
    'device:read',
    'borrow:read', 'borrow:create',
    'wish:read', 'wish:create',
    'profile:update'
  ],
  guest: [
    'media:read',
    'todo:read',
    'team:read',
    'wish:read'
  ]
};

/**
 * 检查用户是否有指定权限
 */
function hasPermission(role, permission) {
  if (!role || !ROLE_PERMISSIONS[role]) return false;

  const permissions = ROLE_PERMISSIONS[role];

  // 管理员有所有权限
  if (permissions.includes('*')) return true;

  // 检查精确匹配
  if (permissions.includes(permission)) return true;

  // 检查通配符匹配 (例如 media:* 匹配 media:read)
  const [resource] = permission.split(':');
  if (permissions.includes(`${resource}:*`)) return true;

  return false;
}

module.exports = {
  ROLE_PERMISSIONS,
  hasPermission
};

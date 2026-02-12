/**
 * 头像颜色生成工具
 */

/**
 * 基于字符串生成一致的颜色
 * @param str 输入字符串（如用户名）
 * @returns HSL 颜色值
 */
export function generateAvatarColor(str: string): string {
  // 使用简单的哈希算法
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // 生成色相（0-360）
  const hue = Math.abs(hash % 360);

  // 饱和度（60-80%）- 确保颜色不会太灰
  const saturation = 60 + (Math.abs(hash >> 8) % 20);

  // 亮度（40-55%）- 确保在深色背景上有足够对比度
  const lightness = 40 + (Math.abs(hash >> 16) % 15);

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * 获取角色的默认头像颜色
 * @param role 消息角色
 * @returns CSS 颜色值
 */
export function getRoleAvatarColor(role: string): string {
  switch (role) {
    case 'user':
      return 'var(--accent)';
    case 'assistant':
      return '#3ba55c';
    case 'tool':
      return '#faa61a';
    case 'system':
      return '#ed4245';
    default:
      return '#72767d';
  }
}

/**
 * 获取消息的个性化头像颜色
 * @param role 消息角色
 * @param identifier 标识符（如用户ID或会话ID）
 * @returns CSS 颜色值
 */
export function getMessageAvatarColor(role: string, identifier?: string): string {
  // 对于用户消息，使用基于标识符的个性化颜色
  if (role === 'user' && identifier) {
    return generateAvatarColor(identifier);
  }

  // 其他角色使用默认颜色
  return getRoleAvatarColor(role);
}

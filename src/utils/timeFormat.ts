/**
 * 时间格式化工具函数
 */

/**
 * 格式化相对时间
 * @param timestamp 时间戳（毫秒）
 * @returns 格式化的时间字符串
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  // 1分钟内
  if (diff < 60 * 1000) {
    return '刚刚';
  }

  // 1小时内
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}分钟前`;
  }

  // 今天
  const today = new Date();
  const messageDate = new Date(timestamp);

  if (
    messageDate.getDate() === today.getDate() &&
    messageDate.getMonth() === today.getMonth() &&
    messageDate.getFullYear() === today.getFullYear()
  ) {
    return `今天 ${formatTime(messageDate)}`;
  }

  // 昨天
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (
    messageDate.getDate() === yesterday.getDate() &&
    messageDate.getMonth() === yesterday.getMonth() &&
    messageDate.getFullYear() === yesterday.getFullYear()
  ) {
    return `昨天 ${formatTime(messageDate)}`;
  }

  // 更早
  return formatDate(messageDate);
}

/**
 * 格式化时间（HH:MM）
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化完整日期（MM-DD HH:MM）
 */
function formatDate(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const time = formatTime(date);
  return `${month}-${day} ${time}`;
}

/**
 * 检查两条消息是否应该分组显示
 * @param prevMessage 前一条消息
 * @param currentMessage 当前消息
 * @param timeGapMs 时间间隔阈值（毫秒），默认 5 分钟
 */
export function shouldGroupMessages(
  prevMessage: { role: string; timestamp: number },
  currentMessage: { role: string; timestamp: number },
  timeGapMs: number = 5 * 60 * 1000
): boolean {
  // 角色不同，不分组
  if (prevMessage.role !== currentMessage.role) {
    return false;
  }

  // 时间间隔超过阈值，不分组
  const timeDiff = currentMessage.timestamp - prevMessage.timestamp;
  if (timeDiff > timeGapMs) {
    return false;
  }

  return true;
}

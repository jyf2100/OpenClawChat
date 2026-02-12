/**
 * 协议处理工具
 * 参考：/Volumes/work/workspace/clawchat/pages/chat/chat.js:9-74
 */

import type {
  ChatMessage,
  ContentBlock,
  ImageSource,
  MessageRole,
  RenderedMessage,
  Attachment
} from '../types';

/**
 * 生成 UUID
 */
export function generateUUID(): string {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 格式化时间
 * @param ts 时间戳（毫秒）
 * @returns 格式化后的时间字符串（HH:MM）
 */
export function formatTime(ts: number): string {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 提取消息文本内容
 * @param message 消息对象
 * @returns 纯文本内容
 */
export function extractText(message: ChatMessage | undefined | null): string {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((item) => (item?.type === 'text' && typeof item.text === 'string' ? item.text : null))
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }
  if (typeof message?.text === 'string') return message.text;
  return '';
}

/**
 * 推测 MIME 类型
 * @param path 文件路径
 * @returns MIME 类型
 */
export function guessMime(path: string): string {
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

/**
 * 提取消息中的图片
 * @param message 消息对象
 * @returns 图片 URL 或 Data URL 数组
 */
export function extractImages(message: ChatMessage | undefined | null): string[] {
  const content = message?.content;
  if (!Array.isArray(content)) return [];

  const images: string[] = [];
  for (const item of content) {
    if (item?.type !== 'image') continue;
    const source = item?.source;
    if (!source) continue;

    if (typeof source.url === 'string') {
      images.push(source.url);
      continue;
    }

    if (source.type === 'base64' && typeof source.data === 'string') {
      const mediaType = source.media_type || 'image/png';
      images.push(`data:${mediaType};base64,${source.data}`);
    }
  }
  return images;
}

/**
 * 规范化消息角色
 * @param message 消息对象
 * @returns 规范化后的角色
 */
export function normalizeRole(message: ChatMessage | undefined | null): MessageRole {
  const role = typeof message?.role === 'string' ? message.role : 'assistant';
  const lower = role.toLowerCase();
  if (lower === 'toolresult' || lower === 'tool_result' || lower === 'tool') return 'tool';
  return lower === 'user' ? 'user' : 'assistant';
}

/**
 * 获取头像标签
 * @param role 消息角色
 * @returns 头像显示的文本
 */
export function avatarLabel(role: MessageRole): string {
  if (role === 'user') return '你';
  if (role === 'tool') return '工具';
  return '助手';
}

/**
 * 构建渲染消息列表
 * @param messages 消息数组
 * @param streamText 流式文本
 * @param streamStartedAt 流式开始时间
 * @returns 渲染消息数组
 */
export function buildRenderedMessages(
  messages: ChatMessage[],
  streamText: string | null = null,
  streamStartedAt: number | null = null
): RenderedMessage[] {
  const items: RenderedMessage[] = [];

  // 处理已保存的消息
  for (const msg of messages) {
    const role = normalizeRole(msg);
    const text = extractText(msg);
    const images = extractImages(msg);
    items.push({
      id: msg.id || generateUUID(),
      domId: `msg-${msg.id || generateUUID()}`,
      role,
      avatar: avatarLabel(role),
      text: text || '',
      images,
      time: formatTime(msg.timestamp || Date.now()),
      streaming: false,
      loading: false,
    });
  }

  // 处理流式消息
  if (streamText !== null) {
    const text = streamText || '';
    const loading = text.trim() === '';
    items.push({
      id: `stream-${streamStartedAt || Date.now()}`,
      domId: `stream-${streamStartedAt || Date.now()}`,
      role: 'assistant',
      avatar: 'AI',
      text,
      images: [],
      time: formatTime(streamStartedAt || Date.now()),
      streaming: true,
      loading,
    });
  }

  return items;
}

/**
 * 创建文本内容块
 * @param text 文本内容
 * @returns 内容块
 */
export function createTextContentBlock(text: string): ContentBlock {
  return { type: 'text', text };
}

/**
 * 创建图片内容块
 * @param source 图片来源
 * @returns 内容块
 */
export function createImageContentBlock(source: ImageSource): ContentBlock {
  return { type: 'image', source };
}

/**
 * 将附件转换为内容块
 * @param attachments 附件数组
 * @returns 内容块数组
 */
export function attachmentsToContentBlocks(attachments: Array<{
  mimeType: string;
  base64: string;
}>): ContentBlock[] {
  return attachments.map((att) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: att.mimeType,
      data: att.base64,
    },
  }));
}

/**
 * 创建用户消息
 * @param text 文本内容
 * @param attachments 附件数组
 * @returns 消息对象
 */
export function createUserMessage(
  text: string,
  attachments: Attachment[] = []
): ChatMessage {
  const contentBlocks: ContentBlock[] = [];
  if (text) {
    contentBlocks.push(createTextContentBlock(text));
  }
  if (attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === 'image' && att.content) {
        contentBlocks.push(createImageContentBlock({
          type: 'base64',
          media_type: att.mimeType || 'image/png',
          data: att.content,
        }));
      }
    }
  }

  return {
    id: generateUUID(),
    role: 'user',
    content: contentBlocks.length > 0 ? contentBlocks : text,
    timestamp: Date.now(),
    state: 'pending',
  };
}

/**
 * 创建错误消息
 * @param error 错误信息
 * @returns 消息对象
 */
export function createErrorMessage(error: string): ChatMessage {
  return {
    id: generateUUID(),
    role: 'assistant',
    content: [{ type: 'text', text: `错误：${error}` }],
    timestamp: Date.now(),
  };
}

/**
 * 判断消息是否为图片消息
 * @param message 消息对象
 * @returns 是否为图片消息
 */
export function isImageMessage(message: ChatMessage): boolean {
  const images = extractImages(message);
  return images.length > 0 && extractText(message).trim() === '';
}

/**
 * 判断消息是否为文本消息
 * @param message 消息对象
 * @returns 是否为文本消息
 */
export function isTextMessage(message: ChatMessage): boolean {
  return extractText(message).trim() !== '';
}

/**
 * 判断消息是否包含附件
 * @param message 消息对象
 * @returns 是否包含附件
 */
export function hasAttachments(message: ChatMessage): boolean {
  return extractImages(message).length > 0;
}

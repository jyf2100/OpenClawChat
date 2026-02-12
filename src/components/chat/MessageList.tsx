/**
 * 消息列表组件 - 使用虚拟滚动优化大消息量性能
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  memo,
} from 'react';
import { VariableSizeList as List, type ListChildComponentProps } from 'react-window';
import type { RenderedMessage } from '../../types';
import { MessageItem } from './MessageItem';
import { shouldGroupMessages } from '../../utils/timeFormat';

export interface MessageListProps {
  messages: RenderedMessage[];
  loading?: boolean;
  emptyMessage?: string;
  onImageClick?: (imageUrl: string) => void;
  onCopyCode?: (code: string) => void;
  onMessageAction?: (messageId: string, action: string) => void;
  className?: string;
  isSelectionMode?: boolean;
  onToggleSelection?: (messageId: string) => void;
}

interface MessageWithGrouping extends RenderedMessage {
  isGrouped: boolean;
  showHeader: boolean;
}

// 虚拟滚动阈值 - 消息数量超过此值时使用虚拟滚动
const VIRTUAL_SCROLL_THRESHOLD = 100;

/**
 * 估算消息高度（基于内容长度和类型）
 * 注意：这只是初始估算，实际高度会在渲染后测量
 */
const estimateMessageHeight = (message: RenderedMessage): number => {
  const baseHeight = 80; // 头像、内边距等基础高度
  let contentHeight = 0;

  if (message.text) {
    // 更保守的估算：每行约 30 字符（考虑中文字符宽度），行高 24px
    const lines = Math.ceil(message.text.length / 30);
    contentHeight = Math.max(lines * 24, 40);

    // Markdown 格式化会增加额外高度（标题、列表、引用等）
    const hasFormatting =
      message.text.includes('#') ||
      message.text.includes('- ') ||
      message.text.includes('* ') ||
      message.text.includes('> ') ||
      message.text.includes('**') ||
      message.text.includes('```');

    if (hasFormatting) {
      contentHeight *= 1.3; // 增加 30% 容纳格式化
    }
  }

  // 图片高度
  const imageHeight = message.images?.length ? message.images.length * 200 : 0;

  // 代码块高度
  const codeBlockCount = (message.text?.match(/```/g)?.length || 0) / 2;
  const codeHeight = codeBlockCount * 100;

  return Math.max(baseHeight + contentHeight + imageHeight + codeHeight, 100);
};

/**
 * 普通消息列表渲染（用于消息数量较少时）
 */
function RegularMessageList({
  messages,
  onImageClick,
  onCopyCode,
  onMessageAction,
  isSelectionMode,
  onToggleSelection,
}: {
  messages: MessageWithGrouping[];
  onImageClick?: (imageUrl: string) => void;
  onCopyCode?: (code: string) => void;
  onMessageAction?: (messageId: string, action: string) => void;
  isSelectionMode?: boolean;
  onToggleSelection?: (messageId: string) => void;
}) {
  const listEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <>
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          onImageClick={onImageClick}
          onCopyCode={onCopyCode}
          onAction={onMessageAction}
          isGrouped={message.isGrouped ?? undefined}
          showHeader={message.showHeader ?? undefined}
          isSelectionMode={isSelectionMode}
          onToggleSelection={onToggleSelection}
          isLastMessage={index === messages.length - 1}
        />
      ))}
      <div ref={listEndRef} />
    </>
  );
}

/**
 * 虚拟列表项数据
 */
interface ListItemData {
  messages: MessageWithGrouping[];
  onImageClick?: (imageUrl: string) => void;
  onCopyCode?: (code: string) => void;
  onMessageAction?: (messageId: string, action: string) => void;
  isSelectionMode?: boolean;
  onToggleSelection?: (messageId: string) => void;
  setMeasuredHeight?: (index: number, height: number) => void;
}

/**
 * 虚拟列表行组件 - 带高度测量
 */
const MessageRow = memo(function MessageRow({
  index,
  style,
  data,
}: ListChildComponentProps<ListItemData>) {
  const { messages, onImageClick, onCopyCode, onMessageAction, isSelectionMode, onToggleSelection } = data;
  const message = messages[index];
  const rowRef = useRef<HTMLDivElement>(null);

  // 测量实际高度并更新缓存
  useEffect(() => {
    if (rowRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        const height = entries[0]?.contentRect.height;
        if (height && height > 0) {
          data.setMeasuredHeight?.(index, height);
        }
      });
      resizeObserver.observe(rowRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [index, data]);

  return (
    <div style={{ ...style, overflow: 'visible' }} ref={rowRef}>
      <MessageItem
        message={message}
        onImageClick={onImageClick}
        onCopyCode={onCopyCode}
        onAction={onMessageAction}
        isGrouped={message.isGrouped ?? undefined}
        showHeader={message.showHeader ?? undefined}
        isSelectionMode={isSelectionMode}
        onToggleSelection={onToggleSelection}
        isLastMessage={index === messages.length - 1}
      />
    </div>
  );
});

/**
 * 虚拟滚动消息列表
 */
function VirtualizedMessageList({
  messages,
  onImageClick,
  onCopyCode,
  onMessageAction,
  isSelectionMode,
  onToggleSelection,
  containerHeight,
  containerWidth,
}: {
  messages: MessageWithGrouping[];
  onImageClick?: (imageUrl: string) => void;
  onCopyCode?: (code: string) => void;
  onMessageAction?: (messageId: string, action: string) => void;
  isSelectionMode?: boolean;
  onToggleSelection?: (messageId: string) => void;
  containerHeight: number;
  containerWidth: number;
}) {
  const listRef = useRef<List>(null);
  const itemSizesRef = useRef<Map<number, number>>(new Map());
  const [, forceUpdate] = useState({});

  // 测量完成后更新高度并通知列表重排
  const setMeasuredHeight = useCallback((index: number, height: number) => {
    const currentHeight = itemSizesRef.current.get(index);
    // 只有高度变化超过 5px 才更新，避免频繁重排
    if (!currentHeight || Math.abs(currentHeight - height) > 5) {
      itemSizesRef.current.set(index, height);
      // 通知列表该项高度已变化
      listRef.current?.resetAfterIndex(index);
    }
  }, []);

  const getItemSize = useCallback(
    (index: number) => itemSizesRef.current.get(index) ?? estimateMessageHeight(messages[index]),
    [messages]
  );

  const listData: ListItemData = useMemo(
    () => ({
      messages,
      onImageClick,
      onCopyCode,
      onMessageAction,
      isSelectionMode,
      onToggleSelection,
      setMeasuredHeight,
    }),
    [messages, onImageClick, onCopyCode, onMessageAction, isSelectionMode, onToggleSelection, setMeasuredHeight]
  );

  // 消息变化时清除高度缓存
  useEffect(() => {
    itemSizesRef.current.clear();
    forceUpdate({});
  }, [messages.length]);

  // 自动滚动到最新消息
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToItem(messages.length - 1, 'end');
      });
    }
  }, [messages.length]);

  return (
    <List
      ref={listRef}
      height={containerHeight}
      width={containerWidth}
      itemCount={messages.length}
      itemSize={getItemSize}
      itemData={listData}
      overscanCount={5}
    >
      {MessageRow}
    </List>
  );
}

/**
 * 消息列表组件
 */
export function MessageList({
  messages,
  loading = false,
  emptyMessage = '暂无消息，开始对话吧',
  onImageClick,
  onCopyCode,
  onMessageAction,
  className = '',
  isSelectionMode = false,
  onToggleSelection,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // 使用 useMemo 缓存分组计算结果
  const messagesWithGrouping = useMemo<MessageWithGrouping[]>(() => {
    return messages.map((message, index) => {
      const getTimestamp = (msg: typeof message) => {
        const timestamp = parseInt(msg.id);
        return isNaN(timestamp) ? Date.now() : timestamp;
      };

      const prevMessage = index > 0 ? messages[index - 1] : null;

      const isGrouped = prevMessage && shouldGroupMessages(
        { role: prevMessage.role, timestamp: getTimestamp(prevMessage) },
        { role: message.role, timestamp: getTimestamp(message) }
      );

      return {
        ...message,
        isGrouped: isGrouped || false,
        showHeader: index === 0 || !prevMessage || !isGrouped,
      };
    });
  }, [messages]);

  // 监听容器大小变化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const { height, width } = container.getBoundingClientRect();
      setContainerHeight(Math.max(height, 100));
      setContainerWidth(Math.max(width, 100));
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 决定是否使用虚拟滚动
  const useVirtualScroll = messages.length >= VIRTUAL_SCROLL_THRESHOLD;

  // 渲染空状态
  if (messages.length === 0 && !loading) {
    return (
      <div
        className={`flex items-center justify-center h-full text-[var(--text-muted)] ${className}`}
      >
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 min-h-0 overflow-y-auto ${className}`}
      style={{ minHeight: '100px' }}
    >
      {useVirtualScroll && containerHeight > 0 && containerWidth > 0 ? (
        <VirtualizedMessageList
          messages={messagesWithGrouping}
          onImageClick={onImageClick}
          onCopyCode={onCopyCode}
          onMessageAction={onMessageAction}
          isSelectionMode={isSelectionMode}
          onToggleSelection={onToggleSelection}
          containerHeight={containerHeight}
          containerWidth={containerWidth}
        />
      ) : (
        <RegularMessageList
          messages={messagesWithGrouping}
          onImageClick={onImageClick}
          onCopyCode={onCopyCode}
          onMessageAction={onMessageAction}
          isSelectionMode={isSelectionMode}
          onToggleSelection={onToggleSelection}
        />
      )}

      {loading && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center py-4 pointer-events-none">
          <div className="flex space-x-2 bg-[var(--bg-secondary)]/80 px-4 py-2 rounded-full">
            <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" />
            <div
              className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce"
              style={{ animationDelay: '0.1s' }}
            />
            <div
              className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce"
              style={{ animationDelay: '0.2s' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageList;

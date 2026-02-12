/**
 * 消息列表组件
 */

import { useEffect, useRef, useState, useCallback } from 'react';
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
  const listRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // 自动滚动到最新消息（仅在用户位于底部时）
  useEffect(() => {
    if (isAtBottom && listRef.current) {
      // 使用 requestAnimationFrame 确保在 DOM 更新后滚动
      requestAnimationFrame(() => {
        if (listRef.current) {
          const { scrollHeight, clientHeight } = listRef.current;
          listRef.current.scrollTop = scrollHeight - clientHeight;
        }
      });
    }
  }, [messages, isAtBottom]);

  // 检测滚动位置
  const handleScroll = useCallback(() => {
    if (!listRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
    const atBottom = distanceToBottom < 100;

    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom && messages.length > 0);
  }, [messages.length]);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);

  // 添加滚动监听
  useEffect(() => {
    const listElement = listRef.current;
    if (listElement) {
      listElement.addEventListener('scroll', handleScroll);
      return () => {
        listElement.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // 渲染空状态
  if (messages.length === 0 && !loading) {
    return (
      <div className={`flex items-center justify-center h-full text-[var(--text-muted)] ${className}`}>
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

  // 计算消息分组状态
  const messagesWithGrouping = messages.map((message, index) => {
    // 从 id 中提取时间戳（假设 id 是基于时间戳生成的）
    const getTimestamp = (msg: typeof message) => {
      // 尝试解析 id 作为时间戳
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

  return (
    <div className={`relative flex-1 min-h-0 ${className}`}>
      <div
        ref={listRef}
        className="h-full overflow-y-auto px-4 py-6 space-y-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messagesWithGrouping.map((message, index) => {
          const isLast = index === messages.length - 1;
          return (
            <div
              key={message.id}
              ref={isLast ? lastMessageRef : null}
              id={message.domId}
            >
              <MessageItem
                message={message}
                onImageClick={onImageClick}
                onCopyCode={onCopyCode}
                onAction={onMessageAction}
                isGrouped={message.isGrouped ?? undefined}
                showHeader={message.showHeader ?? undefined}
                isSelectionMode={isSelectionMode}
                onToggleSelection={onToggleSelection}
              />
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-center py-4">
            <div className="flex space-x-2">
              <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        )}
      </div>

      {/* 滚动到底部按钮 */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 w-12 h-12 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
          title="滚动到最新消息"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * 导出一个默认组件
 */
export default MessageList;

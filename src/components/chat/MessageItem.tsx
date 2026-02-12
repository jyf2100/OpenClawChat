/**
 * 消息气泡组件
 */

import React, { useState, useCallback } from 'react';
import type { RenderedMessage } from '../../types';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { ImagePreview } from './ImagePreview';
import { formatRelativeTime } from '../../utils/timeFormat';

export interface MessageItemProps {
  message: RenderedMessage & { isSelected?: boolean };
  onImageClick?: (imageUrl: string) => void;
  onCopyCode?: (code: string) => void;
  onAction?: (messageId: string, action: string) => void;
  isGrouped?: boolean;
  showHeader?: boolean;
  className?: string;
  isSelectionMode?: boolean;
  onToggleSelection?: (messageId: string) => void;
}

/**
 * 代码块组件
 */
function CodeBlock({ code, language = 'text' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 简单的语法高亮（仅用于演示，实际应使用专业库）
  const highlightSyntax = (text: string): string => {
    // 转义 HTML
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 关键字
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await)\b/g, '<span class="syntax-keyword">$1</span>');

    // 字符串
    html = html.replace(/(['"`])(.*?)\1/g, '<span class="syntax-string">$1$2$1</span>');

    // 注释
    html = html.replace(/(\/\/.*$)/gm, '<span class="syntax-comment">$1</span>');
    html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="syntax-comment">$1</span>');

    // 数字
    html = html.replace(/\b(\d+)\b/g, '<span class="syntax-number">$1</span>');

    // 函数
    html = html.replace(/\b([a-zA-Z_]\w*)\s*\(/g, '<span class="syntax-function">$1</span>(');

    return html;
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-language">{language}</span>
        <button
          onClick={handleCopy}
          className="code-block-copy"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="code-block-content">
        <pre>
          <code dangerouslySetInnerHTML={{ __html: highlightSyntax(code) }} />
        </pre>
      </div>
    </div>
  );
}

/**
 * 图片组件
 */
function ImageDisplay({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick?: (url: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className="relative inline-block">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)] rounded-lg animate-pulse">
          <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24">
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
      {error ? (
        <div className="flex items-center justify-center w-48 h-48 bg-[var(--bg-secondary)] rounded-lg text-[var(--text-muted)]">
          <span>加载失败</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          onClick={() => onClick?.(src)}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          className={`max-w-xs max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity ${
            loading ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}
    </div>
  );
}

/**
 * 流式加载动画
 */
function StreamingIndicator() {
  return (
    <div className="flex space-x-1">
      <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
      <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
      <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
    </div>
  );
}

/**
 * 简单的 Markdown 渲染器
 */
function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLanguage = 'text';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检查代码块
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // 结束代码块
        elements.push(
          <CodeBlock key={`code-${i}`} code={codeContent.trim()} language={codeLanguage} />
        );
        inCodeBlock = false;
        codeContent = '';
        codeLanguage = 'text';
      } else {
        // 开始代码块，提取语言标识
        const languageMatch = line.match(/^```(\w+)?/);
        codeLanguage = languageMatch?.[1] || 'text';
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // 检查引用
    if (line.trim().startsWith('>')) {
      const quoteContent = line.trim().substring(1).trim();
      elements.push(
        <div key={`quote-${i}`} className="message-quote">
          <div className="message-quote-content">{quoteContent}</div>
        </div>
      );
      continue;
    }

    // 处理普通文本（简化版，只处理换行）
    if (line.trim()) {
      elements.push(
        <p key={`text-${i}`} className="mb-0 last:mb-0">
          {line}
        </p>
      );
    } else {
      elements.push(<br key={`br-${i}`} />);
    }
  }

  return <>{elements}</>;
}

/**
 * 消息气泡组件
 */
export function MessageItem({
  message,
  onImageClick,
  onAction,
  isGrouped = false,
  showHeader = true,
  className = '',
  isSelectionMode = false,
  onToggleSelection,
}: MessageItemProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
  }>({ show: false, x: 0, y: 0 });

  // 图片预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 处理右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡，防止被全局监听器立即关闭
    
    if (isSelectionMode) {
      // 多选模式下禁用右键，或者仅保留“取消多选”
      return;
    }

    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, [isSelectionMode]);

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, show: false }));
  }, []);

  // 右键菜单项
  const contextMenuItems: ContextMenuItem[] = [
    {
      id: 'copy',
      label: '复制',
      icon: '📋',
      onClick: () => {
        if (message.text) {
          navigator.clipboard.writeText(message.text);
        }
      },
    },
    {
      id: 'quote',
      label: '引用',
      icon: '💬',
      onClick: () => {
        onAction?.(message.id, 'quote');
      },
    },
    {
      id: 'select',
      label: '多选',
      icon: '☑️',
      onClick: () => {
        onAction?.(message.id, 'select');
      },
    },
    {
      id: 'delete',
      label: '删除',
      icon: '🗑️',
      danger: true,
      onClick: () => {
        onAction?.(message.id, 'delete');
      },
    },
  ];

  // 处理图片点击
  const handleImageClick = useCallback((url: string) => {
    if (isSelectionMode) {
      onToggleSelection?.(message.id);
      return;
    }
    setPreviewImage(url);
    onImageClick?.(url);
  }, [onImageClick, isSelectionMode, onToggleSelection, message.id]);

  // 关闭图片预览
  const closeImagePreview = useCallback(() => {
    setPreviewImage(null);
  }, []);

  // 处理消息点击（多选模式）
  const handleMessageClick = useCallback((e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.stopPropagation();
      onToggleSelection?.(message.id);
    }
  }, [isSelectionMode, onToggleSelection, message.id]);

  return (
    <>
      <div
        className={`message-item group ${isUser ? 'justify-end' : 'justify-start'} ${isGrouped ? 'message-item-grouped' : ''} ${className}`}
        onContextMenu={handleContextMenu}
        onClick={handleMessageClick}
        style={{
          display: 'flex',
          marginBottom: isGrouped ? '2px' : '12px',
          padding: isGrouped ? '2px 8px' : '4px 8px',
          borderRadius: 'var(--radius-md)',
          transition: 'background-color 0.1s ease',
          cursor: isSelectionMode ? 'pointer' : 'context-menu',
          position: 'relative',
          backgroundColor: isSelectionMode && message.isSelected ? 'var(--bg-tertiary)' : 'transparent',
        }}
        onMouseEnter={() => {}}
        onMouseLeave={(e) => {
          if (!isSelectionMode || !message.isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {/* 多选 Checkbox */}
        {isSelectionMode && (
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              paddingRight: '12px',
              cursor: 'pointer'
            }}
          >
            <div 
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: message.isSelected ? 'none' : '2px solid var(--text-muted)',
                backgroundColor: message.isSelected ? 'var(--accent)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px'
              }}
            >
              {message.isSelected && '✓'}
            </div>
          </div>
        )}

        <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
          {/* 头像 - 始终显示在底部 */}
          {!isUser && (
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white transition-opacity duration-200 ${
                !showHeader && isGrouped ? 'opacity-0' : 'opacity-100'
              }`}
              style={{ 
                background: 'var(--accent-gradient)',
                boxShadow: 'var(--shadow-sm)',
                visibility: !showHeader && isGrouped ? 'hidden' : 'visible'
              }}
            >
              {message.avatar}
            </div>
          )}
          
          {/* 占位，保持对齐 */}
          {isGrouped && !isUser && !showHeader && (
             <div className="w-0" />
          )}

          {/* 消息内容 */}
          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
            {/* 消息头部（作者和时间） - 仅在非分组的第一条显示 */}
            {showHeader && !isUser && (
              <div className="flex items-baseline gap-2 mb-1 ml-1">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  {message.avatar === 'O' ? 'OpenClaw' : '助手'}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] opacity-60">
                  {formatRelativeTime(message.id ? parseInt(message.id) : Date.now())}
                </span>
              </div>
            )}

            {/* 消息气泡 */}
            <div
              className={`px-4 py-2.5 shadow-sm transition-all duration-200 ${
                isUser
                  ? 'text-white rounded-2xl rounded-br-sm'
                  : isTool
                  ? 'bg-orange-50 text-orange-900 border border-orange-200 rounded-2xl rounded-bl-sm dark:bg-orange-900/20 dark:text-orange-100 dark:border-orange-800'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm'
              }`}
              style={isUser ? { background: 'var(--accent-gradient)' } : {}}
            >
              {/* 文本内容 */}
              {message.text && (
                <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : 'dark:prose-invert'}`}>
                  {message.streaming && message.loading ? (
                    <div className="flex items-center gap-2">
                      <StreamingIndicator />
                    </div>
                  ) : (
                    <SimpleMarkdown content={message.text} />
                  )}
                </div>
              )}

              {/* 图片附件 */}
              {message.images.length > 0 && (
                <div className={`flex flex-wrap gap-2 mt-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {message.images.map((imageUrl, index) => (
                    <ImageDisplay
                      key={index}
                      src={imageUrl}
                      alt={`附件 ${index + 1}`}
                      onClick={handleImageClick}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 时间戳和状态（仅非分组消息显示） */}
            {!isGrouped && (
              <div className={`flex items-center gap-1 mt-1 text-[10px] text-[var(--text-muted)] opacity-60 ${isUser ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
                <span>{message.time}</span>
                {message.streaming && <StreamingIndicator />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu.show && (
        <ContextMenu
          items={contextMenuItems}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
        />
      )}

      {/* 图片预览 */}
      {previewImage && (
        <ImagePreview
          imageUrl={previewImage}
          alt="图片预览"
          onClose={closeImagePreview}
        />
      )}
    </>
  );
}

/**
 * 导出一个默认组件
 */
export default MessageItem;

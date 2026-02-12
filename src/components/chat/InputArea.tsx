/**
 * 输入区域组件
 */

import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import type { Attachment } from '../../types';

export interface InputAreaProps {
  disabled?: boolean;
  isConnected?: boolean;
  isBusy?: boolean;
  isSending?: boolean;
  runId?: string | null;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

/**
 * 输入区域组件
 */
export function InputArea({
  disabled = false,
  isConnected = false,
  isBusy = false,
  isSending = false,
  runId = null,
  onSend,
  onStop,
  onNewChat,
  placeholder = '输入消息... (Enter 发送，Shift+Enter 换行)',
  maxLength = 4000,
  className = '',
}: InputAreaProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 自动调整文本框高度
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // 存储当前的滚动位置，防止跳动
      const scrollPos = window.scrollY;
      
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, 40), 200);
      textarea.style.height = `${newHeight}px`;
      
      // 恢复滚动位置
      window.scrollTo(0, scrollPos);
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [text, adjustTextareaHeight]);

  // 清空输入
  const clearInput = useCallback(() => {
    setText('');
    setAttachments([]);
    // 高度调整会在 useEffect [text] 中自动触发
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // 处理发送
  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    const hasAttachments = attachments.length > 0;

    if (!trimmed && !hasAttachments) return;
    if (!isConnected || isBusy || isSending) return;

    onSend(trimmed, attachments);
    clearInput();
  }, [text, attachments, isConnected, isBusy, isSending, onSend, clearInput]);

  // 处理键盘事件
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter 发送
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (runId) {
        onStop?.();
      } else {
        handleSend();
      }
      return;
    }

    // Enter 发送（Shift+Enter 换行）
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (runId) {
        onStop?.();
      } else {
        handleSend();
      }
    }

    // Escape 清空
    if (e.key === 'Escape' && !runId) {
      e.preventDefault();
      clearInput();
    }
  };

  // 选择图片
  const handleChooseImage = () => {
    fileInputRef.current?.click();
  };

  // 处理文件选择
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length && newAttachments.length < 4; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      try {
        const base64 = await fileToBase64(file);
        newAttachments.push({
          id: `att-${Date.now()}-${i}`,
          type: 'image',
          mimeType: file.type,
          content: base64,
          preview: base64,
        });
      } catch (err) {
        console.error('读取图片失败:', err);
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }

    // 清空 input 以允许再次选择相同文件
    e.target.value = '';
  };

  // 删除附件
  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  // 是否可以发送
  const canSend = isConnected && !isBusy && !isSending && (text.trim() || attachments.length > 0);
  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <div className={`border-t border-[var(--border)] bg-[var(--bg-primary)] relative z-10 ${className}`}>
      {/* 附件预览 */}
      {attachments.length > 0 && (
        <div className="flex gap-2 p-2 overflow-x-auto">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="relative group">
              <img
                src={attachment.preview || attachment.content}
                alt="附件"
                className="w-16 h-16 object-cover rounded-xl"
              />
              <button
                onClick={() => handleRemoveAttachment(attachment.id)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:bg-red-600 shadow-md"
                title="移除附件"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区域 - 胶囊风格 */}
      <div className="flex items-end gap-3 p-4 pt-2">
        {/* 附件按钮 */}
        <button
          onClick={handleChooseImage}
          disabled={disabled || !isConnected || isBusy || isSending}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[var(--text-muted)] hover:text-[var(--text-normal)] active:scale-95"
          style={{ marginBottom: '2px' }}
          title="添加图片 (Ctrl+Shift+I)"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>

        {/* 文本输入容器 - 圆角稍微减小 */}
        <div className="flex-1 relative bg-[var(--bg-input)] rounded-[16px] px-4 transition-shadow focus-within:ring-2 focus-within:ring-[var(--accent)]/50 flex items-center">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || !isConnected}
            placeholder={isConnected ? placeholder : '未连接到网关'}
            maxLength={maxLength}
            rows={1}
            className="w-full bg-transparent text-[var(--text-normal)] resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] max-h-[200px] py-2"
            style={{ height: 'auto', lineHeight: '24px' }}
          />

          {/* 清空按钮 */}
          {hasContent && !runId && (
            <button
              onClick={clearInput}
              disabled={disabled}
              className="absolute right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
              title="清空 (Escape)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* 发送/停止按钮 - 圆形带背景 */}
        <div className="flex-shrink-0 flex gap-2">
            {onNewChat && !runId && (
            <button
                onClick={onNewChat}
                disabled={disabled || !isConnected || isSending}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-normal)] transition-all active:scale-95"
                title="新会话 (Ctrl+Shift+N)"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            </button>
            )}

            {runId ? (
            <button
                onClick={onStop}
                disabled={disabled}
                className="w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-lg active:scale-95"
                title="停止生成 (Ctrl+C)"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
            </button>
            ) : (
            <button
                onClick={handleSend}
                disabled={!canSend}
                className={`w-10 h-10 flex items-center justify-center rounded-full text-white transition-all shadow-md hover:shadow-lg active:scale-95 ${
                    canSend 
                    ? 'bg-gradient-to-r from-[var(--accent)] to-blue-400 hover:brightness-110' 
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                }`}
                style={canSend ? { background: 'var(--accent-gradient)' } : {}}
                title="发送 (Enter)"
            >
                {isSending ? (
                /* 发送中加载动画 */
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    />
                    <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
                ) : (
                <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24">
                    <path
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 12h14M12 5l7 7-7 7"
                    />
                </svg>
                )}
            </button>
            )}
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 字符计数和快捷键提示 */}
      <div className="flex items-center justify-between px-4 pb-2 text-xs">
        {text.length > maxLength * 0.8 ? (
          <span className={text.length >= maxLength ? 'text-red-400' : 'text-yellow-400'}>
            {text.length}/{maxLength}
          </span>
        ) : (
          <span />
        )}
        <span className="text-gray-500">
          Enter 发送 · Shift+Enter 换行 · Escape 清空
        </span>
      </div>
    </div>
  );
}

/**
 * 将文件转换为 Base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除 data:image/xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 导出一个默认组件
 */
export default InputArea;

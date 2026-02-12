/**
 * 消息处理 Hook
 * 参考：/Volumes/work/workspace/clawchat/pages/chat/chat.js:521-549, 370-382, 440-507
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ChatMessage,
  Attachment,
  ChatEventPayload,
  ChatHistoryResponse,
  ChatSendParams,
  ChatAbortParams,
  RenderedMessage,
} from '../types';
import {
  extractText,
  buildRenderedMessages,
  createUserMessage,
  createErrorMessage,
  generateUUID,
} from '../lib/protocol';

export interface UseMessagesOptions {
  sessionKey: string;
  request: <T = any>(method: string, params?: any) => Promise<T>;
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

export interface UseMessagesReturn {
  // 状态
  messages: ChatMessage[];
  renderedMessages: RenderedMessage[];
  streamText: string | null;
  streamStartedAt: number | null;
  runId: string | null;
  sending: boolean;
  isBusy: boolean;

  // 方法
  sendMessage: (text: string, attachments?: Attachment[]) => Promise<boolean>;
  loadHistory: (limit?: number) => Promise<void>;
  abortChat: () => Promise<void>;
  handleChatEvent: (payload: ChatEventPayload) => void;
  clearMessages: () => void;
  newChat: () => void;
}

const DEFAULT_HISTORY_LIMIT = 200;

/**
 * 消息处理 Hook
 */
export function useMessages(options: UseMessagesOptions): UseMessagesReturn {
  const { sessionKey, request, onMessagesChange } = options;

  // 消息状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // 消息队列（用于在忙时排队）
  const queueRef = useRef<Array<{ text: string; attachments: Attachment[] }>>([]);

  // 计算是否忙碌
  const isBusy = sending || runId !== null;

  // 构建渲染消息
  const renderedMessages = buildRenderedMessages(messages, streamText, streamStartedAt);

  // 通知消息变化
  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  // 清空消息
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamText(null);
    setStreamStartedAt(null);
    setRunId(null);
  }, []);

  // 新会话
  const newChat = useCallback(() => {
    clearMessages();
  }, [clearMessages]);

  // 处理 Chat 事件
  const handleChatEvent = useCallback((payload: ChatEventPayload) => {
    if (!payload || payload.sessionKey !== sessionKey) return;

    switch (payload.state) {
      case 'delta': {
        // 更新流式文本
        const next = extractText(payload.message);
        setStreamText((current) => {
          if (next.length >= (current || '').length) {
            return next;
          }
          return current;
        });
        break;
      }

      case 'final': {
        // 保存完整消息，清空流式状态
        setStreamText(null);
        setStreamStartedAt(null);
        setRunId(null);

        // 刷新消息队列
        if (queueRef.current.length > 0) {
          const [next, ...rest] = queueRef.current;
          queueRef.current = rest;
          sendMessage(next.text, next.attachments);
        }
        break;
      }

      case 'aborted':
      case 'error': {
        // 清理流式状态
        setStreamText(null);
        setStreamStartedAt(null);
        setRunId(null);

        // 刷新消息队列
        if (queueRef.current.length > 0) {
          const [next, ...rest] = queueRef.current;
          queueRef.current = rest;
          sendMessage(next.text, next.attachments);
        }
        break;
      }
    }
  }, [sessionKey]);

  // 加载历史消息
  const loadHistory = useCallback(async (limit: number = DEFAULT_HISTORY_LIMIT) => {
    try {
      const response = await request<ChatHistoryResponse>('chat.history', {
        sessionKey,
        limit,
      });
      const historyMessages = Array.isArray(response?.messages) ? response.messages : [];
      setMessages(historyMessages);
    } catch (err) {
      console.error('加载历史消息失败:', err);
      throw err;
    }
  }, [sessionKey, request]);

  // 发送消息
  const sendMessage = useCallback(async (
    text: string,
    attachments: Attachment[] = []
  ): Promise<boolean> => {
    const trimmedText = text.trim();
    const hasAttachments = attachments.length > 0;

    if (!trimmedText && !hasAttachments) {
      return false;
    }

    // 如果忙碌，加入队列
    if (isBusy) {
      queueRef.current.push({ text: trimmedText, attachments });
      return true;
    }

    const now = Date.now();
    const currentRunId = generateUUID();

    // 创建用户消息
    const userMessage = createUserMessage(trimmedText, attachments);
    userMessage.runId = currentRunId;

    // 添加到消息列表
    setMessages((prev) => [...prev, userMessage]);

    // 设置流式状态
    setSending(true);
    setRunId(currentRunId);
    setStreamText('');
    setStreamStartedAt(now);

    // 准备 API 附件
    const apiAttachments = hasAttachments
      ? attachments.map((att) => ({
          type: att.type,
          mimeType: att.mimeType || 'image/png',
          content: att.content || att.url || '',
        }))
      : undefined;

    // 准备发送参数
    const params: ChatSendParams = {
      sessionKey,
      message: trimmedText || undefined,
      deliver: false,
      idempotencyKey: currentRunId,
      attachments: apiAttachments,
    };

    try {
      await request('chat.send', params);
      setSending(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorMsg = createErrorMessage(errorMessage);
      errorMsg.runId = currentRunId;

      setMessages((prev) => [...prev, errorMsg]);
      setSending(false);
      setRunId(null);
      setStreamText(null);
      setStreamStartedAt(null);
      return false;
    }
  }, [isBusy, sessionKey, request]);

  // 中止聊天
  const abortChat = useCallback(async () => {
    const params: ChatAbortParams = {
      sessionKey,
      runId: runId || undefined,
    };

    try {
      await request('chat.abort', params);
    } catch (err) {
      console.error('中止聊天失败:', err);
      throw err;
    }
  }, [sessionKey, runId, request]);

  return {
    messages,
    renderedMessages,
    streamText,
    streamStartedAt,
    runId,
    sending,
    isBusy,
    sendMessage,
    loadHistory,
    abortChat,
    handleChatEvent,
    clearMessages,
    newChat,
  };
}

/**
 * 消息队列 Hook（用于管理等待发送的消息）
 */
export function useMessageQueue() {
  const [queue, setQueue] = useState<Array<{
    id: string;
    text: string;
    attachments: Attachment[];
  }>>([]);

  const enqueueMessage = useCallback((text: string, attachments: Attachment[] = []) => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    const displayText = trimmed || (attachments.length ? `Image (${attachments.length})` : '');
    const item = {
      id: generateUUID(),
      text: displayText,
      attachments,
    };

    setQueue((prev) => [...prev, item]);
  }, []);

  const removeQueued = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const getNext = useCallback(() => {
    return queue[0] || null;
  }, [queue]);

  const removeNext = useCallback(() => {
    if (queue.length === 0) return null;
    const [next, ...rest] = queue;
    setQueue(rest);
    return next;
  }, [queue]);

  return {
    queue,
    enqueueMessage,
    removeQueued,
    clearQueue,
    getNext,
    removeNext,
    isEmpty: queue.length === 0,
    count: queue.length,
  };
}

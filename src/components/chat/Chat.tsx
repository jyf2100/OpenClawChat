/**
 * Chat 组件 - 组合消息列表和输入区域
 */

import { useState, useCallback, useEffect } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useMessages } from '../../hooks/useMessages';
import type { Attachment } from '../../types';

export interface ChatProps {
  gatewayUrl?: string;
  token?: string;
  sessionKey?: string;
  className?: string;
}

/**
 * Chat 组件
 */
export function Chat({
  gatewayUrl = 'ws://127.0.0.1:18789',
  token = '',
  sessionKey = 'agent:main:main',
  className = '',
}: ChatProps) {
  const [settings] = useState({
    gatewayUrl,
    token,
    sessionKey,
  });

  // WebSocket 连接 - 使用多连接版本
  const gatewayId = 'default';
  const { getStatus, getError, connect, disconnect, request, isConnected } = useWebSocket({
    autoReconnect: true,
  });

  const status = getStatus(gatewayId);
  const error = getError(gatewayId);

  // 消息管理
  const {
    renderedMessages,
    runId,
    isBusy,
    sendMessage,
    loadHistory,
    abortChat,
    newChat,
  } = useMessages({
    sessionKey: settings.sessionKey,
    request,
  });

  // 连接成功后加载历史
  const handleConnect = useCallback(async () => {
    try {
      await connect(settings.gatewayUrl, settings.token, gatewayId);
      await loadHistory();
    } catch (err) {
      console.error('连接失败:', err);
    }
  }, [settings, connect, loadHistory]);

  // 断开连接
  const handleDisconnect = useCallback(() => {
    disconnect(gatewayId);
  }, [disconnect]);

  // 发送消息
  const handleSendMessage = useCallback(async (text: string, attachments: Attachment[]) => {
    return sendMessage(text, attachments);
  }, [sendMessage]);

  // 停止生成
  const handleStop = useCallback(async () => {
    try {
      await abortChat();
    } catch (err) {
      console.error('停止失败:', err);
    }
  }, [abortChat]);

  // 新会话
  const handleNewChat = useCallback(() => {
    newChat();
  }, [newChat]);

  // 图片点击处理
  const handleImageClick = useCallback((imageUrl: string) => {
    // 图片预览已在 MessageItem 组件中实现
    console.log('点击图片:', imageUrl);
  }, []);

  // 消息操作处理
  const handleMessageAction = useCallback((messageId: string, action: string) => {
    console.log('消息操作:', messageId, action);
    // TODO: 实现具体的消息操作逻辑
    switch (action) {
      case 'delete':
        // 删除消息逻辑
        break;
      case 'quote':
        // 引用消息逻辑
        break;
      case 'copy':
        // 复制消息逻辑
        break;
      default:
        break;
    }
  }, []);

  // 监听 renderedMessages 变化并自动滚动
  useEffect(() => {
    if (renderedMessages.length > 0) {
      // 可以在这里做一些全局的滚动处理，但 MessageList 内部已经处理了
    }
  }, [renderedMessages]);

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className}`}>
      {/* 状态栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          {/* 连接状态指示器 */}
          <div
            className={`w-2 h-2 rounded-full ${
              status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-300">
            {status === 'connected' ? '已连接' : status === 'connecting' ? '连接中...' : '未连接'}
          </span>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>

        {/* 连接控制按钮 */}
        <div className="flex gap-2">
          {status === 'disconnected' || status === 'error' ? (
            <button
              onClick={handleConnect}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              连接
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
            >
              断开
            </button>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <MessageList
        messages={renderedMessages}
        loading={status === 'connecting'}
        emptyMessage={status === 'disconnected' ? '请先连接到网关' : '暂无消息，开始对话吧'}
        onImageClick={handleImageClick}
        onMessageAction={handleMessageAction}
        className="flex-1"
      />

      {/* 输入区域 */}
      <InputArea
        disabled={status !== 'connected'}
        isConnected={isConnected(gatewayId)}
        isBusy={isBusy}
        runId={runId}
        onSend={handleSendMessage}
        onStop={handleStop}
        onNewChat={handleNewChat}
      />
    </div>
  );
}

/**
 * 导出一个默认组件
 */
export default Chat;

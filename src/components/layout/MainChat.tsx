import React, { useMemo, useCallback } from 'react';
import { ChatMessage, RenderedMessage, ContentBlock, Attachment, Room } from '../../types';
import { MessageList } from '../chat/MessageList';
import { InputArea } from '../chat/InputArea';
import { CollaborationStatusIndicator } from '../room/CollaborationStatusIndicator';
import { HumanJudgePanel } from '../room/HumanJudgePanel';
import { formatRelativeTime } from '../../utils/timeFormat';
import { useCollaborationStore } from '../../stores/collaborationStore';

interface MainChatProps {
  messages: ChatMessage[];
  isConnected: boolean;
  onSendMessage: (content: string, attachments?: Attachment[]) => void;
  onDeleteMessage?: (messageId: string) => void;
  onDeleteMessages?: (messageIds: string[]) => void;
  room?: Room | null;
  // 人工裁判相关
  onHumanJudgeContinue?: (sessionId: string, guidance?: string) => void;
  onHumanJudgeComplete?: (sessionId: string) => void;
}

export const MainChat: React.FC<MainChatProps> = ({
  messages,
  isConnected,
  onSendMessage,
  onDeleteMessage,
  onDeleteMessages,
  room,
  onHumanJudgeContinue,
  onHumanJudgeComplete,
}) => {
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = React.useState<Set<string>>(new Set());

  const { getActiveSessionByRoom, terminateSession } = useCollaborationStore();

  const activeRoomId = room?.id || (messages[0]?.roomId);

  const activeSession = activeRoomId ? getActiveSessionByRoom(activeRoomId) : undefined;

  const participants = room?.collaboration?.participants || [];

  // 判断是否需要显示人工裁判面板
  // 条件：协作进行中，没有配置 AI 裁判，且不是第一轮（第一轮还没开始）
  const showHumanJudgePanel = activeSession
    && !activeSession.judge  // 没有配置 AI 裁判
    && activeSession.status === 'active'
    && activeSession.completedSteps.length >= activeSession.participants.length  // 当前轮次已完成
    && onHumanJudgeContinue
    && onHumanJudgeComplete;

  // 转换 ChatMessage 为 RenderedMessage - 只依赖 messages
  const renderedMessages: RenderedMessage[] = useMemo(() => {
    return messages.map((msg) => {
      // 处理内容转换
      let text = '';
      const images: string[] = [];

      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        msg.content.forEach((block: ContentBlock) => {
          if (block.type === 'text' && block.text) {
            text += block.text;
          } else if (block.type === 'image') {
             if (block.source?.data) {
                 images.push(`data:${block.source.media_type || 'image/png'};base64,${block.source.data}`);
             } else if (block.source?.url) {
                 images.push(block.source.url);
             }
          } else if ((block as any).type === 'tool_use') {
             // 处理工具调用显示
             const toolName = (block as any).toolName || '未知工具';
             text += `\n> 🛠️ 使用工具: ${toolName}\n`;
          }
        });
      }

      // 确定头像字符
      const avatar = msg.role === 'user' ? '用户' : (msg.role === 'assistant' ? 'OpenClaw' : '工具');

      // 调试：检查 collaborationContext
      if (msg.collaborationContext) {
        console.log('[MainChat] 消息 collaborationContext:', msg.id, msg.collaborationContext);
      }

      return {
        id: msg.id,
        domId: `msg-${msg.id}`,
        role: msg.role,
        avatar: avatar.charAt(0),
        text,
        images,
        time: formatRelativeTime(msg.timestamp),
        streaming: msg.isStreaming || false,
        loading: msg.state === 'sending',
        isSelected: false,
        collaborationContext: msg.collaborationContext,
        judgeContext: msg.judgeContext,  // 裁判消息上下文
      };
    });
  }, [messages]);

  // 将选择状态应用到渲染消息 - 单独 memo，避免影响消息转换
  const messagesWithSelection = useMemo(() => {
    if (!isSelectionMode || selectedMessageIds.size === 0) {
      return renderedMessages;
    }
    return renderedMessages.map(msg => ({
      ...msg,
      isSelected: selectedMessageIds.has(msg.id),
    }));
  }, [renderedMessages, isSelectionMode, selectedMessageIds]);

  const handleToggleSelectionMode = useCallback((initialId?: string) => {
    setIsSelectionMode(true);
    if (initialId) {
      setSelectedMessageIds(new Set([initialId]));
    } else {
      setSelectedMessageIds(new Set());
    }
  }, []);

  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const handleToggleSelection = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const handleBatchDelete = useCallback(() => {
    if (selectedMessageIds.size > 0 && onDeleteMessages) {
      onDeleteMessages(Array.from(selectedMessageIds));
    }
    handleExitSelectionMode();
  }, [selectedMessageIds, onDeleteMessages, handleExitSelectionMode]);

  const handleSend = useCallback((text: string, attachments: Attachment[]) => {
      onSendMessage(text, attachments);
  }, [onSendMessage]);

  const handleImageClick = useCallback((url: string) => {
    // MessageItem 内部已处理预览，此处可用于全局日志或其他处理
    console.log('Image clicked:', url);
  }, []);

  const handleMessageAction = useCallback((messageId: string, action: string) => {
    console.log('Message action:', messageId, action);
    if (action === 'delete') {
      onDeleteMessage?.(messageId);
    } else if (action === 'select') {
      handleToggleSelectionMode(messageId);
    }
    // TODO: 实现引用、复制等逻辑的上报
  }, [onDeleteMessage, handleToggleSelectionMode]);

  return (
    <div className="main-chat" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {activeRoomId && (
        <CollaborationStatusIndicator
          roomId={activeRoomId}
          onCancel={activeSession ? (sessionId) => {
            // 用户中断协作
            terminateSession(sessionId, 'user_cancel');
          } : undefined}
        />
      )}
      <MessageList
        messages={messagesWithSelection}
        loading={false}
        emptyMessage={isConnected ? "暂无消息，开始对话吧" : "等待连接..."}
        onImageClick={handleImageClick}
        onMessageAction={handleMessageAction}
        className="flex-1"
        isSelectionMode={isSelectionMode}
        onToggleSelection={handleToggleSelection}
      />
      
      {isSelectionMode ? (
        <div 
          className="selection-bar"
          style={{
            padding: '16px 24px',
            backgroundColor: 'var(--bg-primary)',
            borderTop: '1px solid var(--divider)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
            zIndex: 20
          }}
        >
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            已选择 {selectedMessageIds.size} 条消息
          </span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleExitSelectionMode}
              className="btn"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-normal)',
              }}
            >
              取消
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedMessageIds.size === 0}
              className="btn"
              style={{
                backgroundColor: 'var(--danger)',
                color: 'white',
                opacity: selectedMessageIds.size === 0 ? 0.5 : 1,
                cursor: selectedMessageIds.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              删除
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 人工裁判决策面板 */}
          {showHumanJudgePanel && activeSession && (
            <HumanJudgePanel
              sessionId={activeSession.sessionId}
              onContinue={(guidance) => {
                onHumanJudgeContinue?.(activeSession.sessionId, guidance);
              }}
              onComplete={() => {
                onHumanJudgeComplete?.(activeSession.sessionId);
              }}
            />
          )}
          <InputArea
            isConnected={isConnected}
            onSend={handleSend}
            participants={participants}
            // TODO: 从 App 传递 isBusy, isSending 状态
          />
        </>
      )}
    </div>
  );
};

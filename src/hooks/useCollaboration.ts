import { useCallback, useRef } from 'react';
import { useCollaborationStore } from '../stores/collaborationStore';
import { useCollaborationQueueStore } from '../stores/collaborationQueueStore';
import { useRoomStore } from '../stores/roomStore';
import { useGatewayStore } from '../stores/gatewayStore';
import type { 
  CollaborationParticipant, 
  ChatMessage, 
  CollaborationSession,
} from '../types';

const extractTextFromMessage = (msg: any): string => {
  if (typeof msg.content === 'string') {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    const textBlock = msg.content.find((b: any) => b.type === 'text');
    return textBlock?.text || '';
  }
  return msg.text || '';
};

export const parseMentions = (text: string): string[] => {
  const mentions: string[] = [];
  const regex = /@([^\s@]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
};

export const filterParticipantsByMentions = (
  participants: CollaborationParticipant[],
  mentions: string[]
): CollaborationParticipant[] => {
  if (mentions.length === 0) {
    return participants;
  }
  
  return participants.filter(p => {
    return mentions.some(mention => 
      p.name.toLowerCase() === mention.toLowerCase() ||
      p.name.toLowerCase().includes(mention.toLowerCase())
    );
  });
};

interface UseCollaborationOptions {
  request: (gatewayId: string, method: string, params: any) => Promise<any>;
  getStatus: (gatewayId: string) => string;
  connect: (url: string, token: string, gatewayId: string) => Promise<void>;
  showToast: (message: string, title?: string, duration?: number) => void;
}

export interface UseCollaborationReturn {
  startCollaboration: (
    roomId: string,
    userMessage: string,
    participants: CollaborationParticipant[]
  ) => Promise<string | null>;
  
  processNextStep: (sessionId: string) => Promise<void>;
  cancelCollaboration: (sessionId: string) => void;
  isCollaborationActive: (roomId: string) => boolean;
  getPendingCount: (roomId: string) => number;
  onStepResponse: (sessionId: string, stepIndex: number, messageId: string, text: string) => void;
  onStepComplete: (sessionId: string, stepIndex: number) => void;
}

export function useCollaboration(options: UseCollaborationOptions): UseCollaborationReturn {
  const { request, getStatus, connect, showToast } = options;
  
  const {
    startSession,
    completeStep,
    failStep,
    nextStep: nextStepAction,
    completeSession,
    cancelSession: cancelStoreSession,
    getSession,
    isRoomInCollaboration,
    getCurrentParticipant,
    registerStepKey,
  } = useCollaborationStore();
  
  const { dequeue, hasPending, getQueueLength } = useCollaborationQueueStore();
  const { addMessage, getMessages } = useRoomStore();
  const { gateways } = useGatewayStore();
  
  const streamingMessageRef = useRef<Record<string, ChatMessage>>({});
  
  const startCollaboration = useCallback(async (
    roomId: string,
    userMessage: string,
    participants: CollaborationParticipant[]
  ): Promise<string | null> => {
    if (participants.length === 0) {
      showToast('请先添加协作参与者', '错误', 3000);
      return null;
    }
    
    const userMessageObj: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: [{ type: 'text', text: userMessage }],
      timestamp: Date.now(),
    };
    await addMessage(roomId, userMessageObj as any);
    
    const sessionId = startSession(roomId, participants, userMessageObj.id, userMessage);
    
    console.log('[Collaboration] 会话已启动:', sessionId);
    
    await processNextStep(sessionId);
    
    return sessionId;
  }, [addMessage, startSession, showToast]);
  
  const processNextStep = useCallback(async (sessionId: string) => {
    const session = getSession(sessionId);
    if (!session || session.status !== 'active') {
      console.log('[Collaboration] 会话不存在或非活跃状态');
      return;
    }
    
    const participant = getCurrentParticipant(sessionId);
    if (!participant) {
      console.log('[Collaboration] 没有更多参与者，完成协作');
      completeSession(sessionId);
      await onCollaborationComplete(session.roomId);
      return;
    }
    
    const { gatewayId, agentId, name, color } = participant;
    
    const status = getStatus(gatewayId);
    if (status !== 'connected') {
      const gateway = gateways.find(g => g.id === gatewayId);
      if (!gateway) {
        failStep(sessionId, session.currentStep, `Gateway ${gatewayId} 不存在`);
        await continueToNext(sessionId);
        return;
      }
      
      if (!gateway.token) {
        failStep(sessionId, session.currentStep, `Gateway ${gatewayId} 未设置 token`);
        await continueToNext(sessionId);
        return;
      }
      
      try {
        console.log('[Collaboration] 尝试连接 Gateway:', gatewayId);
        await connect(gateway.url, gateway.token, gatewayId);
        
        await new Promise<void>((resolve, reject) => {
          const maxWait = 5000;
          const startTime = Date.now();
          const check = () => {
            if (getStatus(gatewayId) === 'connected') {
              resolve();
            } else if (Date.now() - startTime > maxWait) {
              reject(new Error('连接超时'));
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
      } catch (err) {
        failStep(sessionId, session.currentStep, `连接 Gateway ${gatewayId} 失败: ${err}`);
        await continueToNext(sessionId);
        return;
      }
    }
    
    const messageWithHistory = buildMessageWithHistory(session);
    
    const assistantMessageId = `${sessionId}-step-${session.currentStep}-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      timestamp: Date.now(),
      isStreaming: true,
      gatewayId,
      collaborationContext: {
        sessionId,
        step: session.currentStep,
        participantName: name,
        participantColor: color,
      },
    };
    
    await addMessage(session.roomId, assistantMessage as any);
    streamingMessageRef.current[assistantMessageId] = assistantMessage;
    
    console.log('[Collaboration] 发送消息到 Gateway:', gatewayId, 'Agent:', agentId);
    
    try {
      const protocolSessionKey = `agent:${agentId}:main`;
      const stepKey = `${gatewayId}:${protocolSessionKey}:${sessionId}:${session.currentStep}`;
      
      registerStepKey(stepKey, {
        roomId: session.roomId,
        sessionId,
        step: session.currentStep,
        participantName: name,
        participantColor: color || 'var(--accent)',
      });
      
      await request(gatewayId, 'chat.send', {
        sessionKey: protocolSessionKey,
        message: messageWithHistory,
        deliver: true,
        idempotencyKey: assistantMessageId,
      });
      
      console.log('[Collaboration] 消息已发送，等待响应, stepKey:', stepKey);
    } catch (err) {
      console.error('[Collaboration] 发送消息失败:', err);
      failStep(sessionId, session.currentStep, err instanceof Error ? err.message : String(err));
      streamingMessageRef.current[assistantMessageId].isStreaming = false;
      streamingMessageRef.current[assistantMessageId].state = 'error';
      await continueToNext(sessionId);
    }
  }, [getSession, getCurrentParticipant, completeSession, failStep, 
      getStatus, gateways, connect, addMessage, request, registerStepKey]);
  
  const continueToNext = useCallback(async (sessionId: string) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const hasNext = nextStepAction(sessionId);
    if (hasNext) {
      await processNextStep(sessionId);
    } else {
      const session = getSession(sessionId);
      if (session) {
        await onCollaborationComplete(session.roomId);
      }
    }
  }, [nextStepAction, processNextStep, getSession]);
  
  const onCollaborationComplete = useCallback(async (roomId: string) => {
    console.log('[Collaboration] 协作完成，检查队列:', roomId);
    
    if (hasPending(roomId)) {
      const nextMessage = dequeue(roomId);
      if (nextMessage) {
        const room = useRoomStore.getState().rooms.find(r => r.id === roomId);
        if (room?.collaboration?.participants) {
          showToast('开始处理队列中的下一条消息...', '协作继续', 3000);
          await startCollaboration(roomId, nextMessage.content, room.collaboration.participants);
        }
      }
    }
  }, [hasPending, dequeue, startCollaboration, showToast]);
  
  const buildMessageWithHistory = useCallback((session: CollaborationSession): string => {
    const allMessages = getMessages(session.roomId);
    
    const historyLines: string[] = [];
    
    for (const msg of allMessages) {
      const text = extractTextFromMessage(msg);
      if (!text) continue;
      
      const collabContext = (msg as any).collaborationContext;
      
      if (msg.role === 'user') {
        historyLines.push(`【用户】${text}`);
      } else if (collabContext) {
        historyLines.push(`【${collabContext.participantName}】${text}`);
      } else {
        historyLines.push(`【助手】${text}`);
      }
    }
    
    if (historyLines.length > 1) {
      const historyText = historyLines.slice(0, -1).join('\n\n');
      return `[协作上下文]
以下是之前的对话历史：

${historyText}

---

[当前任务]
请继续处理：${session.userMessage}`;
    } else {
      return session.userMessage;
    }
  }, [getMessages]);
  
  const cancelCollaboration = useCallback((sessionId: string) => {
    cancelStoreSession(sessionId);
    showToast('协作已取消', '提示', 3000);
    console.log('[Collaboration] 协作已取消:', sessionId);
  }, [cancelStoreSession, showToast]);
  
  const isCollaborationActive = useCallback((roomId: string) => {
    return isRoomInCollaboration(roomId);
  }, [isRoomInCollaboration]);
  
  const getPendingCount = useCallback((roomId: string) => {
    return getQueueLength(roomId);
  }, [getQueueLength]);
  
  const onStepResponse = useCallback((sessionId: string, stepIndex: number, messageId: string, text: string) => {
    const session = getSession(sessionId);
    if (!session || session.currentStep !== stepIndex) return;
    
    const streamingMsg = streamingMessageRef.current[messageId];
    if (streamingMsg) {
      if (Array.isArray(streamingMsg.content)) {
        const block = streamingMsg.content[0];
        if (block && block.type === 'text') {
          block.text = text;
        }
      }
    }
  }, [getSession]);
  
  const onStepComplete = useCallback(async (sessionId: string, stepIndex: number) => {
    const session = getSession(sessionId);
    if (!session || session.currentStep !== stepIndex) return;
    
    completeStep(sessionId, stepIndex);
    console.log('[Collaboration] 步骤完成:', sessionId, stepIndex);
    
    await continueToNext(sessionId);
  }, [getSession, completeStep, continueToNext]);
  
  return {
    startCollaboration,
    processNextStep,
    cancelCollaboration,
    isCollaborationActive,
    getPendingCount,
    onStepResponse,
    onStepComplete,
  };
}

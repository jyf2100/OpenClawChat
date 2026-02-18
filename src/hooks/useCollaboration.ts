import { useCallback, useRef } from 'react';
import { useCollaborationStore } from '../stores/collaborationStore';
import { useCollaborationQueueStore } from '../stores/collaborationQueueStore';
import { useRoomStore } from '../stores/roomStore';
import { useGatewayStore } from '../stores/gatewayStore';
import type {
  CollaborationParticipant,
  ChatMessage,
  CollaborationSession,
  JudgeResponse,
  CollaborationTerminationReason,
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

/**
 * 默认裁判提示词模板
 */
const DEFAULT_JUDGE_PROMPT = `你是一个协作对话的裁判和协调者。你的任务是评估对话进展并指导下一步。

## 用户原始请求
{userMessage}

## 当前轮次
Round {currentRound} / {maxRounds}

## 本轮对话
{currentRoundMessages}

## 你的任务
1. 总结本轮各参与者的贡献
2. 指出遗漏、错误或需要改进的地方
3. 给出下一轮的具体建议（如果需要继续）
4. 判断任务是否已经完成

## 输出格式
请严格使用以下 JSON 格式回复，不要包含其他内容：
{
  "summary": "本轮总结...",
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"],
  "shouldContinue": true/false,
  "reason": "决定原因..."
}`;

/**
 * 解析裁判响应
 */
export const parseJudgeResponse = (text: string): JudgeResponse | null => {
  try {
    // 尝试直接解析
    return JSON.parse(text);
  } catch {
    // 尝试提取 JSON 块
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        // 验证必要字段
        if (
          typeof parsed.summary === 'string' &&
          typeof parsed.shouldContinue === 'boolean'
        ) {
          return {
            summary: parsed.summary,
            issues: parsed.issues || [],
            suggestions: parsed.suggestions || [],
            shouldContinue: parsed.shouldContinue,
            reason: parsed.reason || '',
            round: 0,  // 由调用方设置
            timestamp: Date.now(),
          };
        }
      } catch {
        return null;
      }
    }
    return null;
  }
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
  interruptCollaboration: (sessionId: string) => void;
  isCollaborationActive: (roomId: string) => boolean;
  getPendingCount: (roomId: string) => number;
  onStepResponse: (sessionId: string, stepIndex: number, messageId: string, text: string) => void;
  onStepComplete: (sessionId: string, stepIndex: number) => void;
  callJudge: (sessionId: string) => Promise<JudgeResponse | null>;
  callAgentAsJudge: (sessionId: string, agentId: string, gatewayId: string) => Promise<JudgeResponse | null>;
  handleRoundComplete: (sessionId: string) => Promise<void>;
  continueToNextRound: (sessionId: string, guidance?: string) => Promise<void>;
  terminateWithReason: (sessionId: string, reason: CollaborationTerminationReason) => void;
}

export function useCollaboration(options: UseCollaborationOptions): UseCollaborationReturn {
  const { request, getStatus, connect, showToast } = options;

  const {
    startSession,
    completeStep,
    failStep,
    nextStep: nextStepAction,
    nextRound,
    completeSession,
    cancelSession: cancelStoreSession,
    terminateSession,
    getSession,
    isRoomInCollaboration,
    getCurrentParticipant,
    registerStepKey,
    addJudgeResponse,
    addHumanJudgeInput,
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
        round: session.currentRound || 1,
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

    // 检查是否是当前轮次的最后一个参与者
    const isLastStep = session.currentStep >= session.participants.length - 1;

    if (isLastStep) {
      // 当前轮次完成，进入裁判/决策阶段
      await handleRoundComplete(sessionId);
    } else {
      // 继续下一个参与者
      await continueToNext(sessionId);
    }
  }, [getSession, completeStep, continueToNext]);

  /**
   * 处理一轮完成后的逻辑
   */
  const handleRoundComplete = useCallback(async (sessionId: string) => {
    const session = getSession(sessionId);
    if (!session || session.status !== 'active') return;

    console.log('[Collaboration] 本轮完成:', sessionId, 'Round', session.currentRound);

    // 检查是否有 AI 裁判
    if (session.judge) {
      // 检查裁判网关是否连接
      const judgeGatewayStatus = getStatus(session.judge.gatewayId);
      if (judgeGatewayStatus !== 'connected') {
        console.warn('[Collaboration] 裁判网关未连接，尝试连接...');
        const gateway = gateways.find(g => g.id === session.judge!.gatewayId);
        if (gateway && gateway.token) {
          try {
            await connect(gateway.url, gateway.token, session.judge!.gatewayId);
          } catch (err) {
            console.warn('[Collaboration] 裁判网关连接失败，降级为人工裁判');
            // 降级为人工裁判模式（由 UI 处理）
            return;
          }
        } else {
          console.warn('[Collaboration] 裁判网关配置不完整，降级为人工裁判');
          return;
        }
      }

      // 调用 AI 裁判
      const judgeResponse = await callJudge(sessionId);
      if (judgeResponse) {
        await handleJudgeResponse(sessionId, judgeResponse);
      } else {
        console.warn('[Collaboration] AI 裁判响应解析失败，降级为人工裁判');
      }
    }
    // 无裁判时，由 UI 显示人工裁判决策面板
  }, [getSession, getStatus, gateways, connect]);

  /**
   * 调用 AI 裁判
   */
  const callJudge = useCallback(async (sessionId: string): Promise<JudgeResponse | null> => {
    const session = getSession(sessionId);
    if (!session || !session.judge) return null;

    const { gatewayId, agentId, prompt } = session.judge;

    try {
      // 构建裁判提示词
      const judgePrompt = buildJudgePrompt(session, prompt);

      // 调用 chat.send API
      const protocolSessionKey = `agent:${agentId}:main`;
      const result = await request(gatewayId, 'chat.send', {
        sessionKey: protocolSessionKey,
        message: judgePrompt,
        deliver: true,
      });

      // 解析响应
      const responseText = result?.message?.content || result?.content || '';
      const judgeResponse = parseJudgeResponse(responseText);

      if (judgeResponse) {
        judgeResponse.round = session.currentRound;
        addJudgeResponse(sessionId, judgeResponse);
        console.log('[Collaboration] AI 裁判响应:', judgeResponse);
        return judgeResponse;
      }

      return null;
    } catch (err) {
      console.error('[Collaboration] AI 裁判调用失败:', err);
      return null;
    }
  }, [getSession, request, addJudgeResponse]);

  /**
   * 让普通 Agent 临时扮演裁判角色
   */
  const callAgentAsJudge = useCallback(async (
    sessionId: string,
    agentId: string,
    gatewayId: string
  ): Promise<JudgeResponse | null> => {
    const session = getSession(sessionId);
    if (!session) return null;

    try {
      // 构建裁判提示词
      const judgePrompt = buildJudgePrompt(session);

      // 调用 chat.send API
      const protocolSessionKey = `agent:${agentId}:main`;
      const result = await request(gatewayId, 'chat.send', {
        sessionKey: protocolSessionKey,
        message: judgePrompt,
        deliver: true,
      });

      // 解析响应
      const responseText = result?.message?.content || result?.content || '';
      const judgeResponse = parseJudgeResponse(responseText);

      if (judgeResponse) {
        judgeResponse.round = session.currentRound;
        addJudgeResponse(sessionId, judgeResponse);
        console.log('[Collaboration] @Agent 裁判响应:', judgeResponse);
        return judgeResponse;
      }

      return null;
    } catch (err) {
      console.error('[Collaboration] @Agent 裁判调用失败:', err);
      return null;
    }
  }, [getSession, request, addJudgeResponse]);

  /**
   * 处理裁判响应
   */
  const handleJudgeResponse = useCallback(async (
    sessionId: string,
    response: JudgeResponse
  ) => {
    const session = getSession(sessionId);
    if (!session || session.status !== 'active') return;

    // 添加裁判消息到聊天
    const judgeMessage: ChatMessage = {
      id: `judge-${sessionId}-${session.currentRound}-${Date.now()}`,
      role: 'assistant',
      content: [{ type: 'text', text: formatJudgeResponseText(response) }],
      timestamp: Date.now(),
      judgeContext: {
        round: session.currentRound,
        response,
      },
    };
    await addMessage(session.roomId, judgeMessage as any);

    // 根据裁判决定处理下一步
    if (response.shouldContinue) {
      if (session.currentRound < session.maxRounds) {
        // 继续下一轮
        await continueToNextRound(sessionId);
      } else {
        // 达到最大轮次
        terminateWithReason(sessionId, 'max_rounds');
        showToast('已达到最大轮次，协作结束', '提示', 3000);
      }
    } else {
      // 裁判决定完成
      const reason: CollaborationTerminationReason = session.judge
        ? 'ai_judge_decided'
        : 'agent_judge_decided';
      terminateWithReason(sessionId, reason);
      showToast('裁判判定任务已完成', '协作结束', 3000);
    }
  }, [getSession, addMessage, showToast]);

  /**
   * 继续下一轮
   */
  const continueToNextRound = useCallback(async (sessionId: string, guidance?: string) => {
    const session = getSession(sessionId);
    if (!session || session.status !== 'active') return;

    // 记录人工裁判输入（如果有）
    if (guidance) {
      addHumanJudgeInput(sessionId, {
        round: session.currentRound,
        guidance,
        timestamp: Date.now(),
      });
    }

    // 进入下一轮
    const success = nextRound(sessionId);
    if (success) {
      showToast(`开始第 ${session.currentRound + 1} 轮`, '协作继续', 2000);
      await processNextStep(sessionId);
    }
  }, [getSession, addHumanJudgeInput, nextRound, showToast, processNextStep]);

  /**
   * 终止协作并记录原因
   */
  const terminateWithReason = useCallback((
    sessionId: string,
    reason: CollaborationTerminationReason
  ) => {
    terminateSession(sessionId, reason);
    console.log('[Collaboration] 协作终止:', sessionId, '原因:', reason);
  }, [terminateSession]);

  /**
   * 用户中断协作
   */
  const interruptCollaboration = useCallback((sessionId: string) => {
    terminateWithReason(sessionId, 'user_cancel');
    showToast('协作已中断', '提示', 3000);
  }, [terminateWithReason, showToast]);

  return {
    startCollaboration,
    processNextStep,
    cancelCollaboration,
    interruptCollaboration,
    isCollaborationActive,
    getPendingCount,
    onStepResponse,
    onStepComplete,
    callJudge,
    callAgentAsJudge,
    handleRoundComplete,
    continueToNextRound,
    terminateWithReason,
  };
}

/**
 * 构建裁判提示词
 */
function buildJudgePrompt(session: CollaborationSession, customPrompt?: string): string {
  const promptTemplate = customPrompt || DEFAULT_JUDGE_PROMPT;

  // 获取本轮消息
  const allMessages = session.completedSteps.map(stepIndex => {
    const participant = session.participants[stepIndex];
    return `【${participant.name}】(步骤 ${stepIndex + 1})`;
  }).join('\n');

  return promptTemplate
    .replace('{userMessage}', session.userMessage)
    .replace('{currentRound}', String(session.currentRound))
    .replace('{maxRounds}', String(session.maxRounds))
    .replace('{currentRoundMessages}', allMessages || '无');
}

/**
 * 格式化裁判响应为可读文本
 */
function formatJudgeResponseText(response: JudgeResponse): string {
  const parts: string[] = [];

  parts.push(`**📊 总结**\n${response.summary}`);

  if (response.issues.length > 0) {
    parts.push(`\n**⚠️ 发现的问题**\n${response.issues.map(i => `- ${i}`).join('\n')}`);
  }

  if (response.suggestions.length > 0) {
    parts.push(`\n**💡 建议**\n${response.suggestions.map(s => `- ${s}`).join('\n')}`);
  }

  parts.push(`\n**🎯 决定**: ${response.shouldContinue ? '继续下一轮' : '完成任务'}`);
  parts.push(`**原因**: ${response.reason}`);

  return parts.join('\n');
}

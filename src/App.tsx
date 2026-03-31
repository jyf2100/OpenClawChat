import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sidebar, Header, MainChat } from './components/layout';
import { LocalAuthGate } from './components/auth/LocalAuthGate';
import { ToastComponent, useToast } from './components/ui';
import { DocumentLibraryDrawer } from './components/docs';
import { SettingsPage } from './components/settings/SettingsPage';
import { useGatewayStore } from './stores/gatewayStore';
import { useRoomStore } from './stores/roomStore';
import { useCollaborationQueueStore } from './stores/collaborationQueueStore';
import { useCollaborationStore } from './stores/collaborationStore';
import { useDocumentStore } from './stores/documentStore';
import { useWebSocket } from './hooks/useWebSocket';
import { useGlobalKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useCollaboration, parseMentions, filterParticipantsByMentions } from './hooks/useCollaboration';
import { ChatMessage, GatewayConfig } from './types';
import {
  connectGateway as connectGatewayViaTauri,
  getGatewayStatus as getGatewayStatusViaTauri,
  sendGatewayMessage as sendGatewayMessageViaTauri,
  waitGatewayRun as waitGatewayRunViaTauri,
  getGatewayChatHistory as getGatewayChatHistoryViaTauri,
  type TauriGatewayStatus,
} from './lib/tauriGateway';
import { logger } from './lib/logger';
import { getLocalAuthStatus, loginLocalAccount, logoutLocalAccount, registerLocalAccount, type LocalAuthStatus } from './lib/auth';
import {
  buildCollaborationStepKey,
  buildGatewayMessageIdempotencyKey,
  buildGatewaySessionKey,
  buildRoomId,
  getGatewayIdFromRoomId,
  parseRoomId,
  tryExtractAgentIdFromSessionKey,
} from './lib/protocol';
import { archiveStorage, type ArchivedConversationSnapshot } from './lib/storage';
import './styles/globals.css';

function summarizeRoomMessages(messages: ChatMessage[]): string {
  const textMessages = messages
    .map((message) => {
      if (typeof message.content === 'string') {
        return { role: message.role, text: message.content };
      }
      if (Array.isArray(message.content)) {
        const text = message.content
          .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
          .map((item: any) => item.text)
          .join('\n');
        return { role: message.role, text };
      }
      return { role: message.role, text: '' };
    })
    .filter((item) => item.text.trim())
    .slice(-8);

  if (textMessages.length === 0) {
    return '上一轮会话没有可归档的有效文本内容。';
  }

  return textMessages
    .map((item, index) => `${index + 1}. [${item.role}] ${item.text.trim().replace(/\s+/g, ' ').slice(0, 180)}`)
    .join('\n');
}

async function summarizeRoomMessagesWithModel(params: {
  gatewayId: string;
  sessionKey: string;
  messages: ChatMessage[];
}): Promise<string> {
  const transcript = params.messages
    .map((message, index) => {
      const text = typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
              .map((item: any) => item.text)
              .join('\n')
          : '';
      return text.trim()
        ? `${index + 1}. [${message.role}] ${text.trim().replace(/\s+/g, ' ').slice(0, 500)}`
        : null;
    })
    .filter(Boolean)
    .join('\n');

  const agentId = tryExtractAgentIdFromSessionKey(params.sessionKey) || 'main';
  const summarySessionKey = `agent:${agentId}:summary-${Date.now().toString(36)}`;
  const runId = `summary-${Date.now()}`;
  const prompt = `请把下面这段聊天整理成可继续工作的会话概要。\n\n输出要求：\n1. 当前任务\n2. 已确认事实\n3. 关键约束\n4. 未完成事项\n5. 下一步建议\n\n要求简洁、结构化，不要复述无关内容。\n\n聊天记录：\n${transcript || '无有效文本内容。'}`;

  await sendGatewayMessageViaTauri(params.gatewayId, summarySessionKey, prompt, runId);
  await waitGatewayRunViaTauri(params.gatewayId, runId);
  const history = await getGatewayChatHistoryViaTauri(params.gatewayId, summarySessionKey, 10);
  const messages = Array.isArray(history?.payload?.messages) ? history.payload.messages : [];
  const assistantMessage = [...messages].reverse().find((item: any) => item?.role === 'assistant');

  if (!assistantMessage) {
    throw new Error('模型摘要未返回 assistant 消息');
  }

  if (typeof assistantMessage.content === 'string') {
    return assistantMessage.content;
  }
  if (Array.isArray(assistantMessage.content)) {
    return assistantMessage.content
      .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
      .map((item: any) => item.text)
      .join('\n')
      .trim();
  }
  return assistantMessage.text || '';
}

function buildGatewayConnectAttemptKey(gateway: GatewayConfig): string {
  return [gateway.id, gateway.url, gateway.token || ''].join(':');
}

function buildCollaborationAgentSessionKey(agentId: string, sessionId: string): string {
  return `agent:${agentId}:collab-${sessionId}`;
}

function buildCollaborationJudgeSessionKey(
  agentId: string,
  sessionId: string,
  round: number,
  mode: 'judge' | 'agent-judge' = 'judge',
): string {
  return `agent:${agentId}:${mode}:${sessionId}:${round}`;
}

function buildCollaborationJudgeFollowupSessionKey(agentId: string, roomId: string): string {
  const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `agent:${agentId}:judge-followup-${safeRoomId}`;
}

function App() {
  const { gateways, init: initGatewayStore, refreshLocalGatewayDefaults } = useGatewayStore();
  const { clearAllActiveSessions } = useCollaborationStore();
  const { init: initDocumentStore } = useDocumentStore();

  const { error: showError, success: showSuccess, showToast, updateToast } = useToast();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'home' | 'role-templates' | 'agent-configs' | 'gateway-sync'>('home');
  const [settingsGatewayId, setSettingsGatewayId] = useState<string | undefined>(undefined);
  const [authStatus, setAuthStatus] = useState<LocalAuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useGlobalKeyboardShortcuts();

  useEffect(() => {
    void (async () => {
      try {
        const status = await getLocalAuthStatus();
        setAuthStatus(status);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : String(error));
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const { rooms, activeRoomId, setActiveRoom, addMessage, updateMessage, deleteMessage, deleteMessages, getMessages, clearMessages, initDefaultRoom, init: initRoomStore } = useRoomStore();
  
  const { enqueue, getQueueLength } = useCollaborationQueueStore();

  const streamingMessageRef = useRef<Record<string, ChatMessage>>({});
  const storageInitializedRef = useRef(false);
  const connectedGatewaysRef = useRef<Set<string>>(new Set());
  const notifiedGatewayErrorsRef = useRef<Record<string, string>>({});
  const lastTauriGatewayStatusRef = useRef<Record<string, string>>({});

  const [isDocLibraryOpen, setIsDocLibraryOpen] = useState(false);
  const [isRoomResetting, setIsRoomResetting] = useState(false);
  const [compressContextTargetRoomId, setCompressContextTargetRoomId] = useState<string | null>(null);
  const [isArchiveViewerOpen, setIsArchiveViewerOpen] = useState(false);
  const [archiveViewerItems, setArchiveViewerItems] = useState<ArchivedConversationSnapshot[]>([]);
  const [archiveViewerLoading, setArchiveViewerLoading] = useState(false);
  const [tauriGatewayStatuses, setTauriGatewayStatuses] = useState<Record<string, TauriGatewayStatus>>({});
  const tauriConnectAttemptedRef = useRef<Set<string>>(new Set());
  const finalizedRunIdsRef = useRef<Set<string>>(new Set());
  const ignoredCollaborationSessionIdsRef = useRef<Set<string>>(new Set());

  const handleGatewayChatEvent = useCallback((payload: any, gatewayId: string) => {
    logger.debug('App::chat-event', 'received', {
      gatewayId,
      state: payload?.state,
      sessionKey: payload?.sessionKey,
      runId: payload?.runId,
      hasMessage: payload?.message !== undefined,
      hasError: payload?.error !== undefined,
    });

    const protocolSessionKey = payload.sessionKey || '';
    const runId = payload.runId || '';

    let roomId = '';
    let collabInfo: { roomId: string; sessionId: string; step: number; participantName: string; participantColor: string } | undefined;

    if (protocolSessionKey && gatewayId) {
      const stepKeyMap = useCollaborationStore.getState().stepKeyMap;
      const prefix = `${buildGatewaySessionKey(gatewayId, protocolSessionKey)}:`;

      for (const [key, info] of Object.entries(stepKeyMap)) {
        if (key.startsWith(prefix)) {
          collabInfo = info;
          roomId = info.roomId;
          break;
        }
      }
    }

    if (!roomId && protocolSessionKey && gatewayId) {
      roomId = buildRoomId(gatewayId, protocolSessionKey);
    } else if (!roomId && protocolSessionKey) {
      roomId = protocolSessionKey;
    }

    if (!roomId) {
      logger.error('App', 'cannot resolve room id for incoming gateway message', {
        gatewayId,
        protocolSessionKey,
        runId,
      });
      return;
    }

    if (payload.state === 'delta' && payload.message) {
      if (collabInfo && ignoredCollaborationSessionIdsRef.current.has(collabInfo.sessionId)) {
        return;
      }
      let streamingMsg = streamingMessageRef.current[runId];
      const safeRunId = runId || `temp-run-${Date.now()}`;

      if (!streamingMsg) {
        streamingMsg = {
          id: safeRunId,
          role: 'assistant',
          content: [{ type: 'text', text: '' }],
          timestamp: Date.now(),
          isStreaming: true,
          collaborationContext: collabInfo ? {
            sessionId: collabInfo.sessionId,
            step: collabInfo.step,
            round: 1,
            participantName: collabInfo.participantName,
            participantColor: collabInfo.participantColor,
          } : undefined,
        };
        streamingMessageRef.current[safeRunId] = streamingMsg;
      }

      const msgContent = payload.message as any;
      let deltaText = '';

      if (msgContent && typeof msgContent.content === 'string') {
        deltaText = msgContent.content;
      } else if (msgContent && msgContent.content && Array.isArray(msgContent.content)) {
        const textBlock = msgContent.content.find((b: any) => b.type === 'text');
        if (textBlock && textBlock.text) {
          deltaText = textBlock.text;
        }
      } else if (typeof msgContent === 'string') {
        deltaText = msgContent;
      }

      if (deltaText) {
        const contentArray = streamingMsg.content as any[];
        if (contentArray && contentArray.length > 0) {
          const currentBlock = contentArray[0];
          currentBlock.text = (currentBlock.text || '') + deltaText;
          updateMessage(roomId, safeRunId, { ...streamingMsg } as any);
        }
      }
    } else if (payload.state === 'final') {
      if (collabInfo && ignoredCollaborationSessionIdsRef.current.has(collabInfo.sessionId)) {
        return;
      }
      const msgContent = payload.message as any;
      let text = '';

      if (msgContent) {
        if (typeof msgContent === 'string') {
          text = msgContent;
        } else if (msgContent.content && Array.isArray(msgContent.content)) {
          const textBlock = msgContent.content.find((b: any) => b.type === 'text');
          text = textBlock?.text || JSON.stringify(msgContent);
        } else {
          text = JSON.stringify(msgContent || {});
        }
      }

      let streamingMsg = streamingMessageRef.current[runId];

      if (streamingMsg) {
        streamingMsg.isStreaming = false;
        if (text) {
          streamingMsg.content = [{ type: 'text', text }];
        }
        updateMessage(roomId, streamingMsg.id, { ...streamingMsg } as any);
      } else {
        const assistantMessage: ChatMessage = {
          id: runId || Date.now().toString(),
          role: 'assistant',
          content: [{ type: 'text', text: text || '...' }],
          timestamp: Date.now(),
          isStreaming: false,
          collaborationContext: collabInfo ? {
            sessionId: collabInfo.sessionId,
            step: collabInfo.step,
            round: 1,
            participantName: collabInfo.participantName,
            participantColor: collabInfo.participantColor,
          } : undefined,
        };
        updateMessage(roomId, assistantMessage.id, assistantMessage as any);
      }

      if (runId) {
        finalizedRunIdsRef.current.add(runId);
        delete streamingMessageRef.current[runId];
      }

      if (collabInfo) {
        const stepKey = buildCollaborationStepKey(
          gatewayId,
          protocolSessionKey,
          collabInfo.sessionId,
          collabInfo.step,
        );
        logger.info('App::collaboration-step', 'final received for collaboration step', {
          gatewayId,
          sessionKey: protocolSessionKey,
          roomId,
          runId,
          stepKey,
          sessionId: collabInfo.sessionId,
          step: collabInfo.step,
          participantName: collabInfo.participantName,
        });
        useCollaborationStore.getState().clearStepKey(stepKey);
        setTimeout(() => {
          logger.info('App::collaboration-step', 'invoking onStepComplete', {
            sessionId: collabInfo.sessionId,
            step: collabInfo.step,
          });
          void onStepComplete(collabInfo.sessionId, collabInfo.step);
        }, 150);
      }
    } else if (payload.state === 'aborted' || payload.state === 'error') {
      if (runId) {
        finalizedRunIdsRef.current.add(runId);
      }
      delete streamingMessageRef.current[runId];
    }
  }, [updateMessage]);

  useEffect(() => {
    if (storageInitializedRef.current) return;

    const initStores = async () => {
      try {
        await Promise.all([
          initGatewayStore(),
          initRoomStore(),
          initDocumentStore(),
        ]);
        
        // 清理所有活跃的协作会话（页面刷新后协作进程不会恢复）
        clearAllActiveSessions();
        
        logger.info('App', 'storage initialized');
        storageInitializedRef.current = true;
      } catch (error) {
        logger.error('App', 'storage initialization failed', error);
        storageInitializedRef.current = true;
      }
    };
    initStores();
  }, []);

  const { connectionVersion, getStatus, connect, request, getError } = useWebSocket({
    autoReconnect: false,
    onChatEvent: handleGatewayChatEvent,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).__TAURI__) {
      return;
    }

    let unlistenFns: Array<() => void> = [];
    let cancelled = false;

    const bindGatewayEvents = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const listeners = await Promise.all(
        gateways.map((gateway) =>
          listen(`gateway:${gateway.id}`, (event) => {
            const payload = event.payload as any;
            if (payload?.event === 'chat') {
              const chatPayload = payload.payload as any;
              logger.debug('App::tauri-gateway-event', 'received chat event', {
                gatewayId: gateway.id,
                event: payload.event,
                state: chatPayload?.state,
                sessionKey: chatPayload?.sessionKey,
                runId: chatPayload?.runId,
                hasMessage: chatPayload?.message !== undefined,
              });
            } else if (payload?.event) {
              logger.debug('App::tauri-gateway-event', 'received event', {
                gatewayId: gateway.id,
                event: payload.event,
              });
            }
            if (payload?.event === 'chat') {
              handleGatewayChatEvent(payload.payload, gateway.id);
            }
          }),
        ),
      );

      if (cancelled) {
        listeners.forEach((unlisten) => unlisten());
        return;
      }

      unlistenFns = listeners;
    };

    void bindGatewayEvents();

    return () => {
      cancelled = true;
      unlistenFns.forEach((unlisten) => unlisten());
    };
  }, [gateways, handleGatewayChatEvent]);

  const {
    startCollaboration,
    isCollaborationActive,
    onStepComplete,
    continueToNextRound,
    terminateWithReason,
  } = useCollaboration({
    request,
    getStatus,
    connect,
    showToast: showError,
  });

  // 人工裁判：继续下一轮
  const handleHumanJudgeContinue = useCallback((sessionId: string, guidance?: string) => {
    logger.info('App', 'human judge continue', { sessionId, hasGuidance: Boolean(guidance) });
    continueToNextRound(sessionId, guidance);
  }, [continueToNextRound]);

  // 人工裁判：完成协作
  const handleHumanJudgeComplete = useCallback((sessionId: string) => {
    logger.info('App', 'human judge complete', { sessionId });
    terminateWithReason(sessionId, 'user_decided');
  }, [terminateWithReason]);

  // 为每个网关初始化默认房间
  useEffect(() => {
    gateways.forEach(gateway => {
      initDefaultRoom(gateway.id);
    });
  }, [gateways, initDefaultRoom]);

  useEffect(() => {
    if (!storageInitializedRef.current) return;

    const localGateway = gateways.find((gateway) => gateway.id === 'default');
    if (!localGateway) return;

    if (tauriConnectAttemptedRef.current.has(localGateway.id)) {
      return;
    }

    tauriConnectAttemptedRef.current.add(localGateway.id);
    void connectGatewayViaTauri(localGateway).catch((error) => {
      logger.error('App', 'default local gateway tauri connect failed', error);
    });
  }, [gateways]);

  useEffect(() => {
    let cancelled = false;

    const pollStatuses = async () => {
      const nextEntries = await Promise.all(
        gateways.map(async (gateway) => {
          const status = await getGatewayStatusViaTauri(gateway.id);
          return [gateway.id, status] as const;
        })
      );

      if (cancelled) return;

      const nextMap = Object.fromEntries(nextEntries);
      setTauriGatewayStatuses(nextMap);

      nextEntries.forEach(([gatewayId, status]) => {
        const previousStatus = lastTauriGatewayStatusRef.current[gatewayId];
        if (previousStatus !== status.status) {
          logger.info('App::gateway-status', 'status changed', {
            gatewayId,
            previousStatus: previousStatus || 'unknown',
            nextStatus: status.status,
            authenticated: status.authenticated,
            error: status.error,
            source: 'tauri',
          });
          lastTauriGatewayStatusRef.current[gatewayId] = status.status;
        }

        const nextStatus = status.status === 'error'
          ? 'error'
          : status.status === 'connected'
            ? 'connected'
            : status.status === 'connecting'
              ? 'connecting'
              : 'disconnected';

        void useGatewayStore.getState().setGatewayRuntimeStatus(
          gatewayId,
          nextStatus as any,
          status.error,
          'tauri-status-poll',
        );
      });
    };

    const timer = setInterval(pollStatuses, 5000);
    pollStatuses();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gateways]);

  // 自动连接所有网关
  useEffect(() => {
    return;
    gateways.forEach(async (gateway) => {
      if (gateway.autoConnect === false) return;

      if (gateway.accessMode === 'local_auto' && !gateway.token) {
        await refreshLocalGatewayDefaults();
        gateway = useGatewayStore.getState().gateways.find((item) => item.id === gateway.id) || gateway;
      }
      
      const currentStatus = getStatus(gateway.id);
      // 已连接或正在连接，跳过
      if (currentStatus === 'connected' || currentStatus === 'connecting') {
        return;
      }

      if (!gateway.token) {
        return;
      }

      // 检查是否最近尝试过连接（避免重复连接）
      const connectKey = buildGatewayConnectAttemptKey(gateway);
      if (connectedGatewaysRef.current.has(connectKey)) {
        return;
      }
      connectedGatewaysRef.current.add(connectKey);

      logger.debug('App', 'auto connecting gateway', { gatewayId: gateway.id, url: gateway.url });
      connect(gateway.url, gateway.token, gateway.id);
    });
  }, [gateways, getStatus, connect, refreshLocalGatewayDefaults, connectionVersion]);

  // 连接断开后清理自动连接去重键，允许 local_auto 等场景重新拨号
  useEffect(() => {
    gateways.forEach((gateway) => {
      const gatewayStatus = getStatus(gateway.id);
      if (gatewayStatus === 'connected' || gatewayStatus === 'connecting') {
        return;
      }

      const connectKey = buildGatewayConnectAttemptKey(gateway);
      connectedGatewaysRef.current.delete(connectKey);
    });
  }, [gateways, getStatus, connectionVersion]);

  // 同步所有网关的 WebSocket 状态
  useEffect(() => {
    return;
    gateways.forEach(gateway => {
      const gatewayStatus = getStatus(gateway.id);
      const currentStatus = useGatewayStore.getState().gateways.find(g => g.id === gateway.id)?.status;
      if (gatewayStatus !== currentStatus) {
        useGatewayStore.getState().updateGateway(gateway.id, { status: gatewayStatus as any });
      }
    });
  }, [gateways, getStatus]);

  // 显示 WebSocket 连接错误
  useEffect(() => {
    return;
    gateways.forEach(gateway => {
      const wsError = getError(gateway.id);
      const gatewayStatus = getStatus(gateway.id);

      if (!wsError || gatewayStatus === 'connected') {
        delete notifiedGatewayErrorsRef.current[gateway.id];
        return;
      }

      if (notifiedGatewayErrorsRef.current[gateway.id] === wsError) {
        return;
      }

      notifiedGatewayErrorsRef.current[gateway.id] = wsError;

      if (wsError) {
        logger.warn('App', 'websocket gateway error', { gatewayId: gateway.id, wsError });
        const normalizedError = wsError.toLowerCase();
        const isMissingWriteScope = normalizedError.includes('missing scope: operator.write');
        const isMissingReadScope = normalizedError.includes('missing scope: operator.read');
        const isOriginDenied = normalizedError.includes('origin') && (normalizedError.includes('deny') || normalizedError.includes('allowedorigin'));
        const isUntrustedProxy = normalizedError.includes('untrusted proxy') || normalizedError.includes('trustedproxies');
        const isTokenError = normalizedError.includes('unauthorized') || normalizedError.includes('token');

        if (isMissingWriteScope) {
          showError(
            `网关 ${gateway.name} 已连接，但当前令牌缺少 operator.write，无法发送消息。`,
            '权限不足',
            7000
          );
        } else if (isMissingReadScope) {
          showError(
            `网关 ${gateway.name} 缺少 operator.read，当前令牌甚至无法读取基础网关状态。`,
            '权限不足',
            7000
          );
        } else if (isOriginDenied) {
          showError(
            `网关 ${gateway.name} 拒绝了当前来源，请检查 gateway.controlUi.allowedOrigins。`,
            '来源被拒绝',
            7000
          );
        } else if (isUntrustedProxy) {
          showError(
            `网关 ${gateway.name} 位于代理之后，但 OpenClaw 未信任该代理，请检查 gateway.trustedProxies。`,
            '代理未信任',
            7000
          );
        } else if (isTokenError) {
          showError(
            `网关 ${gateway.name} 认证失败：令牌不匹配或无效。`,
            '连接失败',
            6000
          );
        } else if (wsError.includes('timeout') || wsError.includes('超时')) {
          showError(
            `连接网关 ${gateway.name} 超时。`,
            '连接超时',
            5000
          );
        } else {
          showError(
            `网关 ${gateway.name} 连接失败：${wsError}`,
            '连接错误',
            5000
          );
        }
        useGatewayStore.getState().updateGateway(gateway.id, {
          status: 'error' as any,
          lastAuthError: wsError,
        });
      }
    });
  }, [gateways, getError, getStatus, showError, connectionVersion]);

  const handleSendMessage = async (content: string) => {
    logger.debug('App', 'prepare send message', { activeRoomId, messageLength: content.length });

    if (!activeRoomId) {
      logger.debug('App', 'send ignored because no room is selected');
      return;
    }

    const room = rooms.find(r => r.id === activeRoomId);
    
    if (room?.roomType === 'collaboration' && room.collaboration) {
      logger.debug('App', 'sending collaboration room message', { roomId: activeRoomId });
      
      if (isCollaborationActive(activeRoomId)) {
        enqueue(activeRoomId, content);
        const pendingCount = getQueueLength(activeRoomId);
        showError(
          `当前协作进行中，消息已加入队列（还有 ${pendingCount} 条）`,
          '已加入队列',
          3000
        );
        return;
      }

      const latestSession = useCollaborationStore.getState().getLatestSessionByRoom(activeRoomId);
      const canFollowupWithJudge =
        Boolean(latestSession?.judge)
        && latestSession?.status === 'completed';

      if (canFollowupWithJudge && latestSession?.judge) {
        const judgeGatewayId = latestSession.judge.gatewayId;
        const judgeSessionKey = buildCollaborationJudgeFollowupSessionKey(
          latestSession.judge.agentId,
          activeRoomId,
        );
        const judgeGateway = gateways.find((gateway) => gateway.id === judgeGatewayId);

        if (!judgeGateway) {
          showError('找不到 AI 裁判对应的网关配置', '无法继续对话', 4000);
          return;
        }

        await connectGatewayViaTauri(judgeGateway);
        const messageId = Date.now().toString();
        const idempotencyKey = buildGatewayMessageIdempotencyKey(judgeGatewayId, judgeSessionKey, messageId);

        const userMessage: ChatMessage = {
          id: messageId,
          role: 'user',
          content: [{ type: 'text', text: content }],
          timestamp: Date.now(),
          state: 'sending',
        };
        await addMessage(activeRoomId, userMessage as any);

        try {
          const response = await sendGatewayMessageViaTauri(judgeGatewayId, judgeSessionKey, content, idempotencyKey);
          await updateMessage(activeRoomId, messageId, {
            ...userMessage,
            state: 'sent',
          } as any);

          const startedRunId = response?.payload?.runId;
          if (typeof startedRunId === 'string' && startedRunId) {
            void (async () => {
              try {
                await waitGatewayRunViaTauri(judgeGatewayId, startedRunId);
                const historyResult = await getGatewayChatHistoryViaTauri(judgeGatewayId, judgeSessionKey, 20);
                const historyMessages = Array.isArray(historyResult?.payload?.messages)
                  ? historyResult.payload.messages
                  : [];
                const assistantMessage = [...historyMessages].reverse().find((item: any) => item?.role === 'assistant');

                if (!assistantMessage) {
                  return;
                }

                await updateMessage(activeRoomId, startedRunId, {
                  id: startedRunId,
                  role: 'assistant',
                  content: Array.isArray(assistantMessage.content)
                    ? assistantMessage.content
                    : [{ type: 'text', text: assistantMessage.text || '' }],
                  timestamp: Date.now(),
                  isStreaming: false,
                  collaborationContext: {
                    sessionId: latestSession.sessionId,
                    step: -1,
                    round: latestSession.currentRound,
                    participantName: latestSession.judge?.name || 'AI裁判',
                    participantColor: latestSession.judge?.color,
                  },
                } as any);
              } catch (error) {
                logger.error('App', 'judge follow-up failed', {
                  roomId: activeRoomId,
                  judgeGatewayId,
                  judgeSessionKey,
                  error,
                });
              }
            })();
          }
          logger.info('App', 'collaboration room switched to judge follow-up mode', {
            roomId: activeRoomId,
            judgeGatewayId,
            judgeSessionKey,
          });
          return;
        } catch (error) {
          logger.error('App', 'judge follow-up send failed', {
            roomId: activeRoomId,
            judgeGatewayId,
            judgeSessionKey,
            error,
          });
          showError(error instanceof Error ? error.message : '发送给 AI 裁判失败', '发送失败', 4000);
          return;
        }
      }
      
      const mentions = parseMentions(content);
      const targetParticipants = mentions.length > 0
        ? filterParticipantsByMentions(room.collaboration.participants, mentions)
        : room.collaboration.participants;
      
      if (targetParticipants.length === 0) {
        showError('未找到匹配的参与者，请检查@提及名称', '提示', 3000);
        return;
      }
      
      const sessionId = await startCollaboration(
        activeRoomId,
        content,
        targetParticipants,
        {
          maxRounds: room.collaboration.maxRounds,
          judge: room.collaboration.judge,
        }
      );
      logger.info('App', 'collaboration start config', {
        roomId: activeRoomId,
        hasJudge: Boolean(room.collaboration.judge),
        judgeGatewayId: room.collaboration.judge?.gatewayId,
        judgeAgentId: room.collaboration.judge?.agentId,
        participantCount: targetParticipants.length,
      });
      
      if (sessionId) {
        logger.info('App', 'collaboration session started', { sessionId, roomId: activeRoomId });
      }
      return;
    }

    const parsedRoom = parseRoomId(activeRoomId);
    if (!parsedRoom) {
      logger.error('App', 'cannot parse active room id before send', { activeRoomId });
      return;
    }
    const roomGatewayId = parsedRoom.gatewayId;

    const gatewayStatus = getStatus(roomGatewayId);
    const roomGateway = gateways.find(g => g.id === roomGatewayId);
    logger.debug('App', 'single chat send context', {
      roomId: activeRoomId,
      gatewayId: roomGatewayId,
      gatewayStatus,
      hasGatewayConfig: Boolean(roomGateway),
    });

    const targetGateway = roomGateway;
    if (!targetGateway) {
      logger.error('App', 'target gateway config missing', { activeRoomId, roomGatewayId });
      showError('找不到目标网关配置', '无法发送消息', 4000);
      return;
    }

    logger.debug('App', 'ensure gateway connected before send', { gatewayId: roomGatewayId });
    await connectGatewayViaTauri(targetGateway);
    await new Promise<void>((resolve, reject) => {
      const maxWait = 8000;
      const startTime = Date.now();
      const check = async () => {
        const status = await getGatewayStatusViaTauri(roomGatewayId!);
        if (status.status === 'connected') {
          resolve();
        } else if (status.status === 'error') {
          reject(new Error(status.error || `网关 ${roomGatewayId} 连接失败`));
        } else if (Date.now() - startTime > maxWait) {
          reject(new Error(`网关 ${roomGatewayId} 连接超时`));
        } else {
          setTimeout(() => {
            void check();
          }, 100);
        }
      };
      void check();
    });

    const protocolSessionKey = parsedRoom.sessionKey;
    const messageId = Date.now().toString();
    const idempotencyKey = buildGatewayMessageIdempotencyKey(
      roomGatewayId,
      protocolSessionKey,
      messageId,
    );

    const userMessage: ChatMessage = {
      id: messageId,
      role: 'user',
      content: [{ type: 'text', text: content }],
      timestamp: Date.now(),
      state: 'sending',
    };
    await addMessage(activeRoomId, userMessage as any);
    logger.debug('App', 'single chat protocol params', {
      roomId: activeRoomId,
      gatewayId: roomGatewayId,
      sessionKey: protocolSessionKey,
      idempotencyKey,
      messageLength: content.length,
    });

    try {
      const response = await sendGatewayMessageViaTauri(roomGatewayId, protocolSessionKey, content, idempotencyKey);
      logger.info('App', 'single chat send acknowledged', {
        gatewayId: roomGatewayId,
        sessionKey: protocolSessionKey,
        response,
      });
      await updateMessage(activeRoomId, messageId, {
        ...userMessage,
        state: 'sent',
      } as any);

      const startedRunId = response?.payload?.runId;
      if (typeof startedRunId === 'string' && startedRunId) {
        const roomIdSnapshot = activeRoomId;
        void (async () => {
          try {
            const waitResult = await waitGatewayRunViaTauri(roomGatewayId, startedRunId);
            logger.info('App', 'fallback agent.wait completed', {
              gatewayId: roomGatewayId,
              sessionKey: protocolSessionKey,
              runId: startedRunId,
              waitResult,
            });

            if (finalizedRunIdsRef.current.has(startedRunId)) {
              return;
            }

            const historyResult = await getGatewayChatHistoryViaTauri(roomGatewayId, protocolSessionKey, 20);
            const historyMessages = Array.isArray(historyResult?.payload?.messages)
              ? historyResult.payload.messages
              : [];
            const assistantMessage = [...historyMessages].reverse().find((item: any) => item?.role === 'assistant');

            if (!assistantMessage) {
              logger.warn('App', 'fallback assistant history missing', {
                gatewayId: roomGatewayId,
                sessionKey: protocolSessionKey,
                runId: startedRunId,
              });
              return;
            }

            const fallbackMessage: ChatMessage = {
              id: startedRunId,
              role: 'assistant',
              content: Array.isArray(assistantMessage.content)
                ? assistantMessage.content
                : [{ type: 'text', text: assistantMessage.text || '' }],
              timestamp: Date.now(),
              isStreaming: false,
              runId: startedRunId,
            };

            finalizedRunIdsRef.current.add(startedRunId);
            await updateMessage(roomIdSnapshot, startedRunId, fallbackMessage as any);
            logger.info('App', 'fallback history message injected', {
              gatewayId: roomGatewayId,
              sessionKey: protocolSessionKey,
              runId: startedRunId,
            });
          } catch (fallbackError) {
            logger.error('App', 'fallback completion failed', {
              gatewayId: roomGatewayId,
              sessionKey: protocolSessionKey,
              runId: startedRunId,
              fallbackError,
            });
          }
        })();
      }
    } catch (error) {
      logger.error('App', 'single chat send failed', {
        gatewayId: roomGatewayId,
        sessionKey: protocolSessionKey,
        error,
      });
      showError(error instanceof Error ? error.message : '发送消息失败', '发送失败', 4000);
      await addMessage(activeRoomId, {
        ...userMessage,
        id: messageId + '-error',
        state: 'error',
      } as any);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (activeRoomId) {
      logger.debug('App', 'delete single message', { roomId: activeRoomId, messageId });
      await deleteMessage(activeRoomId, messageId);
      const room = rooms.find((item) => item.id === activeRoomId);
      const remainingMessages = getMessages(activeRoomId);
      if (room?.roomType === 'collaboration' && remainingMessages.length === 0) {
        const activeSession = useCollaborationStore.getState().getActiveSessionByRoom(activeRoomId);
        if (activeSession) {
          useCollaborationStore.getState().terminateSession(activeSession.sessionId, 'user_cancel');
        }
        useCollaborationQueueStore.getState().clear(activeRoomId);
      }
    }
  };

  const handleDeleteMessages = async (messageIds: string[]) => {
    if (activeRoomId) {
      logger.debug('App', 'delete messages batch', { roomId: activeRoomId, count: messageIds.length });
      if (confirm(`确定要删除选中的 ${messageIds.length} 条消息吗？`)) {
          await deleteMessages(activeRoomId, messageIds);
          const room = rooms.find((item) => item.id === activeRoomId);
          const remainingMessages = getMessages(activeRoomId);
          if (room?.roomType === 'collaboration' && remainingMessages.length === 0) {
            const activeSession = useCollaborationStore.getState().getActiveSessionByRoom(activeRoomId);
            if (activeSession) {
              useCollaborationStore.getState().terminateSession(activeSession.sessionId, 'user_cancel');
            }
            useCollaborationQueueStore.getState().clear(activeRoomId);
          }
      }
    }
  };

  const handleResetCollaborationRoom = useCallback(async (targetRoomId: string) => {
    const room = rooms.find((item) => item.id === targetRoomId);
    if (!room || room.roomType !== 'collaboration') {
      showError('当前房间不是协作房间', '无法重置', 3000);
      return;
    }

    const activeSession = useCollaborationStore.getState().getActiveSessionByRoom(targetRoomId);
    const resetTargets: Array<{ gatewayId: string; sessionKey: string }> = [];

    if (activeSession) {
      ignoredCollaborationSessionIdsRef.current.add(activeSession.sessionId);
      for (const participant of activeSession.participants) {
        resetTargets.push({
          gatewayId: participant.gatewayId,
          sessionKey: buildCollaborationAgentSessionKey(participant.agentId, activeSession.sessionId),
        });
      }

      if (activeSession.judge) {
        resetTargets.push({
          gatewayId: activeSession.judge.gatewayId,
          sessionKey: buildCollaborationJudgeSessionKey(
            activeSession.judge.agentId,
            activeSession.sessionId,
            activeSession.currentRound,
            'judge',
          ),
        });
      }
    }

    const uniqueResetTargets = resetTargets.filter((target, index, list) =>
      index === list.findIndex((item) => item.gatewayId === target.gatewayId && item.sessionKey === target.sessionKey)
    );

    await Promise.allSettled(
      uniqueResetTargets.map(async (target, index) => {
        await sendGatewayMessageViaTauri(
          target.gatewayId,
          target.sessionKey,
          '/new',
          `collab-reset-${Date.now()}-${index}`,
        );
      })
    );

    if (activeSession) {
      useCollaborationStore.getState().terminateSession(activeSession.sessionId, 'user_cancel');
    }

    useCollaborationStore.getState().clearSessionsByRoom(targetRoomId);

    useCollaborationQueueStore.getState().clear(targetRoomId);
    await clearMessages(targetRoomId);

    logger.info('App', 'collaboration room reset', {
      roomId: targetRoomId,
      roomName: room.name,
      hadActiveSession: Boolean(activeSession),
      resetTargetCount: uniqueResetTargets.length,
    });
    showSuccess(`已重置 ${room.name}，可以开始新的对话`, '协作已重置', 2500);
  }, [rooms, clearMessages, showError, showSuccess]);

  const handleResetRoomContext = useCallback(async (targetRoomId?: string) => {
    const effectiveRoomId = targetRoomId || activeRoomId;
    if (!effectiveRoomId) {
      showError('当前没有选中的房间', '无法压缩上下文', 3000);
      return;
    }

    const room = rooms.find((item) => item.id === effectiveRoomId);
    if (!room) {
      showError('找不到当前房间', '无法压缩上下文', 3000);
      return;
    }
    if (room.roomType === 'collaboration') {
      showError('协作房间暂不支持压缩上下文，请在单聊房间中使用。', '无法压缩上下文', 3500);
      return;
    }

    logger.info('App', 'compress context button clicked', {
      roomId: effectiveRoomId,
      roomName: room.name,
      roomType: room.roomType,
    });

    const parsedRoom = parseRoomId(effectiveRoomId);
    if (!parsedRoom) {
      showError('当前房间缺少有效的 sessionKey 映射', '无法压缩上下文', 3500);
      return;
    }
    const gatewayId = parsedRoom.gatewayId;
    const sessionKey = parsedRoom.sessionKey;
    const roomMessages = getMessages(effectiveRoomId);
    let summary = summarizeRoomMessages(roomMessages as any);

    setIsRoomResetting(true);
    const progressToastId = showToast({
      type: 'info',
      title: '压缩上下文',
      message: `正在归档并清理 ${room.name}...`,
      persistent: true,
    });
    logger.info('App', 'compress context start', {
      roomId: effectiveRoomId,
      gatewayId,
      sessionKey,
      roomName: room.name,
    });

    try {
      try {
        updateToast(progressToastId, { message: '正在生成会话概要...' });
        const modelSummary = await summarizeRoomMessagesWithModel({
          gatewayId,
          sessionKey,
          messages: roomMessages as any,
        });
        if (modelSummary.trim()) {
          summary = modelSummary.trim();
        }
      } catch (error) {
        logger.warn('App', 'model summary fallback to local summary', {
          roomId: effectiveRoomId,
          gatewayId,
          sessionKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      updateToast(progressToastId, { message: '正在写入归档快照...' });
      await archiveStorage.addArchive({
        id: `archive-${Date.now()}`,
        roomId: effectiveRoomId,
        gatewayId,
        sessionKey,
        roomName: room.name,
        archivedAt: Date.now(),
        summary,
        messages: roomMessages as any,
      });

      const resetRunId = `reset-${Date.now()}`;
      updateToast(progressToastId, { message: '正在重置会话上下文...' });
      await sendGatewayMessageViaTauri(gatewayId, sessionKey, '/new', resetRunId);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      logger.info('App', 'session reset via /new sent', {
        roomId: effectiveRoomId,
        gatewayId,
        sessionKey,
        runId: resetRunId,
      });

      updateToast(progressToastId, { message: '正在写回概要并恢复聊天...' });
      await clearMessages(effectiveRoomId);
      await addMessage(effectiveRoomId, {
        id: `summary-${Date.now()}`,
        role: 'assistant',
        content: [{ type: 'text', text: `已归档上一轮聊天记录。\n\n会话概要：\n${summary}\n\n你可以在此基础上继续开始新的对话。` }],
        timestamp: Date.now(),
        state: 'sent',
      } as any);

      logger.info('App', 'current room conversation archived and reset', {
        roomId: effectiveRoomId,
        gatewayId,
        sessionKey,
        archivedMessageCount: roomMessages.length,
      });
      updateToast(progressToastId, {
        type: 'success',
        title: '会话已重置',
        message: `已归档并清理 ${room.name}，可从归档入口查看历史`,
        persistent: false,
        duration: 2600,
      });
      showSuccess(`已归档并清理 ${room.name}`, '会话已重置', 2500);
    } catch (error) {
      logger.error('App', 'current room reset failed', {
        roomId: effectiveRoomId,
        error,
      });
      updateToast(progressToastId, {
        type: 'error',
        title: '压缩上下文失败',
        message: error instanceof Error ? error.message : '归档并清理会话失败',
        persistent: false,
        duration: 4200,
      });
      showError(error instanceof Error ? error.message : '归档并清理会话失败', '重置失败', 4000);
    } finally {
      setIsRoomResetting(false);
    }
  }, [activeRoomId, rooms, getMessages, clearMessages, addMessage, showToast, updateToast, showSuccess, showError]);

  const handleRegister = useCallback(async (email: string, displayName: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await registerLocalAccount(email, displayName, password);
      const status = await getLocalAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleLogin = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await loginLocalAccount(email, password);
      const status = await getLocalAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutLocalAccount();
    const status = await getLocalAuthStatus();
    setAuthStatus(status);
  }, []);

  const openArchiveViewer = useCallback(async () => {
    setIsArchiveViewerOpen(true);
    setArchiveViewerLoading(true);
    try {
      const allArchives = await archiveStorage.loadArchives();
      setArchiveViewerItems(activeRoomId ? allArchives.filter((item) => item.roomId === activeRoomId) : allArchives);
    } catch (error) {
      logger.error('App', 'load archives failed', error);
      setArchiveViewerItems([]);
    } finally {
      setArchiveViewerLoading(false);
    }
  }, [activeRoomId]);

  const requestResetRoomContext = useCallback((targetRoomId?: string) => {
    const effectiveRoomId = targetRoomId || activeRoomId;
    if (!effectiveRoomId) {
      showError('当前没有选中的房间', '无法压缩上下文', 3000);
      return;
    }
    setCompressContextTargetRoomId(effectiveRoomId);
  }, [activeRoomId, showError]);

  const handleRoomSelect = async (roomId: string) => {
    logger.debug('App', 'select room', { roomId });

    const room = rooms.find(r => r.id === roomId);

    if (room?.roomType === 'collaboration') {
      // 协作房间：连接所有参与者的网关
      const participants = room.collaboration?.participants || [];
      for (const participant of participants) {
        const gatewayStatus = tauriGatewayStatuses[participant.gatewayId]?.status || 'disconnected';
        if (gatewayStatus !== 'connected') {
          const gateway = gateways.find(g => g.id === participant.gatewayId);
          if (gateway) {
            logger.debug('App', 'connect collaboration gateway', { gatewayId: gateway.id });
            connectGatewayViaTauri(gateway).catch((error) => {
              logger.error('App', 'collaboration room tauri connect failed', {
                gatewayId: gateway.id,
                error,
              });
            });
          }
        }
      }
    } else {
      // 普通房间：连接单个网关
      const roomGatewayId = getGatewayIdFromRoomId(roomId) || 'default';

      const gatewayStatus = tauriGatewayStatuses[roomGatewayId]?.status || 'disconnected';
      if (gatewayStatus !== 'connected') {
        const gateway = gateways.find(g => g.id === roomGatewayId);
        if (gateway) {
          logger.debug('App', 'connect room gateway', { gatewayId: gateway.id });
          connectGatewayViaTauri(gateway).catch((error) => {
            logger.error('App', 'room tauri connect failed', { gatewayId: gateway.id, error });
          });
        }
      }
    }

    setActiveRoom(roomId);
  };

  const handleAgentConfig = (gateway: GatewayConfig) => {
    setSettingsSection('agent-configs');
    setSettingsGatewayId(gateway.id);
    setSettingsOpen(true);
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId) || null;
  const currentMessages = activeRoomId ? getMessages(activeRoomId) : [];

  if (authLoading || !authStatus || !authStatus.authenticated) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
        <ToastComponent />
        <LocalAuthGate
          needsSetup={Boolean(authStatus?.needs_setup)}
          loading={authLoading}
          error={authError}
          onRegister={handleRegister}
          onLogin={handleLogin}
        />
      </div>
    );
  }

  // 获取当前房间的连接状态
  const getConnectionStatus = () => {
    if (!activeRoomId) return 'disconnected';
    
    const room = rooms.find(r => r.id === activeRoomId);
    if (room?.roomType === 'collaboration') {
      // 协作房间：检查所有参与者的网关状态
      const participantGateways = room.collaboration?.participants || [];
      if (participantGateways.length === 0) return 'disconnected';

      const statuses = participantGateways.map((p) => tauriGatewayStatuses[p.gatewayId]?.status || 'disconnected');
      if (statuses.every((status) => status === 'connected')) {
        return 'connected';
      }
      if (statuses.some((status) => status === 'error')) {
        return 'error';
      }
      if (statuses.some((status) => status === 'connecting' || status === 'connected')) {
        return 'connecting';
      }
      return 'disconnected';
    }
    
    // 普通房间：检查该房间所属网关的状态
    const parsedRoom = parseRoomId(activeRoomId);
    if (parsedRoom) {
      return tauriGatewayStatuses[parsedRoom.gatewayId]?.status || 'disconnected';
    }
    return 'disconnected';
  };

  if (settingsOpen) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
        <ToastComponent />
        <SettingsPage
          initialSection={settingsSection}
          initialGatewayId={settingsGatewayId}
          onBack={() => {
            setSettingsOpen(false);
            setSettingsSection('home');
            setSettingsGatewayId(undefined);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <ToastComponent />

      <Header
        room={activeRoom}
        connectionStatus={getConnectionStatus()}
        gateways={gateways}
        currentUser={{ name: authStatus.display_name || authStatus.email || '用户' }}
        onLogout={() => void handleLogout()}
        onSettingsClick={() => setSettingsOpen(true)}
        onNotificationsClick={() => logger.debug('Header', 'notifications click placeholder')}
        onDocsClick={() => setIsDocLibraryOpen((prev) => !prev)}
        onAddGatewayClick={() => {
          const trigger = document.getElementById('global-add-gateway-hidden-trigger');
          trigger?.click();
        }}
        onAddRoomClick={() => {
          const trigger = document.getElementById('global-add-room-hidden-trigger');
          trigger?.click();
        }}
      />

      <DocumentLibraryDrawer
        open={isDocLibraryOpen}
        onClose={() => setIsDocLibraryOpen(false)}
        room={activeRoom}
        gateways={gateways}
      />

      <div className="flex flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'row' }}>
        <Sidebar
          gateways={gateways}
          rooms={rooms}
          activeRoomId={activeRoomId}
          onRoomSelect={handleRoomSelect}
          onCompressRoomContext={requestResetRoomContext}
          onResetCollaborationRoom={handleResetCollaborationRoom}
          onAgentConfig={handleAgentConfig}
          request={request}
          getStatus={getStatus}
          connect={connect}
        />

        <MainChat
          messages={currentMessages as any}
          isConnected={getConnectionStatus() === 'connected'}
          onSendMessage={handleSendMessage}
          onNewChat={() => requestResetRoomContext()}
          onViewArchives={openArchiveViewer}
          newChatLabel="归档并清理"
          isRoomResetting={isRoomResetting}
          onDeleteMessage={handleDeleteMessage}
          onDeleteMessages={handleDeleteMessages}
          room={activeRoom}
          onHumanJudgeContinue={handleHumanJudgeContinue}
          onHumanJudgeComplete={handleHumanJudgeComplete}
        />
      </div>

      <button
        id="global-add-gateway-hidden-trigger"
        type="button"
        style={{ display: 'none' }}
        onClick={() => {
          const openButton = document.querySelector('[data-add-gateway-button="true"]') as HTMLButtonElement | null;
          openButton?.click();
        }}
      />
      <button
        id="global-add-room-hidden-trigger"
        type="button"
        style={{ display: 'none' }}
        onClick={() => {
          const openButton = document.querySelector('[data-add-room-button="true"]') as HTMLButtonElement | null;
          openButton?.click();
        }}
      />

      {compressContextTargetRoomId && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.56)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setCompressContextTargetRoomId(null)}
        >
          <div
            style={{
              width: 'min(520px, calc(100vw - 32px))',
              background: 'var(--bg-floating)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              boxShadow: 'var(--shadow-lg)',
              padding: '22px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, color: 'var(--text-normal)', fontSize: '18px', fontWeight: 800 }}>
              确认压缩上下文
            </h3>
            <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.7 }}>
              系统会执行以下操作：
              <br />1. 归档现有聊天记录
              <br />2. 生成会话概要
              <br />3. 清理当前会话历史
              <br />4. 把概要写回当前房间继续聊天
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setCompressContextTargetRoomId(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-normal)',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const targetRoomId = compressContextTargetRoomId;
                  setCompressContextTargetRoomId(null);
                  await handleResetRoomContext(targetRoomId);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '12px',
                  border: '1px solid transparent',
                  background: 'var(--accent-gradient)',
                  color: '#071018',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                确认执行
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isArchiveViewerOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.56)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setIsArchiveViewerOpen(false)}
        >
          <div
            style={{
              width: 'min(680px, calc(100vw - 32px))',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: 'linear-gradient(180deg, rgba(14, 20, 29, 0.98) 0%, rgba(10, 16, 24, 0.98) 100%)',
              border: '1px solid color-mix(in srgb, var(--accent) 12%, var(--border))',
              borderRadius: '22px',
              boxShadow: 'var(--shadow-lg)',
              padding: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-normal)', fontSize: '18px', fontWeight: 800 }}>归档历史</h3>
                <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                  查看当前房间压缩上下文前保存的历史快照
                </p>
              </div>
              <button
                onClick={() => setIsArchiveViewerOpen(false)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-normal)',
                  cursor: 'pointer',
                }}
              >
                关闭
              </button>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {archiveViewerLoading ? (
                <div style={{ padding: '18px', color: 'var(--text-muted)' }}>加载归档中...</div>
              ) : archiveViewerItems.length === 0 ? (
                <div style={{ padding: '18px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '14px' }}>
                  当前房间还没有归档记录
                </div>
              ) : archiveViewerItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '14px',
                    borderRadius: '16px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                    <strong style={{ color: 'var(--text-normal)' }}>{item.roomName || item.roomId}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{new Date(item.archivedAt).toLocaleString()}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                    共归档 {item.messages.length} 条消息
                  </div>
                  <pre style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-normal)',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                  }}>
                    {item.summary}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default App;

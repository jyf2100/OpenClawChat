import { useEffect, useRef, useState } from 'react';
import { Sidebar, Header, MainChat } from './components/layout';
import { ToastComponent, useToast } from './components/ui';
import { AgentConfigPage } from './components/gateway';
import { useGatewayStore } from './stores/gatewayStore';
import { useRoomStore } from './stores/roomStore';
import { useCollaborationQueueStore } from './stores/collaborationQueueStore';
import { useCollaborationStore } from './stores/collaborationStore';
import { useWebSocket } from './hooks/useWebSocket';
import { useGlobalKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useCollaboration, parseMentions, filterParticipantsByMentions } from './hooks/useCollaboration';
import { ChatMessage, GatewayConfig } from './types';
import './styles/globals.css';

function App() {
  const { gateways, init: initGatewayStore } = useGatewayStore();
  const { clearAllActiveSessions } = useCollaborationStore();

  const { error: showError } = useToast();

  // Agent 配置页面状态
  const [agentConfigGateway, setAgentConfigGateway] = useState<GatewayConfig | null>(null);

  useGlobalKeyboardShortcuts();

  const { rooms, activeRoomId, setActiveRoom, addMessage, updateMessage, deleteMessage, deleteMessages, getMessages, initDefaultRoom, init: initRoomStore } = useRoomStore();
  
  const { enqueue, getQueueLength } = useCollaborationQueueStore();

  const streamingMessageRef = useRef<Record<string, ChatMessage>>({});
  const storageInitializedRef = useRef(false);
  const connectedGatewaysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (storageInitializedRef.current) return;

    const initStores = async () => {
      try {
        await Promise.all([
          initGatewayStore(),
          initRoomStore(),
        ]);
        
        // 清理所有活跃的协作会话（页面刷新后协作进程不会恢复）
        clearAllActiveSessions();
        
        console.log('[App] 存储初始化完成');
        storageInitializedRef.current = true;
      } catch (error) {
        console.error('[App] 存储初始化失败:', error);
        storageInitializedRef.current = true;
      }
    };
    initStores();
  }, []);

  const { getStatus, connect, request, getError } = useWebSocket({
    onChatEvent: (payload, gatewayId) => {
      console.log('[App] ========== Chat Event Payload ==========');
      console.log('[App] 完整 payload:', JSON.stringify(payload, null, 2));
      console.log('[App] payload 所有键:', Object.keys(payload));
      console.log('[App] payload.message:', payload.message);
      console.log('[App] payload.content:', (payload as any).content);
      console.log('[App] payload.text:', (payload as any).text);
      console.log('[App] payload.data:', (payload as any).data);
      console.log('[App] ========================================');

      console.log('[App] 收到 chat 事件:', payload);
      console.log('[App] 事件状态:', payload.state);

      const protocolSessionKey = payload.sessionKey || '';
      const runId = payload.runId || '';

      let roomId = '';
      let collabInfo: { roomId: string; sessionId: string; step: number; participantName: string; participantColor: string } | undefined;

      // 检查是否是协作步骤的响应
      if (protocolSessionKey && gatewayId) {
        const stepKeyMap = useCollaborationStore.getState().stepKeyMap;
        const prefix = `${gatewayId}:${protocolSessionKey}:`;
        
        console.log('[App] 检查协作步骤');
        console.log('[App]   gatewayId:', gatewayId);
        console.log('[App]   protocolSessionKey:', protocolSessionKey);
        console.log('[App]   prefix:', prefix);
        console.log('[App]   stepKeyMap keys:', Object.keys(stepKeyMap));
        console.log('[App]   stepKeyMap values:', stepKeyMap);
        
        for (const [key, info] of Object.entries(stepKeyMap)) {
          if (key.startsWith(prefix)) {
            collabInfo = info;
            roomId = info.roomId;
            console.log('[App] 协作步骤响应匹配成功');
            console.log('[App]   stepKey:', key);
            console.log('[App]   participantName:', info.participantName);
            break;
          }
        }
        
        if (!collabInfo) {
          console.log('[App] 未找到匹配的协作步骤');
        }
      }

      // 如果不是协作步骤，按普通消息处理
      if (!roomId && protocolSessionKey && gatewayId) {
        roomId = `${gatewayId}:${protocolSessionKey}`;
        console.log('[App] 使用 gatewayId + sessionKey 构造房间 ID:', roomId);
      } else if (!roomId && protocolSessionKey) {
        let currentGatewayId: string | undefined;
        if (runId) {
          const runIdParts = runId.split('-');
          if (runIdParts.length >= 2) {
            const sessionPart = runIdParts[0];
            const sessionParts = sessionPart.split(':');
            if (sessionParts.length >= 1) {
              currentGatewayId = sessionParts[0];
            }
          }
        }

        if (currentGatewayId) {
          roomId = `${currentGatewayId}:${protocolSessionKey}`;
          console.log('[App] 从 runId 构造房间 ID:', roomId);
        } else {
          roomId = protocolSessionKey;
          console.log('[App] 使用 protocolSessionKey 作为房间 ID:', roomId);
        }
      }

      if (!roomId) {
        console.error('[App] ❌ 无法确定房间 ID，跳过此消息');
        return;
      }

      if (payload.state === 'delta' && payload.message) {
        console.log('[App] 流式消息更新:', payload.message);

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
              participantName: collabInfo.participantName,
              participantColor: collabInfo.participantColor,
            } : undefined,
          };
          streamingMessageRef.current[safeRunId] = streamingMsg;
          console.log('[App] 创建新流式消息:', safeRunId, 'collaborationContext:', streamingMsg.collaborationContext);
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
        }
        else if (typeof msgContent === 'string') {
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
        console.log('[App] 最终消息:', payload.message || '(空内容)');

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
            console.log('[App] 结束流式消息:', streamingMsg.id);
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
                participantName: collabInfo.participantName,
                participantColor: collabInfo.participantColor,
              } : undefined,
            };
            updateMessage(roomId, assistantMessage.id, assistantMessage as any);
            console.log('[App] 添加助手消息:', assistantMessage);
        }

        if (streamingMsg?.collaborationContext || collabInfo) {
          const sessionId = streamingMsg?.collaborationContext?.sessionId || collabInfo?.sessionId;
          const step = streamingMsg?.collaborationContext?.step ?? collabInfo?.step;
          
          if (sessionId !== undefined && step !== undefined) {
            console.log('[App] 协作步骤完成:', sessionId, step);
            
            // 清理 stepKeyMap（使用完整格式）
            if (protocolSessionKey && gatewayId && sessionId && step !== undefined) {
              const stepKey = `${gatewayId}:${protocolSessionKey}:${sessionId}:${step}`;
              useCollaborationStore.getState().clearStepKey(stepKey);
              console.log('[App] 已清理 stepKey:', stepKey);
            }
            
            setTimeout(() => {
              onStepComplete(sessionId, step);
            }, 300);
          }
        }

        if (runId) {
            delete streamingMessageRef.current[runId];
        }

      } else if (payload.state === 'aborted') {
        console.warn('[App] Chat 事件被中止:', payload);
        delete streamingMessageRef.current[runId];
      } else if (payload.state === 'error') {
        console.error('[App] Chat 事件错误:', payload);
        delete streamingMessageRef.current[runId];
      }
    },
  });

  const {
    startCollaboration,
    isCollaborationActive,
    onStepComplete,
  } = useCollaboration({
    request,
    getStatus,
    connect,
    showToast: showError,
  });

  // 为每个网关初始化默认房间
  useEffect(() => {
    gateways.forEach(gateway => {
      initDefaultRoom(gateway.id);
    });
  }, [gateways, initDefaultRoom]);

  // 自动连接所有网关
  useEffect(() => {
    gateways.forEach(gateway => {
      if (gateway.autoConnect === false) return;
      
      const currentStatus = getStatus(gateway.id);
      // 已连接或正在连接，跳过
      if (currentStatus === 'connected' || currentStatus === 'connecting') {
        return;
      }

      if (!gateway.token) {
        return;
      }

      // 检查是否最近尝试过连接（避免重复连接）
      const connectKey = `${gateway.id}:${gateway.url}:${gateway.token}`;
      if (connectedGatewaysRef.current.has(connectKey)) {
        return;
      }
      connectedGatewaysRef.current.add(connectKey);

      console.log('[App] 自动连接网关:', gateway.id, gateway.url);
      connect(gateway.url, gateway.token, gateway.id);
    });
  }, [gateways, getStatus, connect]);

  // 同步所有网关的 WebSocket 状态
  useEffect(() => {
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
    gateways.forEach(gateway => {
      const wsError = getError(gateway.id);
      if (wsError) {
        console.error('[App] WebSocket 错误:', gateway.id, wsError);
        if (wsError.includes('unauthorized') || wsError.includes('token')) {
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
        // 清除错误以避免重复提示
        useGatewayStore.getState().updateGateway(gateway.id, { status: 'error' } as any);
      }
    });
  }, [gateways, getError, showError]);

  const handleSendMessage = async (content: string) => {
    console.log('[App] 准备发送消息:', content);
    console.log('[App] 当前房间 ID:', activeRoomId);

    if (!activeRoomId) {
      console.warn('[App] 没有选中的房间');
      return;
    }

    const room = rooms.find(r => r.id === activeRoomId);
    
    if (room?.roomType === 'collaboration' && room.collaboration) {
      console.log('[App] 协作房间消息');
      
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
        targetParticipants
      );
      
      if (sessionId) {
        console.log('[App] 协作会话已启动:', sessionId);
      }
      return;
    }

    const roomParts = activeRoomId.split(':');
    let roomGatewayId: string | undefined;

    if (roomParts.length >= 3) {
      roomGatewayId = roomParts[0];
    } else {
      console.error('[App] 房间 ID 格式错误，无法提取网关 ID:', activeRoomId);
      return;
    }

    const gatewayStatus = getStatus(roomGatewayId);
    console.log('[App] 目标网关:', roomGatewayId, '状态:', gatewayStatus);

    if (gatewayStatus !== 'connected') {
      console.warn('[App] 目标网关未连接，尝试连接:', roomGatewayId);
      const targetGateway = gateways.find(g => g.id === roomGatewayId);
      if (!targetGateway || !targetGateway.token) {
        console.error('[App] 找不到目标网关配置或未设置 token');
        showError('网关未连接或未配置 Token', '无法发送消息', 4000);
        return;
      }
      await connect(targetGateway.url, targetGateway.token, roomGatewayId);
      await new Promise<void>((resolve) => {
        const check = () => {
          if (getStatus(roomGatewayId!) === 'connected') {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    const messageId = Date.now().toString();
    const idempotencyKey = `${activeRoomId}-${messageId}`;

    const userMessage: ChatMessage = {
      id: messageId,
      role: 'user',
      content: [{ type: 'text', text: content }],
      timestamp: Date.now(),
      state: 'sending',
    };
    await addMessage(activeRoomId, userMessage as any);
    console.log('[App] 用户消息已添加到本地状态:', userMessage);

    const protocolSessionKey = roomParts.slice(1).join(':');
    console.log('[App] 协议 Session Key:', protocolSessionKey);

    try {
      const response = await request(roomGatewayId, 'chat.send', {
        sessionKey: protocolSessionKey,
        message: content,
        deliver: true,
        idempotencyKey,
      });
      console.log('[App] WebSocket 响应:', response);
    } catch (error) {
      console.error('[App] 发送消息失败:', error);
      await addMessage(activeRoomId, {
        ...userMessage,
        id: messageId + '-error',
        state: 'error',
      } as any);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (activeRoomId) {
      console.log('[App] 删除消息:', messageId);
      await deleteMessage(activeRoomId, messageId);
    }
  };

  const handleDeleteMessages = async (messageIds: string[]) => {
    if (activeRoomId) {
      console.log('[App] 批量删除消息:', messageIds);
      if (confirm(`确定要删除选中的 ${messageIds.length} 条消息吗？`)) {
          await deleteMessages(activeRoomId, messageIds);
      }
    }
  };

  const handleRoomSelect = async (roomId: string) => {
    console.log('[App] 选择房间:', roomId);

    const room = rooms.find(r => r.id === roomId);

    if (room?.roomType === 'collaboration') {
      // 协作房间：连接所有参与者的网关
      const participants = room.collaboration?.participants || [];
      for (const participant of participants) {
        const gatewayStatus = getStatus(participant.gatewayId);
        if (gatewayStatus !== 'connected') {
          const gateway = gateways.find(g => g.id === participant.gatewayId);
          if (gateway && gateway.token) {
            console.log('[App] 协作房间 - 连接网关:', gateway.id);
            connect(gateway.url, gateway.token, participant.gatewayId);
          }
        }
      }
    } else {
      // 普通房间：连接单个网关
      const roomParts = roomId.split(':');
      let roomGatewayId = 'default';

      if (roomParts.length >= 3) {
        roomGatewayId = roomParts[0];
      }

      const gatewayStatus = getStatus(roomGatewayId);
      if (gatewayStatus !== 'connected') {
        const gateway = gateways.find(g => g.id === roomGatewayId);
        if (gateway && gateway.token) {
          console.log('[App] 连接网关:', gateway.id);
          connect(gateway.url, gateway.token, roomGatewayId);
        }
      }
    }

    setActiveRoom(roomId);
  };

  const handleAgentConfig = (gateway: GatewayConfig) => {
    setAgentConfigGateway(gateway);
  };

  const handleAgentConfigBack = () => {
    setAgentConfigGateway(null);
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId) || null;
  const currentMessages = activeRoomId ? getMessages(activeRoomId) : [];

  // 获取当前房间的连接状态
  const getConnectionStatus = () => {
    if (!activeRoomId) return 'disconnected';
    
    const room = rooms.find(r => r.id === activeRoomId);
    if (room?.roomType === 'collaboration') {
      // 协作房间：检查所有参与者的网关状态
      const participantGateways = room.collaboration?.participants || [];
      const allConnected = participantGateways.every(p => getStatus(p.gatewayId) === 'connected');
      return allConnected ? 'connected' : 'connecting';
    }
    
    // 普通房间：检查该房间所属网关的状态
    const roomParts = activeRoomId.split(':');
    if (roomParts.length >= 3) {
      return getStatus(roomParts[0]);
    }
    return 'disconnected';
  };

  // Agent 配置页面
  if (agentConfigGateway) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
        <ToastComponent />
        <AgentConfigPage
          gateway={agentConfigGateway}
          onBack={handleAgentConfigBack}
          request={request}
          getStatus={getStatus}
          connect={connect}
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
        currentUser={{ name: '用户' }}
        onSettingsClick={() => console.log('打开设置')}
        onNotificationsClick={() => console.log('打开通知中心')}
      />

      <div className="flex flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'row' }}>
        <Sidebar
          gateways={gateways}
          rooms={rooms}
          activeRoomId={activeRoomId}
          onRoomSelect={handleRoomSelect}
          onAgentConfig={handleAgentConfig}
          request={request}
          getStatus={getStatus}
          connect={connect}
        />

        <MainChat
          messages={currentMessages as any}
          isConnected={getConnectionStatus() === 'connected'}
          onSendMessage={handleSendMessage}
          onDeleteMessage={handleDeleteMessage}
          onDeleteMessages={handleDeleteMessages}
          room={activeRoom}
        />
      </div>
    </div>
  );
}

export default App;

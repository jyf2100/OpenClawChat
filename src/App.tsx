import { useEffect, useRef } from 'react';
import { Sidebar, Header, MainChat } from './components/layout';
import { ToastComponent, useToast } from './components/ui';
import { useGatewayStore } from './stores/gatewayStore';
import { useRoomStore } from './stores/roomStore';
import { useWebSocket } from './hooks/useWebSocket';
import { useGlobalKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ChatMessage } from './types';
import './styles/globals.css';

function App() {
  // Gateway Store
  const { gateways, activeGatewayId, setActiveGateway, init: initGatewayStore } = useGatewayStore();

  // Toast 用于显示错误信息
  const { error: showError } = useToast();

  // Initialize global keyboard shortcuts
  useGlobalKeyboardShortcuts();

  // Room Store
  const { rooms, activeRoomId, setActiveRoom, addMessage, updateMessage, deleteMessage, deleteMessages, getMessages, initDefaultRoom, init: initRoomStore } = useRoomStore();

  // 用于存储流式消息的临时状态
  const streamingMessageRef = useRef<Record<string, ChatMessage>>({});
  const storageInitializedRef = useRef(false);
  const lastAutoConnectKeyRef = useRef<string | null>(null);

  // 初始化存储（只运行一次）
  useEffect(() => {
    if (storageInitializedRef.current) return;

    const initStores = async () => {
      try {
        await Promise.all([
          initGatewayStore(),
          initRoomStore(),
        ]);
        console.log('[App] 存储初始化完成');
        storageInitializedRef.current = true;
      } catch (error) {
        console.error('[App] 存储初始化失败:', error);
        storageInitializedRef.current = true; // 即使失败也标记为已尝试
      }
    };
    initStores();
  }, []); // 空依赖数组，确保只运行一次

  // WebSocket Hook - 添加 chat 事件处理（多连接版本）
  const { getStatus, connect, request, getError, isConnected } = useWebSocket({
    onChatEvent: (payload, gatewayId) => {
      // 调试：打印完整的 payload 结构
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

      // 解析 Room ID
      // 根据消息的 sessionKey 和 gatewayId 构造房间 ID，确保消息显示在正确的房间
      const protocolSessionKey = payload.sessionKey || '';
      const runId = payload.runId || '';

      let roomId = '';

      // 从 WebSocket 连接的 gatewayId 和 sessionKey 构造房间 ID
      if (protocolSessionKey && gatewayId) {
        roomId = `${gatewayId}:${protocolSessionKey}`;
        console.log('[App] 使用 gatewayId + sessionKey 构造房间 ID:', roomId);
      } else if (protocolSessionKey) {
        // 回退：尝试从 runId 提取网关 ID
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

      // 处理不同状态的消息
      if (payload.state === 'delta' && payload.message) {
        // 流式更新 - payload.message 是 ChatMessage 对象
        console.log('[App] 流式消息更新:', payload.message);

        // 获取或创建流式消息
        let streamingMsg = streamingMessageRef.current[runId];
        
        // 如果没有 runId，我们尝试使用一个临时的 ID，或者直接追加到最新的一条 assistant 消息
        // 但为了安全起见，如果真的没有 runId，我们最好是忽略或者生成一个临时的
        const safeRunId = runId || `temp-run-${Date.now()}`;

        if (!streamingMsg) {
          streamingMsg = {
            id: safeRunId,
            role: 'assistant',
            content: [{ type: 'text', text: '' }],
            timestamp: Date.now(),
            isStreaming: true,
          };
          streamingMessageRef.current[safeRunId] = streamingMsg;
        }

        // 提取增量内容
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
        // 兼容某些后端可能直接把 content 放在 message 顶层的情况
        else if (typeof msgContent === 'string') {
            deltaText = msgContent;
        }

        if (deltaText) {
            // 获取当前文本块 - 加固空值检查
            const contentArray = streamingMsg.content as any[];
            if (contentArray && contentArray.length > 0) {
              const currentBlock = contentArray[0];
              // 简单追加模式
              currentBlock.text = (currentBlock.text || '') + deltaText;
              
              // 使用 updateMessage 更新 UI
              updateMessage(roomId, safeRunId, { ...streamingMsg } as any);
            }
        }

      } else if (payload.state === 'final') {
        // 最终消息 - payload.message 是 ChatMessage 对象
        console.log('[App] 最终消息:', payload.message || '(空内容)');

        const msgContent = payload.message as any;
        let text = '';

        if (msgContent) {
            // 提取文本内容
            if (typeof msgContent === 'string') {
              text = msgContent;
            } else if (msgContent.content && Array.isArray(msgContent.content)) {
              const textBlock = msgContent.content.find((b: any) => b.type === 'text');
              text = textBlock?.text || JSON.stringify(msgContent);
            } else {
              text = JSON.stringify(msgContent || {});
            }
        }

        // 检查是否存在正在进行的流式消息
        let streamingMsg = streamingMessageRef.current[runId];
        
        if (streamingMsg) {
            // 如果存在流式消息，结束它
            streamingMsg.isStreaming = false;
            
            // 如果 final 包有内容，追加或覆盖（这里选择如果 final 有文本则覆盖，否则保留流式积累的文本）
            if (text) {
                streamingMsg.content = [{ type: 'text', text }];
            }
            
            // 更新状态
            updateMessage(roomId, streamingMsg.id, { ...streamingMsg } as any);
            console.log('[App] 结束流式消息:', streamingMsg.id);
        } else {
            // 如果没有流式消息，创建一个新消息
            const assistantMessage: ChatMessage = {
              id: runId || Date.now().toString(),
              role: 'assistant',
              content: [{ type: 'text', text: text || '...' }], // 如果没内容，显示省略号
              timestamp: Date.now(),
              isStreaming: false,
            };

            // 更新现有消息（如果存在）或添加新消息
            updateMessage(roomId, assistantMessage.id, assistantMessage as any);
            console.log('[App] 添加助手消息:', assistantMessage);
        }

        // 清理流式消息缓存
        if (runId) {
            delete streamingMessageRef.current[runId];
        }

      } else if (payload.state === 'aborted') {
        console.warn('[App] Chat 事件被中止:', payload);
        // 清理流式消息缓存
        delete streamingMessageRef.current[runId];
      } else if (payload.state === 'error') {
        console.error('[App] Chat 事件错误:', payload);
        // 清理流式消息缓存
        delete streamingMessageRef.current[runId];
      }
    },
  });

  // 当网关变化时，初始化默认房间，并切换到该网关的默认房间
  useEffect(() => {
    if (activeGatewayId) {
      console.log('[App] 检查网关默认房间:', activeGatewayId);
      initDefaultRoom(activeGatewayId);

      // 延迟执行房间切换，确保 initDefaultRoom 完成且 rooms 状态已更新
      const timer = setTimeout(() => {
        // 从当前房间 ID 中提取网关 ID
        let currentRoomGatewayId = 'default';
        if (activeRoomId) {
          const roomParts = activeRoomId.split(':');
          if (roomParts.length >= 3) {
            currentRoomGatewayId = roomParts[0];
          }
        }

        console.log('[App] 当前房间 ID:', activeRoomId, '提取的网关 ID:', currentRoomGatewayId, '激活网关 ID:', activeGatewayId);

        // 检查是否需要切换房间
        if (currentRoomGatewayId !== activeGatewayId) {
          // 需要切换房间
          const gatewayRooms = useRoomStore.getState().rooms.filter(r => r.id.startsWith(`${activeGatewayId}:`));
          if (gatewayRooms.length > 0) {
            // 优先选择默认房间
            const defaultRoom = gatewayRooms.find(r => r.id.includes('agent:main:main'));
            const targetRoom = defaultRoom || gatewayRooms[0];
            console.log('[App] 切换网关，自动选择房间:', targetRoom.id, '当前房间:', activeRoomId);
            setActiveRoom(targetRoom.id);
          } else {
            // 如果该网关下没有房间，initDefaultRoom 应该会创建一个
            // 再次检查
            const allRooms = useRoomStore.getState().rooms;
            const newGatewayRooms = allRooms.filter(r => r.id.startsWith(`${activeGatewayId}:`));
            if (newGatewayRooms.length > 0) {
              const targetRoom = newGatewayRooms[0];
              console.log('[App] 切换网关，使用新创建的房间:', targetRoom.id);
              setActiveRoom(targetRoom.id);
            }
          }
        } else {
          console.log('[App] 当前房间已属于当前网关，无需切换:', activeRoomId);
        }
      }, 100); // 给 initDefaultRoom 一点时间完成

      return () => clearTimeout(timer);
    }
  }, [activeGatewayId, initDefaultRoom, activeRoomId, setActiveRoom]);

  // 如果存在网关但未选择当前网关，默认选中第一个网关
  useEffect(() => {
    if (!activeGatewayId && gateways.length > 0) {
      void setActiveGateway(gateways[0].id);
    }
  }, [activeGatewayId, gateways, setActiveGateway]);

  // 当房间更新时，如果没有选中的房间，自动选择当前网关下的第一个
  useEffect(() => {
    if (activeGatewayId && rooms.length > 0 && !activeRoomId) {
      const gatewayRooms = rooms.filter(r => r.gatewayId === activeGatewayId);
      if (gatewayRooms.length > 0) {
        const firstRoom = gatewayRooms[0];
        console.log('[App] 自动选择当前网关下的第一个房间:', firstRoom);
        setActiveRoom(firstRoom.id);
      } else {
        const fallbackRooms = rooms.filter(r => r.gatewayId === 'default');
        const fallbackRoom = fallbackRooms[0] || rooms[0];
        if (fallbackRoom) {
          console.log('[App] 自动选择回退房间:', fallbackRoom);
          setActiveRoom(fallbackRoom.id);
        }
      }
    }
  }, [rooms, activeRoomId, activeGatewayId, setActiveRoom]);

  // 自动连接到当前选中的网关（autoConnect !== false）
  useEffect(() => {
    if (!activeGatewayId) return;

    const gateway = gateways.find(g => g.id === activeGatewayId);
    if (!gateway) return;
    if (gateway.autoConnect === false) return;

    const autoConnectKey = `${gateway.id}:${gateway.url}:${gateway.token || ''}`;
    const gatewayStatus = getStatus(activeGatewayId);
    if (gatewayStatus !== 'disconnected' && gatewayStatus !== 'error') {
      lastAutoConnectKeyRef.current = autoConnectKey;
      return;
    }

    if (lastAutoConnectKeyRef.current === autoConnectKey) return;
    lastAutoConnectKeyRef.current = autoConnectKey;

    if (!gateway.token) {
      showError('未设置网关认证令牌，无法自动连接。请在右上角网关设置中填写令牌。', '无法自动连接', 6000);
      return;
    }

    // 调试日志：查看传递给 connect 的参数
    console.log('[App] ========== 准备连接网关 ==========');
    console.log('[App] gateway.url:', gateway.url);
    console.log('[App] gateway.token:', gateway.token);
    console.log('[App] gateway.token 长度:', gateway.token?.length);
    console.log('[App] gateway.token 前10位:', gateway.token?.substring(0, 10));
    console.log('[App] ======================================');

    connect(gateway.url, gateway.token, activeGatewayId);
  }, [activeGatewayId, gateways, getStatus, connect, showError]);

  // 同步 WebSocket 状态到 Gateway Store
  useEffect(() => {
    if (activeGatewayId) {
      const gatewayStatus = getStatus(activeGatewayId);
      useGatewayStore.getState().updateGateway(activeGatewayId, { status: gatewayStatus as any });
    }
  }, [activeGatewayId, getStatus]);

  // 显示 WebSocket 连接错误
  useEffect(() => {
    if (activeGatewayId) {
      const wsError = getError(activeGatewayId);
      if (wsError) {
        console.error('[App] WebSocket 错误:', wsError);

        // 根据错误类型提供更友好的提示
        if (wsError.includes('unauthorized') || wsError.includes('token')) {
          showError(
            '网关认证失败：令牌不匹配或无效。请检查网关设置中的认证令牌是否正确。',
            '连接失败',
            6000
          );
        } else if (wsError.includes('timeout') || wsError.includes('超时')) {
          showError(
            '连接网关超时。请检查网络连接和网关地址是否正确。',
            '连接超时',
            5000
          );
        } else {
          showError(
            `网关连接失败：${wsError}`,
            '连接错误',
            5000
          );
        }
      }
    }
  }, [activeGatewayId, getError, showError]);

  const handleSendMessage = async (content: string) => {
    console.log('[App] 准备发送消息:', content);
    console.log('[App] 当前房间 ID:', activeRoomId);

    if (!activeRoomId) {
      console.warn('[App] 没有选中的房间');
      return;
    }

    // 从房间 ID 中提取网关 ID
    const roomParts = activeRoomId.split(':');
    let roomGatewayId: string | undefined;

    if (roomParts.length >= 3) {
      roomGatewayId = roomParts[0];
    } else {
      console.error('[App] 房间 ID 格式错误，无法提取网关 ID:', activeRoomId);
      return;
    }

    // 检查目标网关是否已连接
    const gatewayStatus = getStatus(roomGatewayId);
    console.log('[App] 目标网关:', roomGatewayId, '状态:', gatewayStatus);

    if (gatewayStatus !== 'connected') {
      console.warn('[App] 目标网关未连接，尝试连接:', roomGatewayId);
      const targetGateway = gateways.find(g => g.id === roomGatewayId);
      if (!targetGateway || !targetGateway.token) {
        console.error('[App] 找不到目标网关配置或未设置 token');
        return;
      }
      // 尝试连接
      await connect(targetGateway.url, targetGateway.token, roomGatewayId);
      // 等待连接建立
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

    // 生成唯一的消息 ID 和 idempotencyKey
    const messageId = Date.now().toString();
    const idempotencyKey = `${activeRoomId}-${messageId}`;

    console.log('[App] 生成消息 ID:', messageId, 'idempotencyKey:', idempotencyKey);

    // 添加用户消息到本地状态
    const userMessage: ChatMessage = {
      id: messageId,
      role: 'user',
      content: [{ type: 'text', text: content }],
      timestamp: Date.now(),
      state: 'sending',
    };
    await addMessage(activeRoomId, userMessage as any);
    console.log('[App] 用户消息已添加到本地状态:', userMessage);

    // 获取用于通信的 sessionKey (剥离网关前缀)
    console.log('[App] ========== 发送消息开始 ==========');
    console.log('[App] 消息内容:', content);
    console.log('[App] 当前房间 ID:', activeRoomId);
    console.log('[App] 房间所属网关 ID:', roomGatewayId);

    // 构造协议 sessionKey（去掉网关前缀）
    const protocolSessionKey = roomParts.slice(1).join(':');
    console.log('[App] 协议 Session Key:', protocolSessionKey);

    // 通过 WebSocket 发送消息
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
      // 更新消息状态为错误
      await addMessage(activeRoomId, {
        ...userMessage,
        id: messageId + '-error',
        state: 'error',
      } as any);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (activeRoomId) {
      // 临时移除 confirm，因为它在 Tauri 环境中可能不稳定
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

  // 处理房间选择，同时切换到对应的网关
  const handleRoomSelect = async (roomId: string) => {
    console.log('[App] ========== 选择房间 开始 ==========');
    console.log('[App] 房间 ID:', roomId);

    // 从房间 ID 中提取网关 ID
    const roomParts = roomId.split(':');
    let roomGatewayId = 'default';

    if (roomParts.length >= 3) {
      roomGatewayId = roomParts[0];
    }

    console.log('[App] 从房间 ID 提取的网关 ID:', roomGatewayId);

    // 获取当前状态
    const currentActiveGatewayId = useGatewayStore.getState().activeGatewayId;
    const isGatewayConnected = isConnected(roomGatewayId);
    const gatewayStatus = getStatus(roomGatewayId);

    console.log('[App] 当前状态:');
    console.log('[App]  - activeGatewayId (store):', currentActiveGatewayId);
    console.log('[App]  - 房间所属网关连接状态:', gatewayStatus);
    console.log('[App]  - 房间所属网关是否已连接:', isGatewayConnected);

    // 检查是否需要切换激活网关（UI状态）
    if (roomGatewayId !== currentActiveGatewayId) {
      console.log('[App] 房间网关 ≠ 激活网关，需要切换 UI 状态');
      // 切换到房间所属的网关（仅 UI 状态，不影响连接）
      await setActiveGateway(roomGatewayId);
      console.log('[App] 切换后 activeGatewayId:', useGatewayStore.getState().activeGatewayId);
    } else {
      console.log('[App] 房间网关 = 激活网关');
    }

    // 检查是否需要连接 WebSocket（如果还没连接）
    if (!isGatewayConnected) {
      console.log('[App] WebSocket 未连接到目标网关，需要连接:', roomGatewayId);

      // 连接到目标网关
      const gateway = gateways.find(g => g.id === roomGatewayId);
      if (gateway) {
        console.log('[App] 找到网关配置:', { id: gateway.id, url: gateway.url, hasToken: !!gateway.token });
        if (gateway.token) {
          console.log('[App] 调用 connect() 连接到网关:', gateway.id, gateway.url);
          connect(gateway.url, gateway.token, roomGatewayId);
          console.log('[App] connect() 已调用，等待连接建立...');
        } else {
          console.error('[App] 网关没有设置 token!');
        }
      } else {
        console.error('[App] 找不到网关配置:', roomGatewayId);
      }
    } else {
      console.log('[App] WebSocket 已连接到目标网关，无需重新连接');
    }

    // 设置活跃房间
    console.log('[App] 设置活跃房间:', roomId);
    setActiveRoom(roomId);
    console.log('[App] ========== 选择房间完成 ==========');
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId) || null;
  const currentMessages = activeRoomId ? getMessages(activeRoomId) : [];

  // 调试日志 - 必须在变量声明后
  useEffect(() => {
    if (activeGatewayId) {
      const gatewayStatus = getStatus(activeGatewayId);
      const gatewayError = getError(activeGatewayId);
      console.log('[App] 当前激活网关:', activeGatewayId);
      console.log('[App] 网关连接状态:', gatewayStatus);
      if (gatewayError) {
        console.error('[App] WebSocket 错误:', gatewayError);
      }
    }
    console.log('[App] 当前房间 ID:', activeRoomId);
    console.log('[App] 房间列表:', rooms);
    console.log('[App] 当前消息数量:', currentMessages.length);
  }, [activeGatewayId, getStatus, getError, activeRoomId, rooms, currentMessages.length]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Toast 通知 */}
      <ToastComponent />

      {/* 顶部 Header */}
      <Header
        room={activeRoom}
        connectionStatus={activeGatewayId ? getStatus(activeGatewayId) : 'disconnected'}
        gateways={gateways}
        activeGatewayId={activeGatewayId}
        currentUser={{ name: '用户' }}
        onSettingsClick={() => console.log('打开设置')}
        onNotificationsClick={() => console.log('打开通知中心')}
        onGatewaySelect={setActiveGateway}
      />

      {/* 主内容区域 */}
      <div className="flex flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'row' }}>
        {/* 侧边栏 */}
        <Sidebar
          gateways={gateways}
          rooms={rooms}
          activeGatewayId={activeGatewayId}
          activeRoomId={activeRoomId}
          onRoomSelect={handleRoomSelect}
        />

        {/* 主聊天区域 */}
        <MainChat
          messages={currentMessages as any}
          isConnected={activeGatewayId ? isConnected(activeGatewayId) : false}
          onSendMessage={handleSendMessage}
          onDeleteMessage={handleDeleteMessage}
          onDeleteMessages={handleDeleteMessages}
        />
      </div>
    </div>
  );
}

export default App;

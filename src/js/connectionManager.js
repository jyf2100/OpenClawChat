// 连接管理器 - 管理多个连接的核心逻辑

class ConnectionManager {
  constructor() {
    this.connections = [];
    this.activeConnectionId = null;
    this.connectionStates = new Map(); // connId -> { ws, status, pending, messageQueue }
    this.messageCache = new Map();      // connId -> messages[]
    this.scrollPositions = new Map();    // connId -> scrollPosition
    this.unreadCounts = new Map();       // connId -> count
  }

  // ========== 初始化 ==========

  init() {
    // 加载连接配置
    this.connections = Storage.getConnections();
    this.activeConnectionId = Storage.getActiveConnection();

    // 初始化状态
    this.connections.forEach(conn => {
      this.connectionStates.set(conn.id, {
        status: 'disconnected',
        ws: null,
        pending: new Map(),
        messageQueue: [],
        reconnectAttempts: 0
      });
      this.messageCache.set(conn.id, Storage.getMessages(conn.id));
      this.scrollPositions.set(conn.id, Storage.getScrollPos(conn.id));
      this.unreadCounts.set(conn.id, 0);
    });

    // 如果没有连接，创建默认连接
    if (this.connections.length === 0) {
      this._createDefaultConnection();
    }

    // 如果没有活跃连接，设置第一个为活跃
    if (!this.activeConnectionId && this.connections.length > 0) {
      this.activeConnectionId = this.connections[0].id;
      Storage.setActiveConnection(this.activeConnectionId);
    }
  }

  _createDefaultConnection() {
    const conn = {
      id: 'conn-1',
      name: '默认连接',
      gatewayUrl: DEFAULTS.gatewayUrl,
      token: DEFAULTS.token || '',
      sessionKey: DEFAULTS.sessionKey,
      status: 'disconnected',
      unreadCount: 0,
      createdAt: Date.now(),
      lastConnected: null
    };

    this.connections = [conn];
    this.activeConnectionId = conn.id;
    Storage.saveConnections([conn]);
    Storage.setActiveConnection(conn.id);

    this.connectionStates.set(conn.id, {
      status: 'disconnected',
      ws: null,
      pending: new Map(),
      messageQueue: [],
      reconnectAttempts: 0
    });
    this.messageCache.set(conn.id, []);
    this.scrollPositions.set(conn.id, null);
    this.unreadCounts.set(conn.id, 0);
  }

  // ========== 连接 CRUD ==========

  addConnection(config) {
    // 验证配置
    const validation = this._validateConnection(config);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    // 生成 ID
    const id = 'conn-' + Date.now();
    const conn = {
      id,
      name: config.name,
      gatewayUrl: config.gatewayUrl,
      token: config.token || '',
      sessionKey: config.sessionKey,
      status: 'disconnected',
      unreadCount: 0,
      createdAt: Date.now(),
      lastConnected: null
    };

    // 添加到列表
    this.connections.push(conn);
    Storage.saveConnections(this.connections);

    // 初始化状态
    this.connectionStates.set(id, {
      status: 'disconnected',
      ws: null,
      pending: new Map(),
      messageQueue: [],
      reconnectAttempts: 0
    });
    this.messageCache.set(id, []);
    this.scrollPositions.set(id, null);
    this.unreadCounts.set(id, 0);

    return conn;
  }

  updateConnection(id, config) {
    const index = this.connections.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('连接不存在');
    }

    // 验证配置
    const validation = this._validateConnection(config);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    // 更新配置
    const conn = this.connections[index];
    const oldGateway = conn.gatewayUrl;
    const oldToken = conn.token;
    const oldSession = conn.sessionKey;

    Object.assign(conn, {
      name: config.name,
      gatewayUrl: config.gatewayUrl,
      token: config.token || '',
      sessionKey: config.sessionKey
    });

    Storage.saveConnections(this.connections);

    // 如果关键配置改变，重新连接
    if (oldGateway !== conn.gatewayUrl || oldToken !== conn.token || oldSession !== conn.sessionKey) {
      this.disconnect(id);
      this.connect(id);
    }

    return conn;
  }

  deleteConnection(id) {
    const index = this.connections.findIndex(c => c.id === id);
    if (index === -1) {
      throw new Error('连接不存在');
    }

    // 断开连接
    this.disconnect(id);

    // 删除配置
    this.connections.splice(index, 1);

    // 清除状态
    this.connectionStates.delete(id);
    this.messageCache.delete(id);
    this.scrollPositions.delete(id);
    this.unreadCounts.delete(id);

    // 清除存储
    Storage.clearMessages(id);

    // 从房间管理器中移除参与者
    if (window.roomManager) {
      window.roomManager.removeParticipant(id);
    }

    // 如果删除的是活跃连接，切换到第一个连接
    if (this.activeConnectionId === id) {
      if (this.connections.length > 0) {
        this.switchConnection(this.connections[0].id);
      } else {
        this.activeConnectionId = null;
        Storage.setActiveConnection(null);
      }
    }

    Storage.saveConnections(this.connections);

    // 更新 UI（参与者列表）
    if (window.UIManager && window.UIManager._updateRoomStatusBar) {
      window.UIManager._updateRoomStatusBar();
    }
  }

  getConnection(id) {
    return this.connections.find(c => c.id === id);
  }

  getAllConnections() {
    return [...this.connections];
  }

  // ========== 连接控制 ==========

  async connect(id) {
    const conn = this.getConnection(id);
    if (!conn) {
      throw new Error('连接不存在');
    }

    const state = this.connectionStates.get(id);
    if (state.status === 'connected') {
      return;
    }

    // 更新状态为连接中
    this._updateConnectionStatus(id, 'connecting');

    try {
      // 创建 WebSocket 连接
      const ws = new WebSocket(conn.gatewayUrl);
      state.ws = ws;

      // 等待连接打开
      await new Promise((resolve, reject) => {
        ws.onopen = () => {
          resolve();
          // 等待 connect.challenge
        };
        ws.onerror = (err) => {
          reject(new Error('WebSocket 连接失败'));
        };
      });

      // 设置消息处理器
      ws.onmessage = (event) => {
        this._handleMessage(id, event.data);
      };

      ws.onclose = () => {
        this._handleDisconnect(id);
      };

      // 发送认证请求
      await this._sendConnect(id, conn);

      // 更新状态为已连接
      this._updateConnectionStatus(id, 'connected');
      conn.lastConnected = Date.now();
      Storage.saveConnections(this.connections);

      // 加载历史消息
      await this._loadHistory(id);

      // 重置重试次数
      state.reconnectAttempts = 0;

    } catch (error) {
      this._updateConnectionStatus(id, 'error');
      throw error;
    }
  }

  disconnect(id) {
    const state = this.connectionStates.get(id);
    if (!state) return;

    // 关闭 WebSocket
    if (state.ws) {
      try {
        state.ws.close();
      } catch {
        // ignore
      }
      state.ws = null;
    }

    this._updateConnectionStatus(id, 'disconnected');
  }

  reconnect(id) {
    this.disconnect(id);
    setTimeout(() => {
      this.connect(id).catch(() => {
        // 连接失败，保持 disconnected 状态
      });
    }, 100);
  }

  getStatus(id) {
    const state = this.connectionStates.get(id);
    return state?.status || 'disconnected';
  }

  // 获取参与房间的连接（已连接的）
  getParticipants() {
    return this.connections.filter(conn => {
      const state = this.connectionStates.get(conn.id);
      return state?.status === 'connected';
    });
  }

  // ========== 消息管理 ==========

  async sendMessage(id, message, attachments = []) {
    const state = this.connectionStates.get(id);
    if (!state || !state.ws) {
      throw new Error('连接未建立');
    }

    const requestId = this._generateRequestId();

    // 设置 pending（包含空的 resolve/reject 以响应处理时不会报错）
    state.pending.set(requestId, {
      resolve: () => {},  // chat.send 的响应不需要特殊处理
      reject: () => {}
    });

    try {
      // 发送消息
      state.ws.send(JSON.stringify({
        type: 'req',
        id: requestId,
        method: 'chat.send',
        params: {
          sessionKey: this.getConnection(id).sessionKey,
          message,
          deliver: false,
          idempotencyKey: requestId,
          attachments: attachments && attachments.length > 0 ? attachments : undefined
        }
      }));

      // 添加到本地消息
      this._addLocalMessage(id, {
        id: this._generateMessageId(),
        role: 'user',
        content: message ? [{ type: 'text', text: message }] : [],
        attachments: attachments || [],
        timestamp: Date.now()
      });

    } catch (error) {
      state.pending.delete(requestId);
      throw error;
    }
  }

  getMessages(id) {
    return this.messageCache.get(id) || [];
  }

  markAsRead(id) {
    this.unreadCounts.set(id, 0);
    this._updateConnectionInList(id);
  }

  // ========== 连接切换 ==========

  switchConnection(id) {
    if (!this.getConnection(id)) {
      throw new Error('连接不存在');
    }

    // 保存当前连接的滚动位置
    if (this.activeConnectionId) {
      const currentPos = document.getElementById('chatThread')?.scrollTop || 0;
      this.scrollPositions.set(this.activeConnectionId, currentPos);
      Storage.saveScrollPos(this.activeConnectionId, currentPos);
    }

    // 切换活跃连接
    const oldId = this.activeConnectionId;
    this.activeConnectionId = id;
    Storage.setActiveConnection(id);

    // 清除未读数
    this.markAsRead(id);

    // 通知 UIManager 切换房间（隐藏公共聊天状态栏）
    if (window.UIManager && window.UIManager.switchToRoom) {
      window.UIManager.switchToRoom(id);
    }

    // 重新渲染界面
    this._renderConnectionList();
    this._renderMessages(id);

    // 恢复滚动位置
    const savedPos = this.scrollPositions.get(id);
    if (savedPos) {
      setTimeout(() => {
        const thread = document.getElementById('chatThread');
        if (thread) thread.scrollTop = savedPos;
      }, 100);
    }
  }

  // ========== 内部方法 ==========

  _validateConnection(config) {
    const errors = [];

    if (!config.name?.trim()) {
      errors.push('名称不能为空');
    }

    if (!config.name || config.name.length > 20) {
      errors.push('名称长度必须在 2-20 字符之间');
    }

    if (!config.gatewayUrl?.trim()) {
      errors.push('网关地址不能为空');
    }

    if (config.gatewayUrl && !config.gatewayUrl.startsWith('ws://') && !config.gatewayUrl.startsWith('wss://')) {
      errors.push('网关地址必须以 ws:// 或 wss:// 开头');
    }

    if (config.token && config.token.length < 10) {
      errors.push('令牌长度至少 10 个字符');
    }

    if (!config.sessionKey?.includes(':')) {
      errors.push('会话格式错误（应为 agent:xxx:yyy）');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  _updateConnectionStatus(id, status) {
    const conn = this.getConnection(id);
    if (conn) {
      conn.status = status;
      Storage.saveConnections(this.connections);
    }

    const state = this.connectionStates.get(id);
    if (state) {
      state.status = status;
    }

    this._renderConnectionList();

    // 如果在公共聊天模式，更新参与者显示
    if (window.UIManager && window.UIManager._updateRoomStatusBar) {
      window.UIManager._updateRoomStatusBar();
    }
  }

  _updateConnectionInList(id) {
    // 更新单个连接项的显示（未读数等）
    this._renderConnectionList();
  }

  incrementUnreadCount(id) {
    const current = this.unreadCounts.get(id) || 0;
    this.unreadCounts.set(id, current + 1);
    this._updateConnectionInList(id);
  }

  async _sendConnect(id, conn) {
    const state = this.connectionStates.get(id);

    return new Promise((resolve, reject) => {
      const requestId = this._generateRequestId();

      state.pending.set(requestId, {
        resolve,
        reject,
        type: 'connect'
      });

      state.ws.send(JSON.stringify({
        type: 'req',
        id: requestId,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'webchat',
            version: 'desktop-1',
            platform: 'desktop',
            mode: 'webchat'
          },
          role: 'operator',
          scopes: ['operator.admin', 'operator.approvals', 'operator.pairing'],
          auth: conn.token ? { token: conn.token } : undefined,
          userAgent: 'desktop',
          locale: 'zh-CN'
        }
      }));
    });
  }

  async _loadHistory(id) {
    const conn = this.getConnection(id);
    const state = this.connectionStates.get(id);

    return new Promise((resolve, reject) => {
      const requestId = this._generateRequestId();

      state.pending.set(requestId, { resolve, reject, type: 'history' });

      state.ws.send(JSON.stringify({
        type: 'req',
        id: requestId,
        method: 'chat.history',
        params: {
          sessionKey: conn.sessionKey,
          limit: 200
        }
      }));
    });
  }

  _handleMessage(id, data) {
    try {
      const parsed = JSON.parse(data);

      if (parsed.type === 'event') {
        if (parsed.event === 'connect.challenge') {
          // 已在 _sendConnect 中处理
          return;
        }
        if (parsed.event === 'chat') {
          this._handleChatEvent(id, parsed.payload);
        }
        return;
      }

      if (parsed.type === 'res') {
        const state = this.connectionStates.get(id);
        const pending = state.pending.get(parsed.id);

        if (pending) {
          state.pending.delete(parsed.id);

          if (parsed.ok) {
            if (pending.type === 'history') {
              const messages = parsed.payload?.messages || [];
              this.messageCache.set(id, messages);
              Storage.saveMessages(id, messages);
              // 如果是当前活跃连接，渲染消息
              if (id === this.activeConnectionId) {
                this._renderMessages(id);
              }
            }
            pending.resolve(parsed.payload);
          } else {
            pending.reject(new Error(parsed.error?.message || '请求失败'));
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle message:', error);
    }
  }

  _handleChatEvent(id, payload) {
    console.log('[ChatEvent] 收到聊天事件，连接ID:', id, '状态:', payload.state);

    const conn = this.getConnection(id);
    if (!conn) {
      console.warn('[ChatEvent] 连接不存在:', id);
      return;
    }

    // sessionKey 验证：检查原始或动态 sessionKey
    let sessionKeyMatch = payload.sessionKey === conn.sessionKey;

    // 在房间模式下，也检查动态 sessionKey
    if (!sessionKeyMatch && window.roomManager) {
      const dynamicKey = window.roomManager.getDynamicSessionKey(id);
      if (dynamicKey && payload.sessionKey === dynamicKey) {
        sessionKeyMatch = true;
        console.log('[ChatEvent] 使用动态 sessionKey 验证通过');
      }
    }

    if (!sessionKeyMatch) {
      console.warn('[ChatEvent] sessionKey 不匹配, payload:', payload.sessionKey, 'conn:', conn.sessionKey);
      return;
    }

    console.log('[ChatEvent] 连接名称:', conn.name);

    // 检查是否在房间模式
    const roomStatusBar = document.getElementById('roomStatusBar');
    const isInRoomMode = roomStatusBar && roomStatusBar.style.display === 'flex';

    console.log('[ChatEvent] roomStatusBar.display:', roomStatusBar?.style.display);
    console.log('[ChatEvent] isInRoomMode:', isInRoomMode);
    console.log('[ChatEvent] roomManager 存在:', !!window.roomManager);

    if (isInRoomMode && window.roomManager) {
      console.log('[ChatEvent] 房间模式 -> 调用 _handleRoomChatEvent');
      // 房间模式：将 AI 回复添加到房间
      this._handleRoomChatEvent(id, payload, conn);
    } else {
      console.log('[ChatEvent] 普通模式 -> 调用 onChatEvent, activeConnectionId:', this.activeConnectionId, '当前ID:', id);
      // 普通模式：原有逻辑
      if (id === this.activeConnectionId && this.onChatEvent) {
        this.onChatEvent(payload);
      }
    }

    if (payload.state === 'delta' || payload.state === 'final' || payload.state === 'aborted' || payload.state === 'error') {
      // 更新消息缓存（在 final 状态时重新加载历史）
      if (payload.state === 'final') {
        // 在 app.js 的 handleChatEvent 中会加载历史消息
      }
    }
  }

  _handleRoomChatEvent(id, payload, conn) {
    console.log('[RoomChatEvent] 收到房间聊天事件，连接:', conn.name, '状态:', payload.state);
    console.log('[RoomChatEvent] payload.message:', JSON.stringify(payload.message));

    // 提取消息内容
    const text = extractText(payload.message);
    console.log('[RoomChatEvent] 提取的文本内容:', text?.substring(0, 100) || '(空)');

    if (!text) {
      console.warn('[RoomChatEvent] 文本内容为空，跳过');
      return;
    }

    // 根据 payload.state 决定如何处理
    if (payload.state === 'delta') {
      console.log('[RoomChatEvent] 处理流式更新 (delta)');
      // 流式更新：更新或创建临时消息
      let tempMsg = this._tempRoomMessage;
      if (!tempMsg) {
        tempMsg = window.roomManager.addMessage({
          senderId: conn.id,
          senderName: conn.name,
          senderType: 'ai',
          content: text,
          isStreaming: true
        });
        this._tempRoomMessage = tempMsg;
        console.log('[RoomChatEvent] 创建新消息，ID:', tempMsg.id);

        // 渲染消息
        console.log('[RoomChatEvent] UIManager._renderRoomMessage 存在:', !!window.UIManager._renderRoomMessage);
        if (window.UIManager._renderRoomMessage) {
          console.log('[RoomChatEvent] 调用 _renderRoomMessage');
          window.UIManager._renderRoomMessage(tempMsg);
        } else {
          console.error('[RoomChatEvent] UIManager._renderRoomMessage 不存在！');
        }
      } else {
        // 更新现有消息
        tempMsg.content = text;
        const chatThread = document.getElementById('chatThread');
        const line = document.getElementById(tempMsg.id);
        console.log('[RoomChatEvent] 更新现有消息，找到元素:', !!line);
        if (line) {
          const bubble = line.querySelector('.bubble .text');
          if (bubble) {
            bubble.textContent = text;
          }
        }
      }
    } else if (payload.state === 'final') {
      console.log('[RoomChatEvent] 处理最终消息 (final)');
      // 最终消息：完成流式更新
      if (this._tempRoomMessage) {
        console.log('[RoomChatEvent] 更新临时消息为最终消息');
        this._tempRoomMessage.content = text;
        this._tempRoomMessage.isStreaming = false;
        window.roomManager.saveMessages();

        // 更新 UI（支持 Markdown）
        const chatThread = document.getElementById('chatThread');
        const line = document.getElementById(this._tempRoomMessage.id);
        console.log('[RoomChatEvent] 找到消息元素:', !!line);

        if (line) {
          console.log('[RoomChatEvent] line 元素 innerHTML 预览:', line.innerHTML.substring(0, 200));
          console.log('[RoomChatEvent] line.className:', line.className);

          const bubble = line.querySelector('.bubble');
          console.log('[RoomChatEvent] 找到 bubble 元素:', !!bubble);

          if (bubble) {
            console.log('[RoomChatEvent] bubble.className:', bubble.className);
            console.log('[RoomChatEvent] bubble.innerHTML 更新前:', bubble.innerHTML.substring(0, 100));

            try {
              const html = marked.parse(text);
              console.log('[RoomChatEvent] Markdown 解析成功，长度:', html.length);
              bubble.innerHTML = `<div class="text markdown-content">${html}</div>`;
              console.log('[RoomChatEvent] bubble.innerHTML 已更新，新内容长度:', bubble.innerHTML.length);

              // 高亮代码块
              const codeBlocks = bubble.querySelectorAll('pre code');
              console.log('[RoomChatEvent] 找到代码块数量:', codeBlocks.length);
              codeBlocks.forEach((block) => {
                hljs.highlightElement(block);
              });
              console.log('[RoomChatEvent] 代码高亮完成');
            } catch (error) {
              console.error('[RoomChatEvent] 更新 UI 时出错:', error);
            }
          } else {
            console.error('[RoomChatEvent] bubble 元素不存在！line 内容:', line.innerHTML);
          }
        } else {
          console.error('[RoomChatEvent] line 元素不存在！');
        }

        this._tempRoomMessage = null;
      } else {
        console.log('[RoomChatEvent] 创建新最终消息');
        // 创建新消息
        const aiMsg = window.roomManager.addMessage({
          senderId: conn.id,
          senderName: conn.name,
          senderType: 'ai',
          content: text
        });
        console.log('[RoomChatEvent] 新消息已创建，ID:', aiMsg.id);

        console.log('[RoomChatEvent] UIManager._renderRoomMessage 存在:', !!window.UIManager._renderRoomMessage);
        if (window.UIManager._renderRoomMessage) {
          console.log('[RoomChatEvent] 调用 _renderRoomMessage');
          window.UIManager._renderRoomMessage(aiMsg);
        } else {
          console.error('[RoomChatEvent] UIManager._renderRoomMessage 不存在！');
        }
      }

      // 滚动到底部
      const chatThread = document.getElementById('chatThread');
      if (chatThread) {
        chatThread.scrollTop = chatThread.scrollHeight;
      }

      // ========== 对话循环触发逻辑 ==========
      console.log('[RoomChatEvent] 检查对话循环状态...');
      if (window.roomManager && window.roomManager.conversationLoop.isActive) {
        const loopState = window.roomManager.conversationLoop;
        console.log('[RoomChatEvent] 对话循环激活中，当前发言者:', conn.id, '参与者列表:', loopState.participants);

        if (loopState.participants.includes(id)) {
          console.log('[RoomChatEvent] 当前发言者在参与者列表中，检查是否继续...');
          if (window.roomManager.shouldContinueLoop(id, text)) {
            const nextSpeakerId = window.roomManager.getNextSpeaker();
            console.log('[RoomChatEvent] 下一个发言者:', nextSpeakerId);

            if (nextSpeakerId && nextSpeakerId !== id) {
              // 延迟 1.5 秒后触发下一个发言者
              setTimeout(() => {
                this._triggerNextSpeaker(nextSpeakerId, text, conn);
              }, 1500);
            } else if (!nextSpeakerId) {
              console.log('[RoomChatEvent] 没有下一个发言者，生成总结');
              this._generateLoopSummary();
            }
          } else {
            console.log('[RoomChatEvent] 循环条件不满足，生成总结');
            this._generateLoopSummary();
          }
        } else {
          console.log('[RoomChatEvent] 当前发言者不在参与者列表中');
        }
      } else {
        console.log('[RoomChatEvent] 对话循环未激活');
      }
    } else if (payload.state === 'error') {
      // 错误状态
      if (this._tempRoomMessage) {
        this._tempRoomMessage.content = `错误: ${text}`;
        this._tempRoomMessage.isStreaming = false;
        window.roomManager.saveMessages();
        this._tempRoomMessage = null;
      }
    }
  }

  _handleDisconnect(id) {
    const state = this.connectionStates.get(id);
    if (!state) return;

    state.ws = null;

    // 自动重连逻辑
    if (state.reconnectAttempts < 3) {
      state.reconnectAttempts++;
      this._updateConnectionStatus(id, 'connecting');

      setTimeout(() => {
        this.connect(id).catch(() => {
          this._updateConnectionStatus(id, 'error');
        });
      }, 5000);
    } else {
      this._updateConnectionStatus(id, 'error');
    }
  }

  _addLocalMessage(id, message) {
    const messages = this.messageCache.get(id) || [];
    messages.push(message);
    this.messageCache.set(id, messages);
    Storage.saveMessages(id, messages);

    if (id === this.activeConnectionId) {
      this._renderMessages(id);
    }
  }

  _renderConnectionList() {
    const container = document.getElementById('connList');
    if (!container) return;

    container.innerHTML = this.connections.map(conn => {
      const isActive = conn.id === this.activeConnectionId;
      const unread = this.unreadCounts.get(conn.id) || 0;

      return `
        <div class="conn-item ${isActive ? 'active' : ''}" data-id="${conn.id}">
          <span class="conn-status ${conn.status}"></span>
          <span class="conn-name">${this._escapeHtml(conn.name)}</span>
          ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        </div>
      `;
    }).join('');

    // 绑定点击事件
    container.querySelectorAll('.conn-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const connId = e.currentTarget.dataset.id;
        this.switchConnection(connId);
      });

      // 右键菜单
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const connId = e.currentTarget.dataset.id;
        this._showContextMenu(e, connId);
      });
    });
  }

  _renderMessages(id) {
    const messages = this.messageCache.get(id) || [];
    const conn = this.getConnection(id);

    // 更新 app.js 中的消息状态
    if (window.state) {
      window.state.messages = messages;
      window.state.streamText = null;
      window.state.runId = null;
      window.state.streamStartedAt = null;

      // 更新连接配置
      if (conn) {
        window.state.gatewayUrl = conn.gatewayUrl;
        window.state.token = conn.token;
        window.state.sessionKey = conn.sessionKey;
      }
    }

    // 更新设置面板显示
    if (conn) {
      const titleEl = document.getElementById('currentConnTitle');
      if (titleEl) {
        titleEl.textContent = conn.name;
      }

      const gatewayInput = document.getElementById('gatewayUrl');
      const tokenInput = document.getElementById('token');
      const sessionInput = document.getElementById('sessionKey');

      if (gatewayInput) gatewayInput.value = conn.gatewayUrl;
      if (tokenInput) tokenInput.value = conn.token || '';
      if (sessionInput) sessionInput.value = conn.sessionKey;
    }

    // 调用 app.js 的渲染函数
    if (window.buildRenderedMessages) {
      window.buildRenderedMessages();
    }

    // 更新连接状态显示
    const status = this.getStatus(id);
    if (window.setStatus) {
      window.setStatus(status === 'connected', status === 'connected' ? '已连接' : '未连接');
    }
  }

  _showContextMenu(event, connId) {
    if (window.UIManager) {
      window.UIManager._showContextMenu(event, connId);
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _generateRequestId() {
    return 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  _generateMessageId() {
    return 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // ========== 对话循环相关方法 ==========

  // 触发下一个发言者
  async _triggerNextSpeaker(nextSpeakerId, previousMessage, previousConn) {
    console.log('[TriggerNextSpeaker] 触发下一个发言者:', nextSpeakerId);
    console.log('[TriggerNextSpeaker] 上一个消息来自:', previousConn.name);

    const nextConn = this.getConnection(nextSpeakerId);
    if (!nextConn) {
      console.error('[TriggerNextSpeaker] 找不到连接:', nextSpeakerId);
      window.roomManager.stopConversationLoop('conn_not_found');
      return;
    }

    // 构建上下文消息
    const contextMsg = `${previousConn.name} 的回复:\n${previousMessage}\n\n请继续讨论这个话题。`;
    console.log('[TriggerNextSpeaker] 上下文消息长度:', contextMsg.length);

    try {
      if (window.messageRouter) {
        await window.messageRouter.routeMessage(contextMsg, {
          mentions: [nextSpeakerId],
          includeContext: true,
          forceReconnect: false
        });
        console.log('[TriggerNextSpeaker] 消息已发送');

        // 更新 UI 状态
        if (window.UIManager && window.UIManager._updateLoopStatusUI) {
          window.UIManager._updateLoopStatusUI();
        }
      } else {
        console.error('[TriggerNextSpeaker] messageRouter 不存在');
      }
    } catch (error) {
      console.error('[TriggerNextSpeaker] 发送失败:', error);
      if (window.roomManager) {
        window.roomManager.stopConversationLoop('send_error');
      }
    }
  }

  // 生成循环总结
  _generateLoopSummary() {
    console.log('[LoopSummary] 生成循环总结');
    const loopState = window.roomManager?.conversationLoop;
    if (!loopState) {
      console.warn('[LoopSummary] 循环状态不存在');
      return;
    }

    const duration = loopState.startTime ? Date.now() - loopState.startTime : 0;
    const durationSeconds = Math.floor(duration / 1000);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationText = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

    const summaryMsg = {
      senderId: 'system',
      senderName: '系统',
      senderType: 'system',
      content: `对话循环已结束。\n\n总轮数: ${loopState.currentRound}/${loopState.maxRounds}\n参与 AI: ${loopState.participants.length}\n持续时间: ${durationText}\n结束原因: ${loopState.autoStop ? '达到最大轮数' : '手动停止'}`,
      timestamp: Date.now()
    };

    console.log('[LoopSummary] 总结消息:', summaryMsg);

    if (window.roomManager) {
      const msg = window.roomManager.addMessage(summaryMsg);
      if (window.UIManager._renderRoomMessage) {
        window.UIManager._renderRoomMessage(msg);

        // 滚动到底部
        const chatThread = document.getElementById('chatThread');
        if (chatThread) {
          chatThread.scrollTop = chatThread.scrollHeight;
        }
      }
    }

    // 更新 UI 状态
    if (window.UIManager && window.UIManager._updateLoopStatusUI) {
      window.UIManager._updateLoopStatusUI();
    }
  }
}

// 导出到全局
window.ConnectionManager = ConnectionManager;

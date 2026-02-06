// src/js/sessionManager.js
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.connectionManager = null;  // 延迟初始化
    this.activeSessionId = null;
  }

  // 设置连接管理器（用于依赖注入）
  setConnectionManager(connectionManager) {
    this.connectionManager = connectionManager;
  }

  // 初始化
  init() {
    // 加载会话数据
    const sessions = window.Storage.getSessions();
    for (const [id, session] of Object.entries(sessions)) {
      this.sessions.set(id, session);
    }

    // 加载活跃会话
    this.activeSessionId = window.Storage.getActiveSession();

    // 如果没有活跃会话，设置第一个
    if (!this.activeSessionId && this.sessions.size > 0) {
      this.activeSessionId = Array.from(this.sessions.keys())[0];
      window.Storage.setActiveSession(this.activeSessionId);
    }

    console.log('[SessionManager] Loaded', this.sessions.size, 'sessions');
  }

  // ========== Session CRUD ==========

  createSession(type, config) {
    const sessionId = type === 'connection'
      ? config.id || 'conn-' + Date.now()
      : 'room-' + Date.now();

    let session;

    if (type === 'connection') {
      // 添加到 ConnectionManager
      const conn = this.connectionManager.addConnection(config);

      session = {
        id: sessionId,
        type: 'connection',
        name: config.name,
        gatewayUrl: config.gatewayUrl,
        token: config.token || '',
        sessionKey: config.sessionKey,
        messages: config.messages || [],
        settings: {},
        createdAt: Date.now()
      };
    } else if (type === 'room') {
      session = this._createRoomSession(config);
    }

    this.sessions.set(sessionId, session);
    window.Storage.saveSession(session);

    return session;
  }

  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.type === 'connection') {
      // 从 ConnectionManager 移除
      const conn = this.connectionManager.getConnection(sessionId);
      if (conn) {
        this.connectionManager.deleteConnection(sessionId);
      }
    }

    this.sessions.delete(sessionId);
    window.Storage.deleteSession(sessionId);

    // 如果删除的是活跃会话，切换到第一个
    if (this.activeSessionId === sessionId) {
      const remaining = Array.from(this.sessions.keys());
      if (remaining.length > 0) {
        this.switchSession(remaining[0]);
      } else {
        this.activeSessionId = null;
        window.Storage.setActiveSession('');
      }
    }

    return true;
  }

  switchSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      console.warn('[SessionManager] Session not found:', sessionId);
      return false;
    }

    this.activeSessionId = sessionId;
    window.Storage.setActiveSession(sessionId);

    console.log('[SessionManager] Switched to session:', sessionId);
    return true;
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getActiveSession() {
    return this.sessions.get(this.activeSessionId);
  }

  // ========== 房间专用 ==========

  // 只获取房间，不包括连接
  getAllRooms() {
    const all = this.getAllSessions();
    return all.filter(s => s.type === 'room');
  }

  // 活跃房间ID（独立于活跃连接）
  get activeRoomId() {
    // 检查当前活跃会话是否为房间类型
    const sessionId = this.activeSessionId;
    if (!sessionId) return null;

    const session = this.getSession(sessionId);
    return session?.type === 'room' ? sessionId : null;
  }

  // 切换房间
  switchRoom(roomId) {
    return this.switchSession(roomId);
  }

  _createRoomSession(config) {
    const normalized = this.normalizeRoomName(config.name);
    const roomId = `room:${normalized}`;

    const session = {
      id: 'room-' + Date.now(),
      type: 'room',
      name: config.name,
      normalizedRoomName: normalized,
      roomId: roomId,
      messages: [],
      participants: [],
      settings: {
        aiInteractionEnabled: true,
        conversationLoop: { enabled: false }
      },
      createdAt: Date.now()
    };

    // 添加参与者
    if (config.participantIds && config.participantIds.length > 0) {
      for (const connId of config.participantIds) {
        this._addParticipantToSession(session, connId);
      }
    }

    return session;
  }

  addParticipantToRoom(sessionId, connId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.type !== 'room') {
      console.warn('[SessionManager] Not a room session:', sessionId);
      return false;
    }

    return this._addParticipantToSession(session, connId);
  }

  _addParticipantToSession(session, connId) {
    const conn = this.connectionManager.getConnection(connId);
    if (!conn) {
      console.warn('[SessionManager] Connection not found:', connId);
      return false;
    }

    // 验证 sessionKey 格式
    if (!conn.sessionKey || typeof conn.sessionKey !== 'string') {
      console.error('[SessionManager] Invalid sessionKey for connection:', connId);
      return false;
    }

    const parts = conn.sessionKey.split(':');
    if (parts.length < 2) {
      console.error('[SessionManager] Malformed sessionKey:', conn.sessionKey);
      return false;
    }

    // 检查是否已存在
    if (session.participants.some(p => p.connId === connId)) {
      return false;
    }

    const agentId = parts[1];
    const dynamicKey = this.generateDynamicSessionKey(
      agentId,
      session.normalizedRoomName,
      Date.now()
    );

    const participant = {
      connId: connId,
      agentId: agentId,
      sessionKey: conn.sessionKey,
      dynamicKey: dynamicKey,
      name: conn.name
    };

    session.participants.push(participant);
    window.Storage.saveSession(session);

    console.log('[SessionManager] Added participant to room:', session.name, '-', conn.name);
    return true;
  }

  removeParticipantFromRoom(sessionId, connId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.type !== 'room') {
      return false;
    }

    const index = session.participants.findIndex(p => p.connId === connId);
    if (index === -1) return false;

    session.participants.splice(index, 1);
    window.Storage.saveSession(session);

    return true;
  }

  // ========== 辅助方法 ==========

  normalizeRoomName(name) {
    return name
      .replace(/:/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[\/\\]/g, '-')
      .toLowerCase();
  }

  generateDynamicSessionKey(agentId, roomName, timestamp) {
    const normalized = this.normalizeRoomName(roomName);
    return `agent:${agentId}:client:room:${normalized}:${timestamp}`;
  }

  _generateId() {
    return 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // ========== 消息发送 ==========

  async sendMessage(sessionId, message, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }

    if (session.type === 'connection') {
      return await this._sendToConnection(session.id, message, options);
    } else if (session.type === 'room') {
      return await this._sendToRoom(session.id, message, options);
    }
  }

  async _sendToConnection(connId, message, options) {
    const conn = this.connectionManager.getConnection(connId);
    if (!conn) {
      throw new Error('Connection not found: ' + connId);
    }

    // 使用 MessageRouter 发送消息
    if (window.messageRouter) {
      return await window.messageRouter._sendToConnection(conn, message, options);
    }

    // Fallback: 直接通过 WebSocket 发送
    const state = this.connectionManager.connectionStates.get(connId);
    if (!state || !state.ws) {
      throw new Error('连接未建立');
    }

    const requestId = this._generateId();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.pending.delete(requestId);
        resolve();
      }, 5000);

      state.pending.set(requestId, {
        resolve: (payload) => {
          clearTimeout(timeout);
          resolve(payload);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      try {
        const payload = JSON.stringify({
          type: 'req',
          id: requestId,
          method: 'chat.send',
          params: {
            sessionKey: conn.sessionKey,
            message: message,
            deliver: false,
            idempotencyKey: requestId
          }
        });
        state.ws.send(payload);
      } catch (error) {
        clearTimeout(timeout);
        state.pending.delete(requestId);
        reject(error);
      }
    });
  }

  async _sendToRoom(roomId, message, options) {
    const session = this.sessions.get(roomId);
    if (!session) {
      throw new Error('Room session not found: ' + roomId);
    }

    if (session.participants.length === 0) {
      throw new Error('No participants in room');
    }

    const results = [];

    for (const participant of session.participants) {
      try {
        const conn = this.connectionManager.getConnection(participant.connId);
        if (!conn) {
          results.push({ success: false, participant: participant.name, error: '连接不存在' });
          continue;
        }

        // 使用参与者的动态 sessionKey 发送
        const state = this.connectionManager.connectionStates.get(participant.connId);
        if (!state || !state.ws) {
          results.push({ success: false, participant: participant.name, error: '连接未建立' });
          continue;
        }

        const requestId = this._generateId();
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            state.pending.delete(requestId);
            resolve();
          }, 5000);

          state.pending.set(requestId, {
            resolve: (payload) => {
              clearTimeout(timeout);
              resolve(payload);
            },
            reject: () => {
              clearTimeout(timeout);
              resolve();
            }
          });

          try {
            const payload = JSON.stringify({
              type: 'req',
              id: requestId,
              method: 'chat.send',
              params: {
                sessionKey: participant.dynamicKey,
                message: message,
                deliver: false,
                idempotencyKey: requestId
              }
            });
            state.ws.send(payload);
            results.push({ success: true, participant: participant.name });
          } catch (error) {
            clearTimeout(timeout);
            state.pending.delete(requestId);
            results.push({ success: false, participant: participant.name, error: error.message });
          }
        });
      } catch (error) {
        console.error('[SessionManager] Failed to send to', participant.name, error);
        results.push({ success: false, participant: participant.name, error: error.message });
      }
    }

    return results;
  }
}

// 导出到全局
window.SessionManager = SessionManager;

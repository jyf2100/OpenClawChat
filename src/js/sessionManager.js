// src/js/sessionManager.js
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.connectionManager = window.ConnectionManager;
    this.activeSessionId = null;
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

    // 检查是否已存在
    if (session.participants.some(p => p.connId === connId)) {
      return false;
    }

    const agentId = conn.sessionKey.split(':')[1];
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
}

// 导出到全局
window.SessionManager = SessionManager;

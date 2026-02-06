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

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getActiveSession() {
    return this.sessions.get(this.activeSessionId);
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

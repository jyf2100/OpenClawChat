// 存储管理模块
const Storage = {
  // 存储键名
  KEYS: {
    CONNECTIONS: "openclaw.connections",
    ACTIVE_CONN: "openclaw.active_conn",
    MESSAGES_PREFIX: "openclaw.messages.",
    SCROLL_PREFIX: "openclaw.scroll.",
    ROOM_MESSAGES: "roclaw.room.messages",
    ROOM_SETTINGS: "roclaw.room.settings",
    ROOM_ACTIVE: "roclaw.room.active",
    ROOM_SESSION_KEYS: "roclaw.room.sessionKeys",
    SESSIONS: "roclaw.sessions",        // 新增：统一会话存储
    ACTIVE_SESSION: "roclaw.activeSession"  // 新增：活跃会话ID
  },

  // ========== 连接配置 ==========

  // 获取所有连接配置
  getConnections() {
    try {
      const data = localStorage.getItem(this.KEYS.CONNECTIONS);
      if (!data) {
        // 返回默认连接（从旧格式迁移）
        return this._migrateFromOldFormat();
      }
      const parsed = JSON.parse(data);
      return parsed.connections || [];
    } catch (error) {
      console.error('Failed to load connections:', error);
      return this._migrateFromOldFormat();
    }
  },

  // 保存连接配置
  saveConnections(connections) {
    try {
      const data = {
        connections,
        version: 1,
        updatedAt: Date.now()
      };
      localStorage.setItem(this.KEYS.CONNECTIONS, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save connections:', error);
      throw error;
    }
  },

  // ========== 活跃连接 ==========

  // 获取当前活跃连接 ID
  getActiveConnection() {
    try {
      const data = localStorage.getItem(this.KEYS.CONNECTIONS);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.activeConnectionId || null;
      }
      return null;
    } catch {
      return null;
    }
  },

  // 设置活跃连接
  setActiveConnection(connId) {
    try {
      const data = localStorage.getItem(this.KEYS.CONNECTIONS);
      const parsed = data ? JSON.parse(data) : { connections: [] };
      parsed.activeConnectionId = connId;
      localStorage.setItem(this.KEYS.CONNECTIONS, JSON.stringify(parsed));
    } catch (error) {
      console.error('Failed to set active connection:', error);
    }
  },

  // ========== 消息缓存 ==========

  // 获取连接的消息缓存
  getMessages(connId) {
    try {
      const key = this.KEYS.MESSAGES_PREFIX + connId;
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.messages || [];
      }
      return [];
    } catch (error) {
      console.error(`Failed to load messages for ${connId}:`, error);
      return [];
    }
  },

  // 保存连接的消息缓存
  saveMessages(connId, messages) {
    try {
      // 限制消息数量
      const trimmed = messages.slice(-1000);

      // 清理旧消息（7天前）
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const filtered = trimmed.filter(m => (m.timestamp || 0) > sevenDaysAgo);

      const data = {
        sessionId: this._extractSessionKey(connId),
        messages: filtered,
        lastSync: Date.now()
      };

      const key = this.KEYS.MESSAGES_PREFIX + connId;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`Failed to save messages for ${connId}:`, error);
    }
  },

  // 清除连接的消息缓存
  clearMessages(connId) {
    try {
      const key = this.KEYS.MESSAGES_PREFIX + connId;
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Failed to clear messages for ${connId}:`, error);
    }
  },

  // ========== 滚动位置 ==========

  // 获取连接的滚动位置
  getScrollPos(connId) {
    try {
      const key = this.KEYS.SCROLL_PREFIX + connId;
      const pos = localStorage.getItem(key);
      return pos ? parseInt(pos, 10) : null;
    } catch {
      return null;
    }
  },

  // 保存连接的滚动位置
  saveScrollPos(connId, position) {
    try {
      const key = this.KEYS.SCROLL_PREFIX + connId;
      localStorage.setItem(key, String(position));
    } catch (error) {
      console.error(`Failed to save scroll pos for ${connId}:`, error);
    }
  },

  // ========== 辅助方法 ==========

  // 从 sessionKey 提取会话信息
  _extractSessionKey(connId) {
    const conn = this.getConnections().find(c => c.id === connId);
    return conn?.sessionKey || 'unknown';
  },

  // 从旧格式迁移配置
  _migrateFromOldFormat() {
    try {
      // 尝试读取旧的单连接配置
      const oldSettings = localStorage.getItem('openclaw.chat.settings.v1');
      if (oldSettings) {
        const parsed = JSON.parse(oldSettings);
        const conn = {
          id: 'conn-1',
          name: '默认连接',
          gatewayUrl: parsed.gatewayUrl || DEFAULTS.gatewayUrl,
          token: parsed.token || DEFAULTS.token,
          sessionKey: parsed.sessionKey || DEFAULTS.sessionKey,
          status: 'disconnected',
          unreadCount: 0,
          createdAt: Date.now(),
          lastConnected: null
        };

        // 保存新格式
        this.saveConnections([conn]);
        this.setActiveConnection('conn-1');

        // 清除旧配置
        localStorage.removeItem('openclaw.chat.settings.v1');

        return [conn];
      }
      return [];
    } catch (error) {
      console.error('Failed to migrate from old format:', error);
      return [];
    }
  },

  // 清理所有数据
  clearAll() {
    try {
      // 获取所有连接的键
      const keys = Object.keys(localStorage);
      const prefixToRemove = ['openclaw.messages.', 'openclaw.scroll.'];

      keys.forEach(key => {
        if (prefixToRemove.some(prefix => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      });

      // 保留连接配置，清除活跃连接
      const connections = this.getConnections();
      this.saveConnections(connections);
      localStorage.removeItem(this.KEYS.ACTIVE_CONN);
    } catch (error) {
      console.error('Failed to clear all data:', error);
    }
  },

  // ========== 房间相关存储 ==========

  // 获取房间消息
  getRoomMessages() {
    try {
      const data = localStorage.getItem(this.KEYS.ROOM_MESSAGES);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.messages || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to load room messages:', error);
      return [];
    }
  },

  // 保存房间消息
  saveRoomMessages(messages) {
    try {
      // 限制消息数量
      const trimmed = messages.slice(-500);

      // 清理旧消息（30天前）
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const filtered = trimmed.filter(m => (m.timestamp || 0) > thirtyDaysAgo);

      const data = {
        messages: filtered,
        updatedAt: Date.now()
      };

      localStorage.setItem(this.KEYS.ROOM_MESSAGES, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save room messages:', error);
    }
  },

  // 清空房间消息
  clearRoomMessages() {
    try {
      localStorage.removeItem(this.KEYS.ROOM_MESSAGES);
    } catch (error) {
      console.error('Failed to clear room messages:', error);
    }
  },

  // 获取房间设置
  getRoomSettings() {
    try {
      const data = localStorage.getItem(this.KEYS.ROOM_SETTINGS);
      if (data) {
        return JSON.parse(data);
      }
      return {
        aiInteractionEnabled: false,
        theme: 'default'
      };
    } catch (error) {
      console.error('Failed to load room settings:', error);
      return {
        aiInteractionEnabled: false,
        theme: 'default'
      };
    }
  },

  // 保存房间设置
  saveRoomSettings(settings) {
    try {
      const data = {
        ...settings,
        updatedAt: Date.now()
      };
      localStorage.setItem(this.KEYS.ROOM_SETTINGS, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save room settings:', error);
    }
  },

  // 获取当前活跃的视图（连接或房间）
  getActiveView() {
    try {
      const active = localStorage.getItem(this.KEYS.ROOM_ACTIVE);
      return active || 'connection';
    } catch {
      return 'connection';
    }
  },

  // 设置当前活跃的视图
  setActiveView(view, id) {
    try {
      localStorage.setItem(this.KEYS.ROOM_ACTIVE, view);
      if (view === 'connection' && id) {
        this.setActiveConnection(id);
      }
    } catch (error) {
      console.error('Failed to set active view:', error);
    }
  },

  // ========== 房间 SessionKey 映射存储（会话隔离）==========

  // 保存房间 sessionKey 映射
  saveRoomSessionKeys(sessionKeyMap) {
    try {
      localStorage.setItem(this.KEYS.ROOM_SESSION_KEYS, JSON.stringify(sessionKeyMap));
      console.log('[Storage] 已保存房间 sessionKey 映射');
    } catch (error) {
      console.error('[Storage] 保存房间 sessionKey 映射失败:', error);
    }
  },

  // 获取房间 sessionKey 映射
  getRoomSessionKeys() {
    try {
      const data = localStorage.getItem(this.KEYS.ROOM_SESSION_KEYS);
      if (data) {
        return JSON.parse(data);
      }
      return {};
    } catch (error) {
      console.error('[Storage] 加载房间 sessionKey 映射失败:', error);
      return {};
    }
  },

  // ========== Session 存储（新增）==========

  // 获取所有会话
  getSessions() {
    try {
      const data = localStorage.getItem(this.KEYS.SESSIONS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[Storage] Failed to load sessions:', error);
      return {};
    }
  },

  // 保存所有会话
  saveSessions(sessions) {
    try {
      localStorage.setItem(this.KEYS.SESSIONS, JSON.stringify(sessions));
    } catch (error) {
      console.error('[Storage] Failed to save sessions:', error);
      throw error;
    }
  },

  // 获取单个会话
  getSession(sessionId) {
    const sessions = this.getSessions();
    return sessions[sessionId];
  },

  // 保存单个会话
  saveSession(session) {
    const sessions = this.getSessions();
    sessions[session.id] = session;
    this.saveSessions(sessions);
  },

  // 删除会话
  deleteSession(sessionId) {
    const sessions = this.getSessions();
    delete sessions[sessionId];
    this.saveSessions(sessions);
  },

  // 获取活跃会话
  getActiveSession() {
    return localStorage.getItem(this.KEYS.ACTIVE_SESSION);
  },

  // 设置活跃会话
  setActiveSession(sessionId) {
    localStorage.setItem(this.KEYS.ACTIVE_SESSION, sessionId);
  }
};

// 导出到全局
window.Storage = Storage;

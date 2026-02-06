// src/js/dataMigration.js
const DataMigration = {
  VERSION: 2,

  needsMigration() {
    const currentVersion = localStorage.getItem('roclaw.migration.version');
    return !currentVersion || parseInt(currentVersion) < this.VERSION;
  },

  migrate() {
    console.log('[Migration] Starting migration to version', this.VERSION);

    const sessions = {};

    // 1. 迁移连接数据
    const connections = window.Storage.getConnections();
    console.log('[Migration] Migrating', connections.length, 'connections');

    for (const conn of connections) {
      sessions[conn.id] = {
        id: conn.id,
        type: 'connection',
        name: conn.name,
        gatewayUrl: conn.gatewayUrl,
        token: conn.token || '',
        sessionKey: conn.sessionKey,
        messages: window.Storage.getMessages(conn.id),
        settings: {},
        createdAt: conn.createdAt || Date.now(),
        lastActive: conn.lastConnected || null
      };
    }

    // 2. 迁移房间数据（如果存在）
    const roomMessages = localStorage.getItem('roclaw.room.messages');
    const roomSettings = localStorage.getItem('roclaw.room.settings');
    const roomParticipants = localStorage.getItem('roclaw.room.participants'); // 假设存在

    if (roomMessages || roomSettings) {
      console.log('[Migration] Migrating room data');

      const participants = [];
      if (roomParticipants) {
        try {
          const participantIds = JSON.parse(roomParticipants);
          const sessionKeysData = localStorage.getItem('roclaw.room.sessionKeys');
          const sessionKeysMap = sessionKeysData ? JSON.parse(sessionKeysData) : {};

          for (const connId of participantIds) {
            const conn = connections.find(c => c.id === connId);
            if (conn) {
              const mapping = sessionKeysMap[connId];
              const agentId = conn.sessionKey.split(':')[1];
              participants.push({
                connId: connId,
                agentId: agentId,
                sessionKey: conn.sessionKey,
                dynamicKey: mapping?.dynamic || this._generateLegacyDynamicKey(conn.sessionKey),
                name: conn.name
              });
            }
          }
        } catch (e) {
          console.warn('[Migration] Failed to parse participants:', e);
        }
      }

      sessions['room-public'] = {
        id: 'room-public',
        type: 'room',
        name: '公共聊天',
        normalizedRoomName: 'public',
        roomId: 'room:public',
        messages: roomMessages ? JSON.parse(roomMessages).messages : [],
        participants: participants,
        settings: roomSettings ? JSON.parse(roomSettings) : { aiInteractionEnabled: false },
        createdAt: Date.now()
      };
    }

    // 3. 保存新数据
    window.Storage.saveSessions(sessions);
    console.log('[Migration] Saved', Object.keys(sessions).length, 'sessions');

    // 4. 设置活跃会话
    const activeConnId = window.Storage.getActiveConnection();
    if (activeConnId && sessions[activeConnId]) {
      window.Storage.setActiveSession(activeConnId);
    } else if (sessions['room-public']) {
      window.Storage.setActiveSession('room-public');
    }

    // 5. 标记迁移完成
    localStorage.setItem('roclaw.migration.version', this.VERSION);
    console.log('[Migration] Migration completed successfully');
  },

  // 生成兼容旧版的动态 key
  _generateLegacyDynamicKey(originalKey) {
    const parts = originalKey.split(':');
    if (parts.length !== 3) return originalKey;
    const agentId = parts[1];
    return `agent:${agentId}:client:room:public:${Date.now()}`;
  },

  // 清理旧数据
  _cleanupOldData() {
    const oldKeys = [
      'openclaw.connections',
      'roclaw.room.messages',
      'roclaw.room.settings',
      'roclaw.room.sessionKeys',
      'roclaw.room.ai_interaction',
      'roclaw.room.conversation_loop'
    ];

    for (const key of oldKeys) {
      localStorage.removeItem(key);
    }
    console.log('[Migration] Cleaned up old data');
  }
};

window.DataMigration = DataMigration;

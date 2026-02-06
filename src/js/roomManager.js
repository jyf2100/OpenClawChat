// 房间会话类 - 管理单个房间的消息和状态
class RoomSession {
  constructor(roomConfig) {
    this.id = roomConfig.id;
    this.name = roomConfig.name;
    this.roomId = roomConfig.roomId;
    this.normalizedRoomName = roomConfig.normalizedRoomName;
    this.messages = roomConfig.messages || [];
    this.participants = [];
    this.settings = roomConfig.settings || {
      aiInteractionEnabled: false,
      conversationLoop: { enabled: false }
    };

    // 初始化参与者
    if (roomConfig.participants) {
      this.participants = roomConfig.participants;
    }

    // sessionKey 映射（用于会话隔离）
    // key: connId, value: { original, dynamic, timestamp }
    this.sessionKeyMap = new Map();

    // 对话循环状态
    this.conversationLoop = {
      enabled: false,           // 是否启用对话循环
      isActive: false,          // 是否正在进行中
      currentRound: 0,          // 当前轮数 (0-10)
      maxRounds: 10,           // 最大轮数
      participants: [],         // 参与 AI 的 ID 列表
      currentSpeakerIndex: 0,   // 当前发言者索引
      lastSpeakerId: null,      // 上一个发言的 AI ID
      startTime: null,          // 开始时间
      autoStop: false          // 自动停止标志
    };

    // 从现有参与者恢复 sessionKey 映射
    if (this.participants) {
      for (const p of this.participants) {
        if (p.sessionKey && p.dynamicKey) {
          this.sessionKeyMap.set(p.connId, {
            original: p.sessionKey,
            dynamic: p.dynamicKey,
            timestamp: Date.now()
          });
        }
      }
    }
  }

  // 初始化（用于加载历史数据）
  init() {
    this.loadMessages();
    this.loadSettings();
    this.loadSessionKeys();
  }

  // ========== 消息管理 ==========

  addMessage(message) {
    const msg = {
      id: 'room-msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      roomId: this.roomId,
      timestamp: Date.now(),
      ...message
    };
    this.messages.push(msg);
    this.saveMessages();
    return msg;
  }

  getMessages() {
    return [...this.messages];
  }

  getRecentMessages(limit = 20) {
    return this.messages.slice(-limit);
  }

  clearMessages() {
    this.messages = [];
    this.saveMessages();
  }

  loadMessages() {
    if (window.Storage) {
      const savedMessages = window.Storage.getSession(this.id)?.messages;
      if (savedMessages) {
        this.messages = savedMessages;
      }
    }
  }

  saveMessages() {
    if (window.Storage) {
      const session = window.Storage.getSession(this.id);
      if (session) {
        session.messages = this.messages;
        window.Storage.saveSession(session);
      }
    }
  }

  // ========== 参与者管理 ==========

  addParticipant(participant) {
    // 检查是否已存在
    if (this.participants.some(p => p.connId === participant.connId)) {
      return false;
    }
    this.participants.push(participant);

    // 更新 sessionKey 映射
    if (participant.sessionKey && participant.dynamicKey) {
      this.sessionKeyMap.set(participant.connId, {
        original: participant.sessionKey,
        dynamic: participant.dynamicKey,
        timestamp: Date.now()
      });
    }

    this._saveToStorage();
    return true;
  }

  removeParticipant(connId) {
    const index = this.participants.findIndex(p => p.connId === connId);
    if (index === -1) return false;

    this.participants.splice(index, 1);
    this.sessionKeyMap.delete(connId);
    this._saveToStorage();
    return true;
  }

  getParticipants() {
    return this.participants;
  }

  // ========== 设置管理 ==========

  toggleAIInteraction() {
    this.settings.aiInteractionEnabled = !this.settings.aiInteractionEnabled;
    this._saveToStorage();
    return this.settings.aiInteractionEnabled;
  }

  loadSettings() {
    if (window.Storage) {
      const session = window.Storage.getSession(this.id);
      if (session && session.settings) {
        this.settings = { ...this.settings, ...session.settings };
      }
    }
    this._loadLoopState();
  }

  // ========== SessionKey 管理（会话隔离）==========

  loadSessionKeys() {
    // 已从构造函数的参与者列表中恢复
    console.log('[RoomSession] 已加载 sessionKey 映射:', this.sessionKeyMap.size, '条');
  }

  saveSessionKeys() {
    this._saveToStorage();
  }

  generateDynamicSessionKey(originalSessionKey) {
    const parts = originalSessionKey.split(':');
    if (parts.length !== 3) {
      console.warn('[RoomSession] sessionKey 格式无效:', originalSessionKey);
      return originalSessionKey;
    }

    const [, appid] = parts;
    const newSessionId = Date.now().toString();
    return `${parts[0]}:${appid}:${newSessionId}`;
  }

  getDynamicSessionKey(connId) {
    const mapping = this.sessionKeyMap.get(connId);
    return mapping ? mapping.dynamic : null;
  }

  resetAllSessionKeys() {
    let count = 0;
    for (const participant of this.participants) {
      const mapping = this.sessionKeyMap.get(participant.connId);
      if (mapping) {
        const newDynamic = this.generateDynamicSessionKey(mapping.original);
        mapping.dynamic = newDynamic;
        mapping.timestamp = Date.now();
        participant.dynamicKey = newDynamic;
        count++;
      }
    }
    this._saveToStorage();
    console.log('[RoomSession] 已重置', count, '个会话密钥');
    return count;
  }

  getOriginalSessionKey(connId) {
    const mapping = this.sessionKeyMap.get(connId);
    return mapping ? mapping.original : null;
  }

  // ========== 对话循环功能 ==========

  startConversationLoop(initialMessage, participantIds) {
    if (!this.conversationLoop.enabled || this.conversationLoop.isActive) {
      console.log('[RoomSession] 无法启动循环: enabled=', this.conversationLoop.enabled, 'isActive=', this.conversationLoop.isActive);
      return false;
    }

    const participants = participantIds.length > 0
      ? participantIds
      : this.participants.map(p => p.connId);

    if (participants.length < 2) {
      console.log('[RoomSession] 参与者不足，需要至少 2 个，当前:', participants.length);
      return false;
    }

    console.log('[RoomSession] 启动对话循环，参与者:', participants);

    this.conversationLoop = {
      ...this.conversationLoop,
      isActive: true,
      currentRound: 1,
      participants,
      currentSpeakerIndex: 0,
      lastSpeakerId: null,
      startTime: Date.now()
    };

    this._saveLoopState();
    return true;
  }

  stopConversationLoop(reason = 'manual') {
    if (!this.conversationLoop.isActive) {
      console.log('[RoomSession] 循环未激活，无需停止');
      return false;
    }

    console.log('[RoomSession] 停止对话循环，原因:', reason);

    this.conversationLoop.isActive = false;
    this.conversationLoop.autoStop = reason !== 'manual';
    this._saveLoopState();
    return true;
  }

  getNextSpeaker() {
    if (!this.conversationLoop.isActive) {
      console.log('[RoomSession] 循环未激活，无法获取下一个发言者');
      return null;
    }

    const { participants, currentSpeakerIndex } = this.conversationLoop;
    const nextIndex = (currentSpeakerIndex + 1) % participants.length;

    console.log('[RoomSession] 当前索引:', currentSpeakerIndex, '下一个索引:', nextIndex);

    // 当回到第一个参与者时，轮数加 1
    if (nextIndex === 0) {
      this.conversationLoop.currentRound++;
      console.log('[RoomSession] 新轮数:', this.conversationLoop.currentRound);

      if (this.conversationLoop.currentRound > this.conversationLoop.maxRounds) {
        console.log('[RoomSession] 达到最大轮数，停止循环');
        this.stopConversationLoop('max_rounds');
        return null;
      }
    }

    this.conversationLoop.currentSpeakerIndex = nextIndex;
    this.conversationLoop.lastSpeakerId = participants[nextIndex];
    this._saveLoopState();

    const nextSpeaker = participants[nextIndex];
    console.log('[RoomSession] 下一个发言者:', nextSpeaker);
    return nextSpeaker;
  }

  shouldContinueLoop(currentSpeakerId, messageContent) {
    if (!this.conversationLoop.isActive) {
      console.log('[RoomSession] 循环未激活');
      return false;
    }

    if (this.conversationLoop.currentRound >= this.conversationLoop.maxRounds) {
      console.log('[RoomSession] 达到最大轮数，停止循环');
      this.stopConversationLoop('max_rounds');
      return false;
    }

    return true;
  }

  resetLoopState() {
    this.conversationLoop.isActive = false;
    this.conversationLoop.currentRound = 0;
    this.conversationLoop.currentSpeakerIndex = 0;
    this.conversationLoop.lastSpeakerId = null;
    this.conversationLoop.startTime = null;
    this.conversationLoop.autoStop = false;
    this._saveLoopState();
  }

  // ========== 上下文构建 ==========

  buildContextForConnection() {
    // 获取最近的房间消息
    const recentMessages = this.getRecentMessages(30);

    console.log('[AI Context] 构建上下文，消息数量:', recentMessages.length);

    // 构建上下文字符串
    const contextLines = [];

    contextLines.push('=== 公共聊天房间上下文 ===');
    contextLines.push('');

    for (const msg of recentMessages) {
      const sender = msg.senderName || '未知';
      const content = msg.content || '';

      if (msg.senderType === 'user') {
        contextLines.push(`${sender}: ${content}`);
      } else if (msg.senderType === 'ai' || msg.senderType === 'assistant') {
        contextLines.push(`${sender} (AI): ${content}`);
      }
    }

    contextLines.push('');
    contextLines.push('=== 上下文结束 ===');

    const context = contextLines.join('\n');
    console.log('[AI Context] 上下文内容:', context);

    return context;
  }

  // ========== 持久化方法 ==========

  _saveToStorage() {
    if (window.Storage) {
      const session = {
        id: this.id,
        type: 'room',
        name: this.name,
        roomId: this.roomId,
        normalizedRoomName: this.normalizedRoomName,
        messages: this.messages,
        participants: this.participants,
        settings: this.settings
      };
      window.Storage.saveSession(session);
    }
  }

  _saveLoopState() {
    try {
      const stateToSave = {
        enabled: this.conversationLoop.enabled,
        maxRounds: this.conversationLoop.maxRounds
      };
      localStorage.setItem('roclaw.room.conversation_loop', JSON.stringify(stateToSave));
      console.log('[RoomSession] 已保存循环状态:', stateToSave);
    } catch (error) {
      console.error('[RoomSession] 保存循环状态失败:', error);
    }
  }

  _loadLoopState() {
    try {
      const data = localStorage.getItem('roclaw.room.conversation_loop');
      if (data) {
        const parsed = JSON.parse(data);
        this.conversationLoop.enabled = parsed.enabled || false;
        this.conversationLoop.maxRounds = parsed.maxRounds || 10;
        this.conversationLoop.isActive = false;
        this.conversationLoop.currentRound = 0;
        console.log('[RoomSession] 已加载循环状态:', {
          enabled: this.conversationLoop.enabled,
          maxRounds: this.conversationLoop.maxRounds
        });
      }
    } catch (error) {
      console.error('[RoomSession] 加载循环状态失败:', error);
    }
  }
}

// 保留单例用于向后兼容（将从 SessionManager 管理）
const roomManager = new RoomSession({
  id: 'room-public',
  name: '公共聊天',
  roomId: 'room:public',
  normalizedRoomName: 'public',
  messages: [],
  settings: {}
});

// 导出类和单例
window.RoomSession = RoomSession;
window.roomManager = roomManager;

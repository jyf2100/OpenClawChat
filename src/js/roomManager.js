// 房间管理器 - 管理公共聊天房间的消息和状态
class RoomManager {
  constructor() {
    this.roomId = 'public-room';
    this.messages = [];
    this.aiInteractionEnabled = false;
    this.participantIds = new Set();  // 参与的连接 ID

    // 新增: 对话循环状态
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
  }

  // 初始化
  init() {
    this.loadMessages();
    this.loadSettings();
  }

  // 加载消息历史
  loadMessages() {
    if (window.Storage) {
      this.messages = window.Storage.getRoomMessages();
    } else {
      // 回退到直接使用 localStorage
      const data = localStorage.getItem('roclaw.room.messages');
      if (data) {
        try {
          const parsed = JSON.parse(data);
          this.messages = parsed.messages || [];
        } catch (error) {
          console.error('Failed to load room messages:', error);
          this.messages = [];
        }
      }
    }
  }

  // 保存消息
  saveMessages() {
    if (window.Storage) {
      window.Storage.saveRoomMessages(this.messages);
    } else {
      // 回退到直接使用 localStorage
      try {
        const data = {
          messages: this.messages.slice(-500),  // 限制消息数量
          updatedAt: Date.now()
        };
        localStorage.setItem('roclaw.room.messages', JSON.stringify(data));
      } catch (error) {
        console.error('Failed to save room messages:', error);
      }
    }
  }

  // 加载设置
  loadSettings() {
    if (window.Storage) {
      const settings = window.Storage.getRoomSettings();
      this.aiInteractionEnabled = settings.aiInteractionEnabled || false;
    } else {
      // 回退到直接使用 localStorage
      const enabled = localStorage.getItem('roclaw.room.ai_interaction');
      this.aiInteractionEnabled = enabled === 'true';
      console.log('[RoomManager] 从 localStorage 加载 AI 交互状态:', this.aiInteractionEnabled, '(原始值:', enabled, ')');
    }

    // 加载对话循环状态
    this._loadLoopState();
  }

  // 切换 AI 交互模式
  toggleAIInteraction() {
    const oldValue = this.aiInteractionEnabled;
    this.aiInteractionEnabled = !this.aiInteractionEnabled;
    console.log('[RoomManager] toggleAIInteraction:', oldValue, '->', this.aiInteractionEnabled);

    if (window.Storage) {
      const settings = window.Storage.getRoomSettings();
      settings.aiInteractionEnabled = this.aiInteractionEnabled;
      window.Storage.saveRoomSettings(settings);
    } else {
      // 回退到直接使用 localStorage
      localStorage.setItem('roclaw.room.ai_interaction', String(this.aiInteractionEnabled));
      console.log('[RoomManager] 已保存到 localStorage:', this.aiInteractionEnabled);
    }

    return this.aiInteractionEnabled;
  }

  // 添加消息到房间
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

  // 获取消息历史
  getMessages() {
    return [...this.messages];
  }

  // 获取最近的消息（用于构建 AI 上下文）
  getRecentMessages(limit = 20) {
    return this.messages.slice(-limit);
  }

  // 添加参与者
  addParticipant(connId) {
    this.participantIds.add(connId);
  }

  // 移除参与者
  removeParticipant(connId) {
    this.participantIds.delete(connId);
  }

  // 获取参与者列表
  getParticipants() {
    return Array.from(this.participantIds);
  }

  // 清空消息
  clearMessages() {
    this.messages = [];
    this.saveMessages();
  }

  // 为特定连接构建上下文
  buildContextForConnection(connId) {
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

  // ========== 对话循环功能 ==========

  // 启动对话循环
  startConversationLoop(initialMessage, participantIds) {
    if (!this.conversationLoop.enabled || this.conversationLoop.isActive) {
      console.log('[RoomManager] 无法启动循环: enabled=', this.conversationLoop.enabled, 'isActive=', this.conversationLoop.isActive);
      return false;
    }

    const participants = participantIds.length > 0
      ? participantIds
      : Array.from(this.participantIds);

    if (participants.length < 2) {
      console.log('[RoomManager] 参与者不足，需要至少 2 个，当前:', participants.length);
      return false;
    }

    console.log('[RoomManager] 启动对话循环，参与者:', participants);

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

  // 停止对话循环
  stopConversationLoop(reason = 'manual') {
    if (!this.conversationLoop.isActive) {
      console.log('[RoomManager] 循环未激活，无需停止');
      return false;
    }

    console.log('[RoomManager] 停止对话循环，原因:', reason);

    this.conversationLoop.isActive = false;
    this.conversationLoop.autoStop = reason !== 'manual';
    this._saveLoopState();
    return true;
  }

  // 获取下一个发言者
  getNextSpeaker() {
    if (!this.conversationLoop.isActive) {
      console.log('[RoomManager] 循环未激活，无法获取下一个发言者');
      return null;
    }

    const { participants, currentSpeakerIndex } = this.conversationLoop;
    const nextIndex = (currentSpeakerIndex + 1) % participants.length;

    console.log('[RoomManager] 当前索引:', currentSpeakerIndex, '下一个索引:', nextIndex);

    // 当回到第一个参与者时，轮数加 1
    if (nextIndex === 0) {
      this.conversationLoop.currentRound++;
      console.log('[RoomManager] 新轮数:', this.conversationLoop.currentRound);

      if (this.conversationLoop.currentRound > this.conversationLoop.maxRounds) {
        console.log('[RoomManager] 达到最大轮数，停止循环');
        this.stopConversationLoop('max_rounds');
        return null;
      }
    }

    this.conversationLoop.currentSpeakerIndex = nextIndex;
    this.conversationLoop.lastSpeakerId = participants[nextIndex];
    this._saveLoopState();

    const nextSpeaker = participants[nextIndex];
    console.log('[RoomManager] 下一个发言者:', nextSpeaker);
    return nextSpeaker;
  }

  // 检查是否应该继续循环
  shouldContinueLoop(currentSpeakerId, messageContent) {
    if (!this.conversationLoop.isActive) {
      console.log('[RoomManager] 循环未激活');
      return false;
    }

    if (this.conversationLoop.currentRound >= this.conversationLoop.maxRounds) {
      console.log('[RoomManager] 达到最大轮数，停止循环');
      this.stopConversationLoop('max_rounds');
      return false;
    }

    return true;
  }

  // 重置循环状态（用于错误情况）
  resetLoopState() {
    this.conversationLoop.isActive = false;
    this.conversationLoop.currentRound = 0;
    this.conversationLoop.currentSpeakerIndex = 0;
    this.conversationLoop.lastSpeakerId = null;
    this.conversationLoop.startTime = null;
    this.conversationLoop.autoStop = false;
    this._saveLoopState();
  }

  // ========== 持久化方法 ==========

  // 保存循环状态到 localStorage
  _saveLoopState() {
    try {
      const stateToSave = {
        enabled: this.conversationLoop.enabled,
        // 不保存 isActive，刷新页面后重置为 false
        maxRounds: this.conversationLoop.maxRounds
      };
      localStorage.setItem('roclaw.room.conversation_loop', JSON.stringify(stateToSave));
      console.log('[RoomManager] 已保存循环状态:', stateToSave);
    } catch (error) {
      console.error('[RoomManager] 保存循环状态失败:', error);
    }
  }

  // 从 localStorage 加载循环状态
  _loadLoopState() {
    try {
      const data = localStorage.getItem('roclaw.room.conversation_loop');
      if (data) {
        const parsed = JSON.parse(data);
        this.conversationLoop.enabled = parsed.enabled || false;
        this.conversationLoop.maxRounds = parsed.maxRounds || 10;
        // 重置活动状态，刷新页面后不自动继续
        this.conversationLoop.isActive = false;
        this.conversationLoop.currentRound = 0;
        console.log('[RoomManager] 已加载循环状态:', {
          enabled: this.conversationLoop.enabled,
          maxRounds: this.conversationLoop.maxRounds
        });
      }
    } catch (error) {
      console.error('[RoomManager] 加载循环状态失败:', error);
    }
  }
}

// 导出到全局
window.RoomManager = RoomManager;

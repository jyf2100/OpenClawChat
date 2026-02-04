// 房间管理器 - 管理公共聊天房间的消息和状态
class RoomManager {
  constructor() {
    this.roomId = 'public-room';
    this.messages = [];
    this.aiInteractionEnabled = false;
    this.participantIds = new Set();  // 参与的连接 ID
  }

  // 初始化
  init() {
    this.loadMessages();
    this.loadSettings();
  }

  // 加载消息历史
  loadMessages() {
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

  // 保存消息
  saveMessages() {
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

  // 加载设置
  loadSettings() {
    const enabled = localStorage.getItem('roclaw.room.ai_interaction');
    this.aiInteractionEnabled = enabled === 'true';
  }

  // 切换 AI 交互模式
  toggleAIInteraction() {
    this.aiInteractionEnabled = !this.aiInteractionEnabled;
    localStorage.setItem('roclaw.room.ai_interaction', String(this.aiInteractionEnabled));
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
}

// 导出到全局
window.RoomManager = RoomManager;

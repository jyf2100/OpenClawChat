// 消息路由器 - 处理消息路由和 @提及解析
class MessageRouter {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }

  // 解析 @提及
  parseMentions(text) {
    const mentionPattern = /@(\S+)/g;
    const mentions = [];
    let cleanText = text;
    let match;

    while ((match = mentionPattern.exec(text)) !== null) {
      const mentionName = match[1];
      // 查找匹配的连接
      const conn = this.connectionManager.connections.find(c =>
        c.name === mentionName || c.id === mentionName
      );
      if (conn) {
        mentions.push(conn.id);
      }
    }

    // 移除 @提及，得到纯净文本
    cleanText = text.replace(/@\S+/g, '').trim();

    return {
      cleanText,
      mentionedIds: mentions
    };
  }

  // 路由消息到目标连接
  async routeMessage(message, options = {}) {
    const { mentions = [], forceReconnect = false, includeContext = false } = options;

    let targets;

    if (mentions.length > 0) {
      targets = this.connectionManager.connections.filter(c =>
        mentions.includes(c.id)
      );
    } else {
      targets = this.connectionManager.getParticipants();
    }

    if (targets.length === 0) {
      throw new Error('没有可用的目标连接');
    }

    const results = [];

    for (const conn of targets) {
      try {
        if (mentions.length > 0 && forceReconnect) {
          const state = this.connectionManager.connectionStates.get(conn.id);
          if (state?.status !== 'connected') {
            console.log(`正在重连 "${conn.name}"...`);
            await this.connectionManager.connect(conn.id);
          }
        }

        await this._sendToConnection(conn, message, { includeContext });
        results.push({ success: true, connId: conn.id, connName: conn.name });
      } catch (error) {
        results.push({ success: false, connId: conn.id, connName: conn.name, error: error.message });
      }
    }

    return results;
  }

  // 发送消息到单个连接
  async _sendToConnection(conn, message, options = {}) {
    const state = this.connectionManager.connectionStates.get(conn.id);
    if (!state || !state.ws) {
      throw new Error('连接未建立');
    }

    const requestId = this._generateRequestId();

    // 如果启用了 AI 交互模式，添加上下文
    let finalMessage = message;
    if (options.includeContext && window.roomManager) {
      const context = window.roomManager.buildContextForConnection(conn.id);
      finalMessage = `${context}\n\n当前问题: ${message}`;
    }

    return new Promise((resolve, reject) => {
      state.pending.set(requestId, { resolve, reject });

      state.ws.send(JSON.stringify({
        type: 'req',
        id: requestId,
        method: 'chat.send',
        params: {
          sessionKey: conn.sessionKey,
          message: finalMessage,
          deliver: false,
          idempotencyKey: requestId
        }
      }));
    });
  }

  _generateRequestId() {
    return 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
}

window.MessageRouter = MessageRouter;

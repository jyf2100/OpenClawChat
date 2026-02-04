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

    console.log('[MessageRouter] routeMessage - 开始路由消息');
    console.log('[MessageRouter] - 所有连接:', this.connectionManager.connections.map(c => ({ name: c.name, id: c.id })));
    console.log('[MessageRouter] - mentions:', mentions);
    console.log('[MessageRouter] - includeContext:', includeContext);

    let targets;

    if (mentions.length > 0) {
      targets = this.connectionManager.connections.filter(c =>
        mentions.includes(c.id)
      );
      console.log('[MessageRouter] - 目标连接(@mentions):', targets.map(t => t.name));
    } else {
      targets = this.connectionManager.getParticipants();
      console.log('[MessageRouter] - 目标连接(所有参与者):', targets.map(t => t.name));

      // 如果没有已连接的参与者，尝试使用所有连接（不管连接状态）
      if (targets.length === 0) {
        console.log('[MessageRouter] 没有已连接的参与者，尝试使用所有连接');
        targets = this.connectionManager.connections;
        console.log('[MessageRouter] - 使用所有连接:', targets.map(t => t.name));
      }
    }

    if (targets.length === 0) {
      throw new Error('没有可用的目标连接');
    }

    const results = [];

    for (const conn of targets) {
      try {
        const status = this.connectionManager.getStatus(conn.id);
        console.log('[MessageRouter] 处理连接:', conn.name, '状态:', status);

        // 如果连接未断开且需要重连，先重连
        if (mentions.length > 0 && forceReconnect && status !== 'connected') {
          console.log(`正在重连 "${conn.name}"...`);
          await this.connectionManager.connect(conn.id);
        }

        // 只有连接状态是 connected 时才发送
        if (status === 'connected') {
          await this._sendToConnection(conn, message, { includeContext });
          results.push({ success: true, connId: conn.id, connName: conn.name });
          console.log('[MessageRouter] 连接', conn.name, '发送成功');
        } else {
          console.warn('[MessageRouter] 连接', conn.name, '未连接，跳过');
          results.push({ success: false, connId: conn.id, connName: conn.name, error: '未连接' });
        }
      } catch (error) {
        console.error('[MessageRouter] 连接', conn.name, '发送失败:', error);
        results.push({ success: false, connId: conn.id, connName: conn.name, error: error.message });
      }
    }

    console.log('[MessageRouter] 路由完成，结果:', results);
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
      console.log('[MessageRouter] AI 交互模式已启用，为连接', conn.name, '构建上下文');
      const context = window.roomManager.buildContextForConnection(conn.id);
      finalMessage = `${context}\n\n当前问题: ${message}`;
      console.log('[MessageRouter] 最终消息长度:', finalMessage.length);
    } else {
      console.log('[MessageRouter] AI 交互模式未启用，直接发送原始消息');
    }

    return new Promise((resolve, reject) => {
      // 设置超时（5秒后如果没收到响应就算成功）
      const timeout = setTimeout(() => {
        state.pending.delete(requestId);
        resolve(); // 消息已发送，AI 回复会通过 chat 事件异步处理
      }, 5000);

      // 存储 resolve 函数，收到响应后清除超时
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
            message: finalMessage,
            deliver: false,
            idempotencyKey: requestId
          }
        });
        console.log('[MessageRouter] 发送消息到', conn.name, ':', payload.substring(0, 200) + '...');
        state.ws.send(payload);
        console.log('[MessageRouter] 消息已发送');
      } catch (error) {
        clearTimeout(timeout);
        state.pending.delete(requestId);
        reject(error);
      }
    });
  }

  _generateRequestId() {
    return 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
}

window.MessageRouter = MessageRouter;

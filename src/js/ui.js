// UI 操作模块 - 处理连接列表、弹窗和交互

const UIManager = {
  // ========== 菜单配置 ==========
  // 右键菜单配置：定义每种类型支持的操作
  MENU_CONFIG: {
    connection: {
      actions: ['edit', 'copy', 'reconnect', 'delete'],
      labels: {
        edit: '✏️ 编辑',
        copy: '📋 复制',
        reconnect: '🔄 重新连接',
        delete: '🗑️ 删除'
      }
    },
    room: {
      actions: ['edit', 'copy', 'delete'],
      labels: {
        edit: '✏️ 编辑',
        copy: '📋 复制',
        delete: '🗑️ 删除'
      }
    }
  },

  // ========== 初始化 ==========

  init() {
    this.renderConnectionList();  // 原有：连接列表
    this.renderRoomList();         // 新增：房间列表
    this.initRoomSwitching();
  },

  // ========== 连接列表渲染 ==========

  // 渲染连接列表（原有方法，保持不变）
  renderConnectionList() {
    if (!window.connectionManager) return;

    const container = document.getElementById('connList');
    if (!container) return;

    const connections = window.connectionManager.getAllConnections();
    const activeId = window.connectionManager.activeConnectionId;

    container.innerHTML = connections.map(conn => {
      const isActive = conn.id === activeId;
      const unread = window.connectionManager.unreadCounts.get(conn.id) || 0;

      return `
        <div class="conn-item ${isActive ? 'active' : ''}" data-id="${conn.id}">
          <span class="conn-status ${conn.status}"></span>
          <span class="conn-name">${this._escapeHtml(conn.name)}</span>
          ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        </div>
      `;
    }).join('');

    // 绑定点击事件
    this._bindConnectionEvents();
  },

  _bindConnectionEvents() {
    const container = document.getElementById('connList');
    if (!container) return;

    container.querySelectorAll('.conn-item').forEach(item => {
      // 移除旧的事件监听器（如果存在）
      if (item._connClickHandler) {
        item.removeEventListener('click', item._connClickHandler);
      }

      // 左键点击：切换连接
      item._connClickHandler = (e) => {
        const connId = e.currentTarget.dataset.id;
        window.connectionManager.switchConnection(connId);
      };
      item.addEventListener('click', item._connClickHandler);

      // 右键菜单
      if (item._connContextMenuHandler) {
        item.removeEventListener('contextmenu', item._connContextMenuHandler);
      }

      item._connContextMenuHandler = (e) => {
        e.preventDefault();
        const connId = e.currentTarget.dataset.id;
        this._showContextMenu(e, connId, 'connection');
      };
      item.addEventListener('contextmenu', item._connContextMenuHandler);
    });
  },

  // ========== 房间列表渲染 ==========

  // 渲染房间列表
  renderRoomList() {
    if (!window.sessionManager) return;

    const container = document.getElementById('roomList');
    if (!container) return;

    const rooms = window.sessionManager.getAllRooms();
    const activeId = window.sessionManager.activeRoomId;

    if (rooms.length === 0) {
      container.innerHTML = '<div class="room-empty-state">暂无房间</div>';
      return;
    }

    container.innerHTML = rooms.map(room => {
      const isActive = room.id === activeId;
      const participantCount = room.participants?.length || 0;

      return `
        <div class="room-item ${isActive ? 'active' : ''}" data-id="${room.id}">
          <span class="room-icon">🏠</span>
          <span class="room-name">${this._escapeHtml(room.name)}</span>
          <span class="participant-count">(${participantCount})</span>
        </div>
      `;
    }).join('');

    this._bindRoomEvents();
  },

  // 绑定房间事件
  _bindRoomEvents() {
    const container = document.getElementById('roomList');
    if (!container) return;

    container.querySelectorAll('.room-item').forEach(item => {
      // 移除旧的事件监听器（如果存在）
      if (item._roomClickHandler) {
        item.removeEventListener('click', item._roomClickHandler);
      }

      // 创建并保存新的处理器引用 - 左键点击
      item._roomClickHandler = (e) => {
        const roomId = e.currentTarget.dataset.id;
        window.sessionManager.switchRoom(roomId);
        this.renderRoomList();
        this._handleRoomSwitch(roomId);
      };
      item.addEventListener('click', item._roomClickHandler);

      // 右键菜单
      if (item._roomContextMenuHandler) {
        item.removeEventListener('contextmenu', item._roomContextMenuHandler);
      }

      item._roomContextMenuHandler = (e) => {
        e.preventDefault();
        const roomId = e.currentTarget.dataset.id;
        this._showContextMenu(e, roomId, 'room');
      };
      item.addEventListener('contextmenu', item._roomContextMenuHandler);
    });
  },

  // 处理房间切换
  _handleRoomSwitch(roomId) {
    const session = window.sessionManager.getSession(roomId);
    if (!session) return;

    // 显示房间状态栏
    const roomStatusBar = document.getElementById('roomStatusBar');
    if (roomStatusBar) {
      roomStatusBar.style.display = 'flex';
    }

    // 更新标题为房间名称
    const titleEl = document.getElementById('currentConnTitle');
    if (titleEl) {
      titleEl.textContent = session.name;
    }

    // 更新全局状态
    if (window.state) {
      window.state.isInRoomMode = true;
      window.state.currentSessionId = roomId;
      window.state.currentRoomId = roomId;
      // 清空当前消息状态
      window.state.messages = session.messages || [];
      window.state.streamText = null;
      window.state.runId = null;
      window.state.streamStartedAt = null;
    }

    // 加载并渲染房间消息
    this._renderRoomSessionMessages(session);

    // 更新参与者显示（包含下拉菜单和按钮绑定）
    this._updateParticipantsDisplay();

    console.log('[UI] Switched to room:', roomId, 'with', (session.messages || []).length, 'messages');
  },

  // 渲染房间会话消息
  _renderRoomSessionMessages(session) {
    const chatThread = document.getElementById('chatThread');
    if (!chatThread) return;

    const messages = session.messages || [];

    chatThread.innerHTML = '';

    for (const msg of messages) {
      this._renderRoomSessionMessage(msg);
    }

    // 滚动到底部
    chatThread.scrollTop = chatThread.scrollHeight;
  },

  // 渲染单条房间消息
  _renderRoomSessionMessage(msg) {
    const chatThread = document.getElementById('chatThread');
    if (!chatThread) return;

    const line = document.createElement('div');
    line.className = `chat-line ${msg.senderType === 'user' ? 'user' : 'assistant'}`;
    line.id = msg.id || `msg-${Date.now()}-${Math.random()}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = msg.senderName || 'AI';

    const content = document.createElement('div');
    content.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (msg.senderType === 'ai' || msg.senderType === 'assistant' || msg.senderType === 'system') {
      const textDiv = document.createElement('div');
      textDiv.className = 'text markdown-content';

      if (msg.content) {
        const html = marked.parse(msg.content);
        textDiv.innerHTML = html;

        textDiv.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      }
      bubble.appendChild(textDiv);
    } else {
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = msg.content || '';
      bubble.appendChild(text);
    }

    content.appendChild(bubble);

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = formatTime(msg.timestamp || Date.now());
    content.appendChild(meta);

    line.appendChild(avatar);
    line.appendChild(content);
    chatThread.appendChild(line);
  },

  // ========== 弹窗操作 ==========

  showAddConnectionModal() {
    this._showModal('添加连接', null);
  },

  showEditConnectionModal(connId) {
    const conn = window.connectionManager.getConnection(connId);
    if (!conn) return;

    this._showModal('编辑连接', conn);
  },

  showCreateRoomModal() {
    const modal = document.getElementById('createRoomModal');
    const nameInput = document.getElementById('roomNameInput');
    const participantSelector = document.getElementById('participantSelector');

    if (!modal) return;

    // 清空输入
    nameInput.value = '';

    // 渲染可用连接列表 - 直接从 ConnectionManager 获取所有连接
    const connections = window.connectionManager?.getAllConnections() || [];

    participantSelector.innerHTML = connections.map(conn => `
      <label class="participant-option">
        <input type="checkbox" value="${conn.id}" class="participant-checkbox">
        <span>${this._escapeHtml(conn.name)}</span>
      </label>
    `).join('');

    // 显示模态框
    modal.style.display = 'flex';

    // 绑定事件
    this._bindCreateRoomModalEvents();
  },

  _bindCreateRoomModalEvents() {
    const modal = document.getElementById('createRoomModal');
    const confirmBtn = document.getElementById('createRoomConfirm');
    const cancelBtn = document.getElementById('createRoomCancel');
    const closeBtn = document.getElementById('createRoomModalClose');

    // 确认创建
    confirmBtn.onclick = () => {
      this._createRoom();
    };

    // 取消/关闭
    const closeHandler = () => {
      modal.style.display = 'none';
    };

    cancelBtn.onclick = closeHandler;
    closeBtn.onclick = closeHandler;
  },

  _createRoom() {
    const nameInput = document.getElementById('roomNameInput');
    const name = nameInput.value.trim();

    // 使用统一的验证方法
    const validation = window.sessionManager.validateSessionName(name);
    if (!validation.valid) {
      this._showHint(validation.errors[0]);
      return;
    }

    // 获取选中的参与者
    const selectedConnIds = [];
    document.querySelectorAll('.participant-checkbox:checked').forEach(checkbox => {
      selectedConnIds.push(checkbox.value);
    });

    // 创建房间
    const room = window.sessionManager.createSession('room', {
      name: name,
      participantIds: selectedConnIds
    });

    console.log('[UI] Created room:', room);

    // 更新 UI
    this.renderRoomList();

    // 关闭模态框
    document.getElementById('createRoomModal').style.display = 'none';

    this._showHint(`已创建房间：${name}`);

    // 自动切换到新房间
    window.sessionManager.switchRoom(room.id);
    this._handleRoomSwitch(room.id);
  },

  // ========== 房间编辑 ==========
  _showEditRoomModal(roomId) {
    const session = window.sessionManager.getSession(roomId);
    if (!session || session.type !== 'room') {
      console.warn('[UI] Room not found or not a room:', roomId);
      return;
    }

    const modal = document.getElementById('editRoomModal');
    const nameInput = document.getElementById('editRoomNameInput');

    if (!modal) {
      console.error('[UI] editRoomModal not found');
      return;
    }

    // 填充当前名称
    nameInput.value = session.name;

    // 显示模态框
    modal.style.display = 'flex';

    // 绑定事件
    this._bindEditRoomModalEvents(roomId);
  },

  _bindEditRoomModalEvents(roomId) {
    const modal = document.getElementById('editRoomModal');
    const confirmBtn = document.getElementById('editRoomConfirm');
    const cancelBtn = document.getElementById('editRoomCancel');
    const closeBtn = document.getElementById('editRoomModalClose');

    // 克隆替换以清除旧事件监听器
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newCloseBtn = closeBtn.cloneNode(true);

    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    // 保存按钮
    newConfirmBtn.addEventListener('click', () => {
      this._saveRoom(roomId);
    });

    // 取消/关闭按钮
    const closeHandler = () => {
      modal.style.display = 'none';
    };

    newCancelBtn.addEventListener('click', closeHandler);
    newCloseBtn.addEventListener('click', closeHandler);
  },

  _saveRoom(roomId) {
    const nameInput = document.getElementById('editRoomNameInput');
    const name = nameInput.value.trim();

    // 使用 SessionManager 的验证方法
    const validation = window.sessionManager.validateSessionName(name);

    if (!validation.valid) {
      this._showHint(validation.errors[0]);
      return;
    }

    // 更新房间
    const success = window.sessionManager.updateSession(roomId, { name });

    if (!success) {
      this._showHint('更新房间失败');
      return;
    }

    // 更新 UI
    this.renderRoomList();

    // 如果当前房间被激活，更新标题
    if (window.sessionManager.activeRoomId === roomId) {
      const titleEl = document.getElementById('currentConnTitle');
      if (titleEl) titleEl.textContent = name;
    }

    // 关闭模态框
    document.getElementById('editRoomModal').style.display = 'none';

    this._showHint(`已更新房间名称：${name}`);
  },

  // ========== 房间复制 ==========
  _copyRoom(roomId) {
    const session = window.sessionManager.getSession(roomId);
    if (!session || session.type !== 'room') {
      console.warn('[UI] Room not found or not a room:', roomId);
      return;
    }

    // 使用 SessionManager 的复制方法（业务逻辑已迁移）
    const newRoom = window.sessionManager.copySession(roomId);

    if (!newRoom) {
      this._showHint('复制房间失败');
      return;
    }

    this.renderRoomList();
    this._showHint(`已复制房间：${newRoom.name}`);
  },

  // ========== 房间删除 ==========
  _deleteRoom(roomId) {
    const session = window.sessionManager.getSession(roomId);
    if (!session || session.type !== 'room') {
      console.warn('[UI] Room not found or not a room:', roomId);
      return;
    }

    this._showDeleteRoomModal(roomId, session.name);
  },

  _showDeleteRoomModal(roomId, roomName) {
    const modal = document.getElementById('deleteRoomModal');
    const nameEl = document.getElementById('deleteRoomName');
    const confirmBtn = document.getElementById('deleteRoomModalConfirm');
    const cancelBtn = document.getElementById('deleteRoomModalCancel');
    const closeBtn = document.getElementById('deleteRoomModalClose');

    if (!modal) {
      console.error('[UI] deleteRoomModal not found');
      return;
    }

    // 设置名称
    nameEl.textContent = roomName;

    // 显示弹窗
    modal.style.display = 'flex';

    // 绑定事件 - 克隆替换以清除旧事件监听器
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newCloseBtn = closeBtn.cloneNode(true);

    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    // 确认删除
    newConfirmBtn.addEventListener('click', () => {
      try {
        window.sessionManager.deleteSession(roomId);
        this.renderRoomList();
        this._showHint(`已删除房间：${roomName}`);
      } catch (error) {
        this._showHint('删除失败：' + error.message);
      }
      modal.style.display = 'none';
    });

    // 取消删除
    const closeHandler = () => {
      modal.style.display = 'none';
    };

    newCancelBtn.addEventListener('click', closeHandler);
    newCloseBtn.addEventListener('click', closeHandler);
  },

  _showModal(title, connection) {
    const modal = document.getElementById('connModal');
    const titleEl = document.getElementById('modalTitle');
    const errorsEl = document.getElementById('connErrors');

    if (!modal) return;

    // 设置标题
    titleEl.textContent = title;

    // 清空或填充表单
    if (connection) {
      document.getElementById('connName').value = connection.name;
      document.getElementById('connGateway').value = connection.gatewayUrl;
      document.getElementById('connToken').value = connection.token || '';
      document.getElementById('connSession').value = connection.sessionKey;
    } else {
      document.getElementById('connName').value = '';
      document.getElementById('connGateway').value = 'ws://';
      document.getElementById('connToken').value = '';
      document.getElementById('connSession').value = 'agent:main:main';
    }

    // 隐藏错误提示
    errorsEl.classList.remove('show');
    errorsEl.innerHTML = '';

    // 显示弹窗
    modal.style.display = 'flex';

    // 绑定事件
    this._bindModalEvents(connection ? connection.id : null);
  },

  hideModal() {
    const modal = document.getElementById('connModal');
    if (modal) {
      modal.style.display = 'none';
    }
  },

  _bindModalEvents(connId) {
    const saveBtn = document.getElementById('modalSave');
    const cancelBtn = document.getElementById('modalCancel');
    const closeBtn = document.getElementById('modalClose');

    // 移除旧的事件监听器
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newCloseBtn = closeBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    // 保存按钮
    newSaveBtn.addEventListener('click', () => {
      this._saveConnection(connId);
    });

    // 取消按钮
    newCancelBtn.addEventListener('click', () => {
      this.hideModal();
    });

    // 关闭按钮
    newCloseBtn.addEventListener('click', () => {
      this.hideModal();
    });
  },

  _saveConnection(connId) {
    const name = document.getElementById('connName').value.trim();
    const gatewayUrl = document.getElementById('connGateway').value.trim();
    const token = document.getElementById('connToken').value.trim();
    const sessionKey = document.getElementById('connSession').value.trim();

    // 验证
    const validation = window.connectionManager._validateConnection({
      name, gatewayUrl, token, sessionKey
    });

    if (!validation.valid) {
      const errorsEl = document.getElementById('connErrors');
      errorsEl.innerHTML = '<ul>' + validation.errors.map(e => `<li>${this._escapeHtml(e)}</li>`).join('') + '</ul>';
      errorsEl.classList.add('show');
      return;
    }

    try {
      if (connId) {
        // 编辑现有连接 - 更新 ConnectionManager 和 SessionManager
        window.connectionManager.updateConnection(connId, { name, gatewayUrl, token, sessionKey });
        // 同步所有字段到 SessionManager 进行持久化
        window.sessionManager.updateSession(connId, { name, gatewayUrl, token, sessionKey });
      } else {
        // 添加新连接 - 通过 SessionManager 创建并持久化
        const newSession = window.sessionManager.createSession('connection', {
          name, gatewayUrl, token, sessionKey
        });
        // 自动连接到新连接
        window.connectionManager.switchConnection(newSession.id);
      }

      this.hideModal();
      this.renderConnectionList();

    } catch (error) {
      const errorsEl = document.getElementById('connErrors');
      errorsEl.innerHTML = `<ul><li>${this._escapeHtml(error.message)}</li></ul>`;
      errorsEl.classList.add('show');
    }
  },

  // ========== 右键菜单 ==========

  _showContextMenu(event, id, type = 'connection') {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;

    // 获取配置
    const config = this.MENU_CONFIG[type];
    if (!config) {
      console.warn('[UI] Unknown menu type:', type);
      return;
    }

    // 先显示菜单以获取其尺寸
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';

    const menuRect = menu.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    // 计算位置，确保不超出窗口边界
    let left = event.pageX;
    let top = event.pageY;

    // 检查右边界
    if (left + menuRect.width > windowWidth) {
      left = windowWidth - menuRect.width - 8;
    }

    // 检查下边界 - 如果超出，向上显示
    if (top + menuRect.height > windowHeight) {
      top = windowHeight - menuRect.height - 8;
    }

    // 应用位置
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible';

    // 保存类型和 ID 到菜单元素上
    menu.dataset.targetType = type;
    menu.dataset.targetId = id;

    // 清除旧的事件监听器
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      if (item._menuHandler) {
        item.removeEventListener('click', item._menuHandler);
      }
    });

    // 根据配置显示/隐藏菜单项
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      const action = item.dataset.action;
      // 如果操作不在配置中，隐藏该项
      if (!config.actions.includes(action)) {
        item.style.display = 'none';
      } else {
        item.style.display = '';
      }
    });

    // 绑定菜单事件
    const self = this;
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      const action = item.dataset.action;

      // 只为配置中的操作绑定事件
      if (!config.actions.includes(action)) return;

      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = menu.dataset.targetId;
        const targetType = menu.dataset.targetType;
        self._handleContextMenuAction(action, targetId, targetType);
        menu.style.display = 'none';
      };
      item._menuHandler = handler;
      item.addEventListener('click', handler);
    });

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.style.display = 'none';
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  },

  _handleContextMenuAction(action, id, type) {
    // 使用配置化的处理方法映射
    const actionHandlers = {
      connection: {
        edit: (connId) => this.showEditConnectionModal(connId),
        copy: (connId) => this._copyConnection(connId),
        reconnect: (connId) => window.connectionManager.reconnect(connId),
        delete: (connId) => this._deleteConnection(connId)
      },
      room: {
        edit: (roomId) => this._showEditRoomModal(roomId),
        copy: (roomId) => this._copyRoom(roomId),
        delete: (roomId) => this._deleteRoom(roomId)
      }
    };

    const handlers = actionHandlers[type];
    if (handlers && handlers[action]) {
      handlers[action](id);
    } else {
      console.warn('[UI] Unknown action:', action, 'for type:', type);
    }
  },

  _copyConnection(connId) {
    const conn = window.connectionManager.getConnection(connId);
    if (!conn) return;

    try {
      // 通过 SessionManager 创建并持久化
      const newSession = window.sessionManager.createSession('connection', {
        name: conn.name + ' (副本)',
        gatewayUrl: conn.gatewayUrl,
        token: conn.token,
        sessionKey: conn.sessionKey
      });

      this.renderConnectionList();
      this._showHint(`已复制连接：${newSession.name}`);
    } catch (error) {
      this._showHint(`复制失败：${error.message}`);
    }
  },

  _deleteConnection(connId) {
    const conn = window.connectionManager.getConnection(connId);
    if (!conn) return;

    // 显示删除确认弹窗
    this._showDeleteModal(connId, conn.name);
  },

  _showDeleteModal(connId, connName) {
    const modal = document.getElementById('deleteModal');
    const nameEl = document.getElementById('deleteConnName');
    const confirmBtn = document.getElementById('deleteModalConfirm');
    const cancelBtn = document.getElementById('deleteModalCancel');
    const closeBtn = document.getElementById('deleteModalClose');

    if (!modal) return;

    // 设置连接名称
    nameEl.textContent = connName;

    // 显示弹窗
    modal.style.display = 'flex';

    // 绑定事件
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newCloseBtn = closeBtn.cloneNode(true);

    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    // 确认删除
    newConfirmBtn.addEventListener('click', () => {
      try {
        // 从 SessionManager 删除（会同时从 ConnectionManager 删除并持久化）
        window.sessionManager.deleteSession(connId);
        this.renderConnectionList();
      } catch (error) {
        alert('删除失败：' + error.message);
      }
      modal.style.display = 'none';
    });

    // 取消删除
    newCancelBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // 关闭按钮
    newCloseBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  },

  // 显示重置会话确认模态框
  _showResetSessionsModal() {
    const modal = document.getElementById('resetSessionsModal');
    const confirmBtn = document.getElementById('resetSessionsModalConfirm');
    const cancelBtn = document.getElementById('resetSessionsModalCancel');
    const closeBtn = document.getElementById('resetSessionsModalClose');

    if (!modal) return;

    // 显示弹窗
    modal.style.display = 'flex';

    // 绑定事件
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newCloseBtn = closeBtn.cloneNode(true);

    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    // 确认重置
    newConfirmBtn.addEventListener('click', () => {
      try {
        // 重置所有会话密钥
        const count = window.roomManager.resetAllSessionKeys();

        // 清空消息记录
        window.roomManager.clearMessages();

        // 重新渲染消息列表
        this._renderRoomMessages();

        this._showHint(`已重置 ${count} 个 AI 的会话并清空消息`, 3000);
      } catch (error) {
        this._showHint('重置失败：' + error.message, 3000);
      }
      modal.style.display = 'none';
    });

    // 取消重置
    newCancelBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // 关闭按钮
    newCloseBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  },

  // ========== 状态更新 ==========

  updateConnectionStatus(connId, status) {
    this.renderConnectionList();
  },

  updateUnreadCount(connId, count) {
    this.renderConnectionList();
  },

  // ========== 房间管理 ==========

  initRoomSwitching() {
    const roomBtn = document.getElementById('publicRoomBtn');
    if (!roomBtn) return;

    roomBtn.addEventListener('click', () => {
      this.switchToRoom('public');
    });
  },

  switchToRoom(roomId) {
    // 移除所有激活状态
    document.querySelectorAll('.conn-item.active, .room-item.active').forEach(el => {
      el.classList.remove('active');
    });

    const roomStatusBar = document.getElementById('roomStatusBar');

    if (roomId === 'public') {
      const roomBtn = document.getElementById('publicRoomBtn');
      if (roomBtn) roomBtn.classList.add('active');

      // 显示房间状态栏
      if (roomStatusBar) roomStatusBar.style.display = 'flex';

      // 显示公共聊天界面
      this._showPublicChatRoom();
    } else {
      // 隐藏房间状态栏
      if (roomStatusBar) roomStatusBar.style.display = 'none';

      // 切换回普通连接 - 清除房间模式状态
      if (window.state) {
        window.state.isInRoomMode = false;
        window.state.currentSessionId = roomId;
        window.state.currentRoomId = null;  // 清除房间 ID
      }

      // 切换回普通连接
      const connItem = document.querySelector(`.conn-item[data-id="${roomId}"]`);
      if (connItem) connItem.classList.add('active');
    }
  },

  _showPublicChatRoom() {
    const aiInteractionToggle = document.getElementById('aiInteractionToggle');
    const loopToggle = document.getElementById('conversationLoopToggle');
    const stopBtn = document.getElementById('stopLoopBtn');

    // 确保公共聊天模式下不操作房间数据
    if (window.state) {
      window.state.isInRoomMode = false;
      window.state.currentRoomId = null;  // 清除房间 ID，避免误操作
    }

    // 更新参与者显示
    this._updateParticipantsDisplay();

    // 设置 AI 交互开关状态
    if (aiInteractionToggle && window.roomManager) {
      aiInteractionToggle.checked = window.roomManager.aiInteractionEnabled;
      console.log('[UI] _showPublicChatRoom - 设置开关状态:', window.roomManager.aiInteractionEnabled);

      // 确保事件监听器已绑定（如果还没绑定）
      if (!aiInteractionToggle._hasChangeListener) {
        aiInteractionToggle.addEventListener('change', (e) => {
          console.log('[UI] 开关 change 事件触发，当前值:', e.target.checked);
          if (window.roomManager) {
            window.roomManager.aiInteractionEnabled = e.target.checked;
            // 保存到 localStorage
            localStorage.setItem('roclaw.room.ai_interaction', String(e.target.checked));
            console.log('[UI] 已更新 roomManager.aiInteractionEnabled 为:', window.roomManager.aiInteractionEnabled);
          }
        });
        aiInteractionToggle._hasChangeListener = true;
        console.log('[UI] 已绑定开关事件监听器');
      }
    }

    // ========== 绑定对话循环开关 ==========
    if (loopToggle && window.roomManager) {
      loopToggle.checked = window.roomManager.conversationLoop.enabled;
      console.log('[UI] _showPublicChatRoom - 设置循环开关状态:', window.roomManager.conversationLoop.enabled);

      if (!loopToggle._hasChangeListener) {
        loopToggle.addEventListener('change', (e) => {
          console.log('[UI] 循环开关 change 事件触发，当前值:', e.target.checked);
          if (window.roomManager) {
            window.roomManager.conversationLoop.enabled = e.target.checked;
            window.roomManager._saveLoopState();
            console.log('[UI] 已更新 roomManager.conversationLoop.enabled 为:', window.roomManager.conversationLoop.enabled);
          }
        });
        loopToggle._hasChangeListener = true;
        console.log('[UI] 已绑定循环开关事件监听器');
      }
    }

    // ========== 绑定停止按钮 ==========
    if (stopBtn && !stopBtn._hasClickListener) {
      stopBtn.addEventListener('click', () => {
        console.log('[UI] 停止按钮点击');
        if (window.roomManager) {
          window.roomManager.stopConversationLoop('manual');
          this._updateLoopStatusUI();
        }
      });
      stopBtn._hasClickListener = true;
      console.log('[UI] 已绑定停止按钮事件监听器');
    }

    // ========== 绑定重置会话按钮 ==========
    const resetSessionsBtn = document.getElementById('resetAllSessionsBtn');
    if (resetSessionsBtn && !resetSessionsBtn._hasClickListener) {
      resetSessionsBtn.addEventListener('click', () => {
        console.log('[UI] 重置会话按钮点击');

        if (!window.roomManager) return;

        // 检查是否有参与者
        if (window.roomManager.participantIds.size === 0) {
          this._showHint('房间中没有参与者');
          return;
        }

        // 显示确认模态框
        this._showResetSessionsModal();
      });
      resetSessionsBtn._hasClickListener = true;
      console.log('[UI] 已绑定重置会话按钮事件监听器');
    }

    // 更新循环状态 UI
    this._updateLoopStatusUI();

    // 渲染房间消息
    this._renderRoomMessages();

    // 更新窗口标题
    const titleEl = document.getElementById('currentConnTitle');
    if (titleEl) titleEl.textContent = '公共聊天';
  },

  // 更新参与者显示（精简版 + tooltip）
  _updateParticipantsDisplay() {
    // 获取参与者 ID 列表（优先从当前房间 session 获取）
    let participantIds = [];
    let currentRoomId = null;

    // 检查是否在房间模式
    if (window.state && window.state.currentRoomId) {
      currentRoomId = window.state.currentRoomId;
    }

    if (currentRoomId && window.sessionManager) {
      // 从房间 session 获取参与者
      const session = window.sessionManager.getSession(currentRoomId);
      if (session && session.participants) {
        participantIds = session.participants.map(p => p.connId);
      }
    } else if (window.roomManager) {
      // 向后兼容：从 roomManager 获取（公共聊天模式）
      participantIds = Array.from(window.roomManager.participantIds);
    }

    // 根据 ID 获取完整的连接信息
    const participants = participantIds
      .map(id => window.connectionManager?.getConnection(id))
      .filter(conn => conn != null);  // 显示所有配置的连接，不限于已连接的

    // 获取所有可用的连接（所有配置的连接，不仅限已连接）
    const allConnections = window.connectionManager?.getAllConnections() || [];

    const countEl = document.getElementById('participantsCount');
    const tooltipEl = document.getElementById('participantsTooltip');
    const removeBtn = document.getElementById('participantsRemoveBtn');
    const addBtn = document.getElementById('participantsAddBtn');
    const dropdownEl = document.getElementById('participantsDropdown');

    if (countEl) countEl.textContent = participants.length;

    // 删除按钮状态：没有参与者时禁用
    if (removeBtn) {
      removeBtn.disabled = participants.length === 0;
      removeBtn.style.opacity = participants.length === 0 ? '0.3' : '1';
      removeBtn.style.cursor = participants.length === 0 ? 'not-allowed' : 'pointer';
    }

    // 构建 tooltip 内容
    if (tooltipEl) {
      if (participants.length === 0) {
        tooltipEl.innerHTML = '<div class="participant-item">暂无参与者</div>';
      } else {
        tooltipEl.innerHTML = participants.map(conn => `
          <div class="participant-item">
            <div class="participant-item-info">
              <span class="status-dot ${conn.status}"></span>
              <span>${this._escapeHtml(conn.name)}</span>
            </div>
            <button class="participant-item-remove" data-conn-id="${conn.id}" title="移除">×</button>
          </div>
        `).join('');

        // 绑定删除按钮事件
        tooltipEl.querySelectorAll('.participant-item-remove').forEach(btn => {
          if (!btn._hasClickHandler) {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const connId = e.target.dataset.connId;
              this._removeParticipant(connId);
            });
            btn._hasClickHandler = true;
          }
        });
      }
    }

    // 构建下拉菜单内容
    if (dropdownEl) {
      if (allConnections.length === 0) {
        dropdownEl.innerHTML = '<div class="participant-dropdown-item" style="cursor: default; color: #999;">暂无可用连接</div>';
      } else {
        dropdownEl.innerHTML = allConnections.map(conn => {
          const isInRoom = participantIds.includes(conn.id);
          return `
            <div class="participant-dropdown-item ${isInRoom ? 'in-room' : ''}" data-conn-id="${conn.id}">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="status-dot ${conn.status}"></span>
                <span>${this._escapeHtml(conn.name)}</span>
              </div>
              <button class="participant-dropdown-add ${isInRoom ? 'added' : ''}" data-conn-id="${conn.id}">
                ${isInRoom ? '已加入' : '加入'}
              </button>
            </div>
          `;
        }).join('');

        // 绑定加入按钮事件
        dropdownEl.querySelectorAll('.participant-dropdown-add:not(.added)').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const connId = e.target.dataset.connId;
            this._addParticipant(connId);
          });
        });
      }
    }

    // 绑定顶部删除按钮事件（移除所有参与者）
    if (removeBtn && !removeBtn._hasClickHandler) {
      removeBtn.addEventListener('click', () => {
        this._removeAllParticipants();
      });
      removeBtn._hasClickHandler = true;
    }

    // 绑定添加按钮事件（切换下拉菜单）
    if (addBtn && !addBtn._hasClickHandler) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleParticipantsDropdown();
      });
      addBtn._hasClickHandler = true;
    }

    // 点击其他地方关闭下拉菜单
    if (!this._dropdownClickHandler) {
      document.addEventListener('click', () => {
        this._closeParticipantsDropdown();
      });
      this._dropdownClickHandler = true;
    }
  },

  // 切换参与者下拉菜单
  _toggleParticipantsDropdown() {
    const compactEl = document.querySelector('.participants-compact');
    const dropdownEl = document.getElementById('participantsDropdown');

    if (compactEl && dropdownEl) {
      const isOpen = compactEl.classList.contains('is-dropdown-open');
      if (isOpen) {
        compactEl.classList.remove('is-dropdown-open');
      } else {
        compactEl.classList.add('is-dropdown-open');
      }
    }
  },

  // 关闭参与者下拉菜单
  _closeParticipantsDropdown() {
    const compactEl = document.querySelector('.participants-compact');
    if (compactEl) {
      compactEl.classList.remove('is-dropdown-open');
    }
  },

  // 添加参与者到房间
  _addParticipant(connId) {
    console.log('[UI] _addParticipant 被调用，connId:', connId);

    if (!window.connectionManager) return;

    const conn = window.connectionManager.getConnection(connId);
    if (!conn) return;

    // 检查是否在房间模式
    const currentRoomId = window.state?.currentRoomId;

    if (currentRoomId && window.sessionManager) {
      // 房间模式：通过 SessionManager 添加参与者
      const success = window.sessionManager.addParticipantToRoom(currentRoomId, connId);
      if (success) {
        console.log('[UI] 已将', conn.name, '加入房间', currentRoomId);
        // 重新加载房间 session 并更新参与者显示
        const updatedSession = window.sessionManager.getSession(currentRoomId);
        this._updateParticipantsDisplay();
        // 保存房间消息
        if (updatedSession) {
          window.Storage.saveSession(updatedSession);
        }
      }
    } else if (window.roomManager) {
      // 公共聊天模式：添加到 roomManager
      window.roomManager.addParticipant(connId);
      console.log('[UI] 已将', conn.name, '加入公共聊天');
      this._updateParticipantsDisplay();
    }
  },

  // 移除单个参与者（从房间移除，不删除连接）
  _removeParticipant(connId) {
    console.log('[UI] _removeParticipant 被调用，connId:', connId);

    if (!window.connectionManager) {
      console.error('[UI] connectionManager 不存在');
      return;
    }

    const conn = window.connectionManager.getConnection(connId);
    if (!conn) {
      console.error('[UI] 连接不存在:', connId);
      return;
    }

    console.log('[UI] 准备移除:', conn.name);

    // 检查是否在房间模式
    const currentRoomId = window.state?.currentRoomId;

    if (currentRoomId && window.sessionManager) {
      // 房间模式：通过 SessionManager 移除参与者
      const success = window.sessionManager.removeParticipantFromRoom(currentRoomId, connId);
      if (success) {
        console.log('[UI] 已从房间', currentRoomId, '移除', conn.name);
        // 更新参与者显示
        this._updateParticipantsDisplay();
        // 保存房间 session
        const session = window.sessionManager.getSession(currentRoomId);
        if (session) {
          window.Storage.saveSession(session);
        }
      }
    } else if (window.roomManager) {
      // 公共聊天模式：从 roomManager 移除
      window.roomManager.removeParticipant(connId);
      console.log('[UI] 已从公共聊天移除', conn.name);
      this._updateParticipantsDisplay();
    }
  },

  // 移除所有参与者（从房间移除，不删除连接）
  _removeAllParticipants() {
    if (!window.connectionManager) return;

    // 检查是否在房间模式
    const currentRoomId = window.state?.currentRoomId;

    if (currentRoomId && window.sessionManager) {
      // 房间模式：清空 session.participants
      const session = window.sessionManager.getSession(currentRoomId);
      if (session && session.participants && session.participants.length > 0) {
        session.participants = [];
        window.Storage.saveSession(session);
        console.log('[UI] 已从房间', currentRoomId, '移除所有参与者');
        this._updateParticipantsDisplay();
      }
    } else if (window.roomManager) {
      // 公共聊天模式：清空 roomManager.participantIds
      window.roomManager.participantIds.clear();
      console.log('[UI] 已从公共聊天移除所有参与者');
      this._updateParticipantsDisplay();
    }
  },

  // 更新房间状态栏（用于连接状态变化时）
  _updateRoomStatusBar() {
    const roomStatusBar = document.getElementById('roomStatusBar');
    if (roomStatusBar && roomStatusBar.style.display !== 'none') {
      this._updateParticipantsDisplay();
    }
  },

  _renderRoomMessages() {
    const chatThread = document.getElementById('chatThread');
    if (!chatThread) return;

    const messages = window.roomManager?.getMessages() || [];

    chatThread.innerHTML = '';

    for (const msg of messages) {
      this._renderRoomMessage(msg);
    }

    // 滚动到底部
    chatThread.scrollTop = chatThread.scrollHeight;
  },

  _renderRoomMessage(msg) {
    const chatThread = document.getElementById('chatThread');
    if (!chatThread) return;

    const line = document.createElement('div');
    line.className = `chat-line ${msg.senderType === 'user' ? 'user' : 'assistant'}`;
    line.id = msg.domId || msg.id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = msg.senderName;

    const content = document.createElement('div');
    content.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (msg.senderType === 'ai' || msg.senderType === 'assistant') {
      const textDiv = document.createElement('div');
      textDiv.className = 'text markdown-content';

      if (msg.content) {
        const html = marked.parse(msg.content);
        textDiv.innerHTML = html;

        textDiv.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      }
      bubble.appendChild(textDiv);
    } else {
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = msg.content;
      bubble.appendChild(text);
    }

    content.appendChild(bubble);

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = formatTime(msg.timestamp);
    content.appendChild(meta);

    line.appendChild(avatar);
    line.appendChild(content);
    chatThread.appendChild(line);
  },

  // ========== 辅助方法 ==========

  // 更新循环状态 UI
  _updateLoopStatusUI() {
    const statusDiv = document.getElementById('loopStatus');
    const roundsSpan = document.getElementById('loopRounds');

    if (!window.roomManager) return;

    const loop = window.roomManager.conversationLoop;

    console.log('[UI] _updateLoopStatusUI - isActive:', loop.isActive, 'currentRound:', loop.currentRound);

    if (loop.isActive) {
      statusDiv.style.display = 'flex';
      roundsSpan.textContent = `轮数: ${loop.currentRound}/${loop.maxRounds}`;
    } else {
      statusDiv.style.display = 'none';
    }
  },

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // 显示提示信息
  _showHint(text, duration = 2000) {
    const hintEl = document.getElementById('hint');
    if (!hintEl) return;

    hintEl.textContent = text;
    hintEl.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => {
        hintEl.style.display = 'none';
      }, duration);
    }
  }
};

// 导出到全局
window.UIManager = UIManager;

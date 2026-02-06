// UI 操作模块 - 处理连接列表、弹窗和交互

const UIManager = {
  // ========== 初始化 ==========

  init() {
    this.renderSessionList();
    this.initRoomSwitching();
  },

  // ========== 连接列表渲染 ==========

  renderSessionList() {
    if (!window.sessionManager) return;

    const sessions = window.sessionManager.getAllSessions();
    const activeId = window.sessionManager.activeSessionId;

    // 分离连接和房间
    const connections = sessions.filter(s => s.type === 'connection');
    const rooms = sessions.filter(s => s.type === 'room');

    // 渲染连接列表
    this._renderConnectionList(connections, activeId);

    // 渲染房间列表
    this._renderRoomList(rooms, activeId);
  }

  _renderConnectionList(connections, activeId) {
    const container = document.getElementById('connList');
    if (!container) return;

    container.innerHTML = connections.map(conn => {
      const isActive = conn.id === activeId;
      const state = window.connectionManager?.connectionStates.get(conn.id);
      const status = state?.status || 'disconnected';

      return `
        <div class="session-item connection ${isActive ? 'active' : ''}" data-id="${conn.id}">
          <span class="session-icon">🔌</span>
          <span class="session-name">${this._escapeHtml(conn.name)}</span>
          <span class="session-status ${status}"></span>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    this._bindSessionClickEvents();
  }

  _renderRoomList(rooms, activeId) {
    const container = document.getElementById('roomList');
    if (!container) return;

    if (rooms.length === 0) {
      container.innerHTML = '<div style="padding: 8px 12px; color: #999; font-size: 13px;">暂无房间</div>';
      return;
    }

    container.innerHTML = rooms.map(room => {
      const isActive = room.id === activeId;
      const participantCount = room.participants?.length || 0;

      return `
        <div class="session-item room ${isActive ? 'active' : ''}" data-id="${room.id}">
          <span class="session-icon">🏠</span>
          <span class="session-name">${this._escapeHtml(room.name)}</span>
          <span class="participant-count">(${participantCount})</span>
          <button class="room-settings-btn" title="房间设置">⚙️</button>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    this._bindSessionClickEvents();
  }

  _bindSessionClickEvents() {
    // 连接和房间项点击
    document.querySelectorAll('.session-item[data-id]').forEach(item => {
      item.addEventListener('click', (e) => {
        // 如果点击的是设置按钮，不处理切换
        if (e.target.classList.contains('room-settings-btn')) {
          return;
        }
        const sessionId = e.currentTarget.dataset.id;
        window.sessionManager.switchSession(sessionId);
        this.renderSessionList();
        this._handleSessionSwitch(sessionId);
      });
    });
  }

  _handleSessionSwitch(sessionId) {
    const session = window.sessionManager.getSession(sessionId);
    if (!session) return;

    if (session.type === 'connection') {
      this._switchToConnectionMode(sessionId);
    } else if (session.type === 'room') {
      this._switchToRoomMode(sessionId);
    }
  }

  _switchToConnectionMode(sessionId) {
    // TODO: 实现连接模式切换
    console.log('[UI] Switched to connection mode:', sessionId);
  }

  _switchToRoomMode(sessionId) {
    // TODO: 实现房间模式切换
    console.log('[UI] Switched to room mode:', sessionId);
  }

  // 保留原有的 renderConnectionList 方法，用于向后兼容
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
      // 左键点击：切换连接
      item.addEventListener('click', (e) => {
        const connId = e.currentTarget.dataset.id;
        window.connectionManager.switchConnection(connId);
      });

      // 右键菜单
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const connId = e.currentTarget.dataset.id;
        this._showContextMenu(e, connId);
      });
    });
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
        // 编辑现有连接
        window.connectionManager.updateConnection(connId, { name, gatewayUrl, token, sessionKey });
      } else {
        // 添加新连接
        const newConn = window.connectionManager.addConnection({ name, gatewayUrl, token, sessionKey });
        // 自动连接到新连接
        window.connectionManager.switchConnection(newConn.id);
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

  _showContextMenu(event, connId) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;

    // 定位菜单
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    menu.style.display = 'block';

    // 保存当前 UIManager 引用和 connId 到菜单元素上
    menu.dataset.connId = connId;

    // 清除旧的事件监听器
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      if (item._menuHandler) {
        item.removeEventListener('click', item._menuHandler);
      }
    });

    // 绑定菜单事件
    const self = this;
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = item.dataset.action;
        const targetConnId = menu.dataset.connId;
        self._handleContextMenuAction(action, targetConnId);
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

  _handleContextMenuAction(action, connId) {
    switch (action) {
      case 'edit':
        this.showEditConnectionModal(connId);
        break;
      case 'copy':
        this._copyConnection(connId);
        break;
      case 'reconnect':
        window.connectionManager.reconnect(connId);
        break;
      case 'delete':
        this._deleteConnection(connId);
        break;
    }
  },

  _copyConnection(connId) {
    const conn = window.connectionManager.getConnection(connId);
    if (!conn) return;

    const newConn = window.connectionManager.addConnection({
      name: conn.name + ' (副本)',
      gatewayUrl: conn.gatewayUrl,
      token: conn.token,
      sessionKey: conn.sessionKey
    });

    this.renderConnectionList();
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
        window.connectionManager.deleteConnection(connId);
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

      // 切换回普通连接
      const connItem = document.querySelector(`.conn-item[data-id="${roomId}"]`);
      if (connItem) connItem.classList.add('active');
    }
  },

  _showPublicChatRoom() {
    const aiInteractionToggle = document.getElementById('aiInteractionToggle');
    const loopToggle = document.getElementById('conversationLoopToggle');
    const stopBtn = document.getElementById('stopLoopBtn');

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
    // 从 roomManager 获取参与者 ID 列表
    const participantIds = window.roomManager ? Array.from(window.roomManager.participantIds) : [];

    // 根据 ID 获取完整的连接信息
    const participants = participantIds
      .map(id => window.connectionManager?.getConnection(id))
      .filter(conn => conn && conn.status === 'connected');

    // 获取所有可用的连接（已连接的）
    const allConnections = window.connectionManager?.getParticipants() || [];

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

  // 添加参与者到公共聊天室
  _addParticipant(connId) {
    console.log('[UI] _addParticipant 被调用，connId:', connId);

    if (!window.connectionManager) return;

    const conn = window.connectionManager.getConnection(connId);
    if (!conn) return;

    // 添加到房间管理器
    if (window.roomManager) {
      window.roomManager.addParticipant(connId);
      console.log('[UI] 已将', conn.name, '加入房间');

      // 更新参与者显示
      this._updateParticipantsDisplay();
    }
  },

  // 移除单个参与者（从公共聊天室移除，不删除连接）
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

    console.log('[UI] 准备从公共聊天室移除:', conn.name);

    // 只从房间管理器中移除参与者，不删除连接
    if (window.roomManager) {
      window.roomManager.removeParticipant(connId);
      console.log('[UI] 已从房间移除参与者');

      // 更新参与者显示
      this._updateParticipantsDisplay();
    }
  },

  // 移除所有参与者（从公共聊天室移除，不删除连接）
  _removeAllParticipants() {
    if (!window.connectionManager) return;

    const participants = window.connectionManager.getParticipants();
    if (participants.length === 0) return;

    // 只从房间管理器中清空参与者，不删除连接
    if (window.roomManager) {
      window.roomManager.participantIds.clear();
      console.log('[UI] 已从房间移除所有参与者');

      // 更新参与者显示
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

// UI 操作模块 - 处理连接列表、弹窗和交互

const UIManager = {
  // ========== 连接列表渲染 ==========

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

    if (roomId === 'public') {
      const roomBtn = document.getElementById('publicRoomBtn');
      if (roomBtn) roomBtn.classList.add('active');

      // 显示公共聊天界面
      this._showPublicChatRoom();
    } else {
      // 切换回普通连接
      const connItem = document.querySelector(`.conn-item[data-id="${roomId}"]`);
      if (connItem) connItem.classList.add('active');
    }
  },

  _showPublicChatRoom() {
    // TODO: 在后续任务中实现
    console.log('Switching to public chat room');
  },

  // ========== 辅助方法 ==========

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 导出到全局
window.UIManager = UIManager;

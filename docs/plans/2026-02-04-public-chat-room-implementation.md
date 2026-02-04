# 公共聊天房间功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 在 RoClaw 桌面应用中添加公共聊天房间功能，支持与多个 AI 连接同时交互，支持 @提及定向发送，支持 AI 交互模式。

**架构:** 新增 RoomManager 和 MessageRouter 类管理房间消息和路由，扩展现有 ConnectionManager 支持房间参与者管理，修改 UI 添加侧边栏房间入口和群聊风格消息显示。

**技术栈:** JavaScript (ES6+), WebSocket, localStorage, HTML/CSS

---

## 阶段 1: 基础架构 - RoomManager 和侧边栏入口

### Task 1: 创建 RoomManager 类

**Files:**
- Create: `src/js/roomManager.js`

**Step 1: 创建基础类结构**

```javascript
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
```

**Step 2: 在 index.html 中引入脚本**

**File:** `src/index.html`

在 `<script src="js/ui.js"></script>` 之前添加：
```html
<script src="js/roomManager.js"></script>
```

**Step 3: 在 app.js 中初始化 RoomManager**

**File:** `src/js/app.js`

在 `init()` 函数开头添加：
```javascript
// ========== 初始化房间管理器 ==========
window.roomManager = new RoomManager();
window.roomManager.init();
```

**Step 4: 提交**

```bash
git add src/js/roomManager.js src/index.html src/js/app.js
git commit -m "feat: add RoomManager class for public chat room"
```

---

### Task 2: 在侧边栏添加"公共聊天"入口

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles/chat.css`
- Modify: `src/js/ui.js`

**Step 1: 修改侧边栏 HTML**

**File:** `src/index.html`

找到侧边栏的连接列表部分，在 `<div class="connection-list" id="connList">` 之前添加分隔线：

```html
<div class="connection-list" id="connList">
  <!-- 连接项将通过 JS 动态插入 -->
</div>

<!-- 在上面这行之前添加 -->
<div class="room-divider"></div>
```

然后在 `connection-list` 闭合标签后添加公共聊天选项：

```html
<div class="connection-list" id="connList">
  <!-- 连接项将通过 JS 动态插入 -->
</div>

<!-- 在上面这行之后添加 -->
<div class="room-item" id="publicRoomBtn" data-room="public">
  <span class="room-icon">🌐</span>
  <span class="room-name">公共聊天</span>
  <span class="room-badge">NEW</span>
</div>
```

**Step 2: 添加公共聊天房间样式**

**File:** `src/styles/chat.css`

在侧边栏样式部分添加：

```css
/* ========== 房间分隔线 ========== */
.room-divider {
  height: 1px;
  background: #d0d7de;
  margin: 8px 12px;
}

/* ========== 公共聊天房间项 ========== */
.room-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.room-item:hover {
  background: #f3f4f6;
}

.room-item.active {
  background: #e8f5e9;
}

.room-icon {
  font-size: 16px;
}

.room-name {
  flex: 1;
  font-size: 14px;
  color: #1f2328;
  font-weight: 500;
}

.room-badge {
  font-size: 10px;
  background: #07c160;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}
```

**Step 3: 在 UIManager 中添加房间切换逻辑**

**File:** `src/js/ui.js`

在 `UIManager` 对象中添加方法：

```javascript
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
```

在 `init()` 函数末尾添加：
```javascript
this.initRoomSwitching();
```

**Step 4: 提交**

```bash
git add src/index.html src/styles/chat.css src/js/ui.js
git commit -m "feat: add public chat room entry in sidebar"
```

---

### Task 3: 创建公共聊天房间界面

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles/chat.css`

**Step 1: 添加房间头部和控制区域**

**File:** `src/index.html`

在 `<div class="chat-thread" id="chatThread">` 之前添加：

```html
<!-- 房间控制面板（仅在公共聊天模式显示） -->
<div class="room-controls" id="roomControls" style="display: none;">
  <div class="room-participants">
    <span class="participants-label">参与中:</span>
    <div class="participant-list" id="participantList">
      <!-- 参与者将通过 JS 动态插入 -->
    </div>
  </div>
  <div class="room-settings">
    <label class="interaction-switch">
      <input type="checkbox" id="aiInteractionToggle">
      <span>AI 交互模式</span>
    </label>
  </div>
</div>
```

**Step 2: 添加房间控制面板样式**

**File:** `src/styles/chat.css`

在控制面板样式部分添加：

```css
/* ========== 房间控制面板 ========== */
.room-controls {
  padding: 12px 16px;
  background: #f7f7f7;
  border-bottom: 1px solid #d0d7de;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.room-participants {
  display: flex;
  align-items: center;
  gap: 8px;
}

.participants-label {
  font-size: 13px;
  color: #656d76;
}

.participant-list {
  display: flex;
  gap: 4px;
}

.participant-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: white;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  font-size: 12px;
}

.participant-chip .status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ccc;
}

.participant-chip .status.connected {
  background: #07c160;
}

.room-settings {
  display: flex;
  align-items: center;
}

.interaction-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.interaction-switch input[type="checkbox"] {
  cursor: pointer;
}
```

**Step 3: 提交**

```bash
git add src/index.html src/styles/chat.css
git commit -m "feat: add room controls panel UI"
```

---

### Task 4: 实现房间切换和界面更新逻辑

**Files:**
- Modify: `src/js/ui.js`
- Modify: `src/js/app.js`

**Step 1: 完善 _showPublicChatRoom 方法**

**File:** `src/js/ui.js`

```javascript
_showPublicChatRoom() {
  const roomControls = document.getElementById('roomControls');
  const participantList = document.getElementById('participantList');
  const aiInteractionToggle = document.getElementById('aiInteractionToggle');

  if (roomControls) roomControls.style.display = 'flex';

  // 更新参与者列表
  this._updateParticipantList();

  // 设置 AI 交互开关状态
  if (aiInteractionToggle) {
    aiInteractionToggle.checked = window.roomManager?.aiInteractionEnabled || false;
  }

  // 渲染房间消息
  this._renderRoomMessages();

  // 更新窗口标题
  const titleEl = document.getElementById('currentConnTitle');
  if (titleEl) titleEl.textContent = '公共聊天';
},

_updateParticipantList() {
  const participantList = document.getElementById('participantList');
  if (!participantList) return;

  const participants = window.connectionManager?.getParticipants() || [];

  participantList.innerHTML = participants.map(conn => `
    <div class="participant-chip">
      <span class="status ${conn.status}"></span>
      <span>${this._escapeHtml(conn.name)}</span>
    </div>
  `).join('');
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
```

**Step 2: 在 app.js 中添加 getParticipants 方法**

**File:** `src/js/connectionManager.js`

```javascript
// 获取参与房间的连接（已连接的）
getParticipants() {
  return this.connections.filter(conn => {
    const state = this.connectionStates.get(conn.id);
    return state?.status === 'connected';
  });
},
```

**Step 3: 绑定 AI 交互开关事件**

**File:** `src/js/ui.js`

在 `init()` 函数中添加：

```javascript
// ========== 绑定 AI 交互开关 ==========
const aiInteractionToggle = document.getElementById('aiInteractionToggle');
if (aiInteractionToggle) {
  aiInteractionToggle.addEventListener('change', (e) => {
    if (window.roomManager) {
      const enabled = window.roomManager.toggleAIInteraction();
      console.log('AI Interaction:', enabled ? 'ON' : 'OFF');
    }
  });
}
```

**Step 4: 提交**

```bash
git add src/js/ui.js src/js/connectionManager.js
git commit -m "feat: implement room switching and UI update logic"
```

---

## 阶段 2: 消息路由和 @提及功能

### Task 5: 创建 MessageRouter 类

**Files:**
- Create: `src/js/messageRouter.js`

**Step 1: 创建 MessageRouter 类**

```javascript
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
    const { mentions = [], forceReconnect = false } = options;

    // 如果有 @提及，只发送到提到的连接
    // 否则发送到所有已连接的参与者
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
        // 如果是 @提及且连接离线，尝试重连
        if (mentions.length > 0 && forceReconnect) {
          const state = this.connectionManager.connectionStates.get(conn.id);
          if (state?.status !== 'connected') {
            console.log(`正在重连 "${conn.name}"...`);
            await this.connectionManager.connect(conn.id);
          }
        }

        await this._sendToConnection(conn, message);
        results.push({ success: true, connId: conn.id, connName: conn.name });
      } catch (error) {
        results.push({ success: false, connId: conn.id, connName: conn.name, error: error.message });
      }
    }

    return results;
  }

  // 发送消息到单个连接
  async _sendToConnection(conn, message) {
    const state = this.connectionManager.connectionStates.get(conn.id);
    if (!state || !state.ws) {
      throw new Error('连接未建立');
    }

    const requestId = this._generateRequestId();

    return new Promise((resolve, reject) => {
      state.pending.set(requestId, { resolve, reject });

      state.ws.send(JSON.stringify({
        type: 'req',
        id: requestId,
        method: 'chat.send',
        params: {
          sessionKey: conn.sessionKey,
          message: message,
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

// 导出到全局
window.MessageRouter = MessageRouter;
```

**Step 2: 在 index.html 中引入脚本**

**File:** `src/index.html`

```html
<script src="js/messageRouter.js"></script>
```

**Step 3: 在 app.js 中初始化 MessageRouter**

**File:** `src/js/app.js`

```javascript
// ========== 初始化消息路由器 ==========
window.messageRouter = new MessageRouter(window.connectionManager);
```

**Step 4: 提交**

```bash
git add src/js/messageRouter.js src/index.html src/js/app.js
git commit -m "feat: add MessageRouter class for message routing"
```

---

### Task 6: 实现公共聊天消息发送

**Files:**
- Modify: `src/js/ui.js`
- Modify: `src/js/app.js`

**Step 1: 修改 handleSend 函数支持房间模式**

**File:** `src/js/app.js`

修改 `handleSend` 函数：

```javascript
async function handleSend(overrideMessage, restoreDraft) {
  const draft = elements.messageInput.value || "";
  const message = (overrideMessage ?? draft).trim();
  const attachmentsToSend = overrideMessage == null ? state.attachments : [];
  const hasAttachments = attachmentsToSend.length > 0;
  if (!message && !hasAttachments) return;

  // 检查是否在公共聊天房间模式
  const isInRoomMode = document.getElementById('publicRoomBtn')?.classList.contains('active');

  if (isInRoomMode) {
    // 公共聊天模式
    await handleRoomSend(message, attachmentsToSend);
  } else {
    // 普通连接模式（原有逻辑）
    if (isBusy()) {
      enqueueMessage(message, attachmentsToSend);
      return;
    }

    if (overrideMessage == null) {
      elements.messageInput.value = "";
      state.attachments = [];
      renderAttachments();
    }

    const ok = await sendChatMessage(message, attachmentsToSend);
    if (!ok && overrideMessage == null) {
      elements.messageInput.value = draft;
    }
    if (ok && restoreDraft && draft.trim()) {
      elements.messageInput.value = draft;
    }
    if (ok && !state.runId) {
      flushQueue();
    }
  }
}
```

**Step 2: 添加 handleRoomSend 函数**

**File:** `src/js/app.js`

```javascript
async function handleRoomSend(message, attachments) {
  // 解析 @提及
  const { cleanText, mentionedIds } = window.messageRouter.parseMentions(message);
  const messageToSend = cleanText || message;

  // 添加用户消息到房间
  const userMsg = window.roomManager.addMessage({
    senderId: 'user',
    senderName: '你',
    senderType: 'user',
    content: messageToSend,
    mentions: mentionedIds
  });

  // 渲染消息
  if (window.UIManager._renderRoomMessage) {
    window.UIManager._renderRoomMessage(userMsg);
  }

  // 路由消息到目标连接
  try {
    const results = await window.messageRouter.routeMessage(messageToSend, {
      mentions: mentionedIds,
      forceReconnect: true  // @离线连接时自动重连
    });

    // 显示发送结果
    for (const result of results) {
      if (!result.success) {
        setHint(`"${result.connName}" 发送失败: ${result.error}`);
      }
    }
  } catch (error) {
    setHint(String(error));
  }

  // 清空输入框
  elements.messageInput.value = '';
}
```

**Step 3: 提交**

```bash
git add src/js/app.js
git commit -m "feat: implement public chat message sending"
```

---

### Task 7: 实现 @提及的输入补全

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles/chat.css`
- Modify: `src/js/ui.js`

**Step 1: 添加提及补全弹窗 HTML**

**File:** `src/index.html`

在 `</body>` 之前添加：

```html
<!-- @提及补全弹窗 -->
<div class="mention-suggestions" id="mentionSuggestions" style="display: none;">
  <!-- 建议项将通过 JS 动态插入 -->
</div>
```

**Step 2: 添加提及补全样式**

**File:** `src/styles/chat.css`

```css
/* ========== @提及补全 ========== */
.mention-suggestions {
  position: absolute;
  bottom: 80px;
  left: 16px;
  background: white;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
}

.mention-item {
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mention-item:hover,
.mention-item.selected {
  background: #f3f4f6;
}

.mention-item .status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ccc;
}

.mention-item .status.connected {
  background: #07c160;
}

.mention-highlight {
  background: #e8f5e9;
  border-radius: 3px;
  padding: 0 2px;
}
```

**Step 3: 实现 @提及补全逻辑**

**File:** `src/js/ui.js`

```javascript
// ========== @提及补全 ==========

initMentionCompletion() {
  const input = elements.messageInput;
  if (!input) return;

  input.addEventListener('input', (e) => this._handleMentionInput(e));
  input.addEventListener('keydown', (e) => this._handleMentionKeydown(e));
},

_handleMentionInput(e) {
  const input = e.target;
  const value = input.value;
  const cursorPos = input.selectionStart;

  // 检查是否在输入 @
  const beforeCursor = value.substring(0, cursorPos);
  const atMatch = beforeCursor.match(/@(\w*)$/);

  if (atMatch) {
    const searchTerm = atMatch[1];
    this._showMentionSuggestions(searchTerm);
  } else {
    this._hideMentionSuggestions();
  }
},

_handleMentionKeydown(e) {
  const suggestions = document.getElementById('mentionSuggestions');
  if (!suggestions || suggestions.style.display === 'none') return;

  const items = suggestions.querySelectorAll('.mention-item');
  const selected = suggestions.querySelector('.mention-item.selected');
  const selectedIndex = Array.from(items).indexOf(selected);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const nextIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
    this._selectMentionItem(items, nextIndex);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
    this._selectMentionItem(items, prevIndex);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selected) {
      selected.click();
    }
  } else if (e.key === 'Escape') {
    this._hideMentionSuggestions();
  }
},

_selectMentionItem(items, index) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === index);
  });
},

_showMentionSuggestions(searchTerm) {
  const suggestions = document.getElementById('mentionSuggestions');
  if (!suggestions) return;

  // 过滤连接
  const connections = window.connectionManager?.connections || [];
  const filtered = connections.filter(conn =>
    conn.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (filtered.length === 0) {
    suggestions.style.display = 'none';
    return;
  }

  suggestions.innerHTML = filtered.map(conn => `
    <div class="mention-item" data-name="${conn.name}" data-id="${conn.id}">
      <span class="status ${conn.status}"></span>
      <span>${this._escapeHtml(conn.name)}</span>
    </div>
  `).join('');

  suggestions.style.display = 'block';

  // 绑定点击事件
  suggestions.querySelectorAll('.mention-item').forEach(item => {
    item.addEventListener('click', () => {
      this._insertMention(item.dataset.name);
    });
  });
},

_hideMentionSuggestions() {
  const suggestions = document.getElementById('mentionSuggestions');
  if (suggestions) suggestions.style.display = 'none';
},

_insertMention(name) {
  const input = elements.messageInput;
  const value = input.value;
  const cursorPos = input.selectionStart;

  // 找到 @ 的位置
  const beforeCursor = value.substring(0, cursorPos);
  const atMatch = beforeCursor.match(/@(\w*)$/);
  if (!atMatch) return;

  const atPos = cursorPos - atMatch[0].length;
  const newValue = value.substring(0, atPos) + '@' + name + ' ' + value.substring(cursorPos);

  input.value = newValue;
  input.selectionStart = input.selectionEnd = atPos + name.length + 2;
  input.focus();

  this._hideMentionSuggestions();
},
```

**Step 4: 在 init() 中初始化**

```javascript
this.initMentionCompletion();
```

**Step 5: 提交**

```bash
git add src/index.html src/styles/chat.css src/js/ui.js
git commit -m "feat: implement @mention autocomplete"
```

---

## 阶段 3: AI 交互模式和上下文构建

### Task 8: 实现 AI 交互模式的上下文构建

**Files:**
- Modify: `src/js/roomManager.js`
- Modify: `src/js/messageRouter.js`

**Step 1: 在 RoomManager 中添加上下文构建方法**

**File:** `src/js/roomManager.js`

```javascript
// 为特定连接构建上下文
buildContextForConnection(connId) {
  if (!this.aiInteractionEnabled) {
    // 交互关闭：只返回最近的消息，不包含其他 AI 的回复
    return this.getRecentMessages(10).filter(msg =>
      msg.senderType === 'user' || msg.senderId === connId
    );
  } else {
    // 交互开启：返回所有消息，包括 AI 之间的对话
    return this.getRecentMessages(20);
  }
},

// 格式化消息为发送给 AI 的格式
formatMessagesForAI(messages) {
  return messages.map(msg => {
    if (msg.senderType === 'user') {
      return { role: 'user', content: msg.content };
    } else {
      return { role: 'assistant', content: msg.content };
    }
  });
},
```

**Step 2: 修改 MessageRouter 支持上下文**

**File:** `src/js/messageRouter.js`

```javascript
// 发送消息到单个连接（带上下文）
async _sendToConnection(conn, message, includeContext = false) {
  const state = this.connectionManager.connectionStates.get(conn.id);
  if (!state || !state.ws) {
    throw new Error('连接未建立');
  }

  let messageToSend = message;

  // 如果需要包含上下文
  if (includeContext && window.roomManager) {
    const contextMessages = window.roomManager.buildContextForConnection(conn.id);
    if (contextMessages.length > 0) {
      // 将上下文转换为消息格式
      const formattedContext = this._formatContextMessages(contextMessages, conn.id);
      // 添加当前消息
      formattedContext.push({ role: 'user', content: message });
      // 构建完整消息文本
      messageToSend = this._buildContextualMessage(formattedContext);
    }
  }

  const requestId = this._generateRequestId();

  return new Promise((resolve, reject) => {
    state.pending.set(requestId, { resolve, reject });

    state.ws.send(JSON.stringify({
      type: 'req',
      id: requestId,
      method: 'chat.send',
      params: {
        sessionKey: conn.sessionKey,
        message: messageToSend,
        deliver: false,
        idempotencyKey: requestId
      }
    }));
  });
},

// 格式化上下文消息
_formatContextMessages(messages, currentConnId) {
  const formatted = [];

  for (const msg of messages) {
    // 只包含用户消息和当前 AI 的回复
    if (msg.senderType === 'user') {
      formatted.push({ role: 'user', content: msg.content });
    } else if (msg.senderId === currentConnId) {
      formatted.push({ role: 'assistant', content: msg.content });
    }
    // 如果 AI 交互开启，还包含其他 AI 的回复
    else if (window.roomManager?.aiInteractionEnabled) {
      formatted.push({
        role: 'assistant',
        content: `[${msg.senderName}]: ${msg.content}`
      });
    }
  }

  return formatted;
},

// 构建带上下文的消息文本
_buildContextualMessage(formattedMessages) {
  // 将历史消息转换为文本格式
  const contextText = formattedMessages.map(msg => {
    const prefix = msg.role === 'user' ? '用户' : '助手';
    return `${prefix}: ${msg.content}`;
  }).join('\n\n');

  return contextText;
},
```

**Step 3: 修改 routeMessage 支持 AI 交互**

**File:** `src/js/messageRouter.js`

```javascript
async routeMessage(message, options = {}) {
  const { mentions = [], forceReconnect = false } = options;
  const aiInteractionEnabled = window.roomManager?.aiInteractionEnabled || false;

  // ... (现有的目标选择逻辑)

  for (const conn of targets) {
    try {
      // ... (现有的重连逻辑)

      // 发送消息，如果 AI 交互开启则包含上下文
      await this._sendToConnection(conn, message, aiInteractionEnabled);

      results.push({ success: true, connId: conn.id, connName: conn.name });
    } catch (error) {
      results.push({ success: false, connId: conn.id, connName: conn.name, error: error.message });
    }
  }

  return results;
}
```

**Step 4: 提交**

```bash
git add src/js/roomManager.js src/js/messageRouter.js
git commit -m "feat: implement AI interaction mode with context building"
```

---

### Task 9: 处理 AI 回复并添加到房间

**Files:**
- Modify: `src/js/connectionManager.js`
- Modify: `src/js/roomManager.js`

**Step 1: 在 ConnectionManager 中添加房间消息处理**

**File:** `src/js/connectionManager.js`

修改 `_handleChatEvent` 方法，添加房间模式处理：

```javascript
_handleChatEvent(id, payload) {
  const conn = this.getConnection(id);
  if (!conn || payload.sessionKey !== conn.sessionKey) return;

  // 检查是否在房间模式
  const isInRoomMode = document.getElementById('publicRoomBtn')?.classList.contains('active');

  if (isInRoomMode && window.roomManager) {
    // 房间模式：将 AI 回复添加到房间
    this._handleRoomChatMessage(id, payload, conn);
    return;
  }

  // 原有的连接模式逻辑...
  if (payload.state === "delta") {
    // ...
  }
  // ...
},

_handleRoomChatMessage(connId, payload, conn) {
  if (payload.state === 'final' || payload.state === 'delta') {
    const text = window.extractText ? window.extractText(payload.message) : '';

    // 添加到房间消息
    const msg = window.roomManager.addMessage({
      senderId: connId,
      senderName: conn.name,
      senderType: 'ai',
      content: text,
      timestamp: Date.now()
    });

    // 渲染消息
    if (window.UIManager._renderRoomMessage) {
      window.UIManager._renderRoomMessage(msg);
    }
  }
},
```

**Step 2: 提交**

```bash
git add src/js/connectionManager.js
git commit -m "feat: handle AI replies in room mode"
```

---

## 阶段 4: 完善与优化

### Task 10: 添加消息持久化和状态管理

**Files:**
- Modify: `src/js/storage.js`
- Modify: `src/js/roomManager.js`

**Step 1: 在 Storage 中添加房间相关方法**

**File:** `src/js/storage.js`

```javascript
// ========== 房间消息 ==========

// 获取房间消息
getRoomMessages() {
  try {
    const data = localStorage.getItem(this.KEYS.ROOM_MESSAGES || 'roclaw.room.messages');
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
    const trimmed = messages.slice(-500);
    const data = {
      messages: trimmed,
      updatedAt: Date.now()
    };
    localStorage.setItem('roclaw.room.messages', JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save room messages:', error);
  }
},

// 获取 AI 交互开关状态
getAIInteractionEnabled() {
  try {
    const value = localStorage.getItem('roclaw.room.ai_interaction');
    return value === 'true';
  } catch {
    return false;
  }
},

// 保存 AI 交互开关状态
setAIInteractionEnabled(enabled) {
  try {
    localStorage.setItem('roclaw.room.ai_interaction', String(enabled));
  } catch (error) {
    console.error('Failed to save AI interaction state:', error);
  }
},
```

**Step 2: 更新 RoomManager 使用 Storage**

**File:** `src/js/roomManager.js`

```javascript
loadMessages() {
  this.messages = Storage.getRoomMessages();
},

saveMessages() {
  Storage.saveRoomMessages(this.messages);
},

loadSettings() {
  this.aiInteractionEnabled = Storage.getAIInteractionEnabled();
},

toggleAIInteraction() {
  this.aiInteractionEnabled = !this.aiInteractionEnabled;
  Storage.setAIInteractionEnabled(this.aiInteractionEnabled);
  return this.aiInteractionEnabled;
},
```

**Step 3: 提交**

```bash
git add src/js/storage.js src/js/roomManager.js
git commit -m "feat: add room message persistence"
```

---

### Task 11: 添加错误处理和用户提示

**Files:**
- Modify: `src/js/ui.js`

**Step 1: 添加房间模式提示方法**

**File:** `src/js/ui.js`

```javascript
// ========== 房间提示 ==========

showRoomMessage(message, type = 'info') {
  const chatThread = document.getElementById('chatThread');
  if (!chatThread) return;

  const hint = document.createElement('div');
  hint.className = `room-hint room-hint-${type}`;
  hint.textContent = message;
  chatThread.appendChild(hint);

  // 3 秒后自动移除
  setTimeout(() => {
    hint.remove();
  }, 3000);

  // 滚动到底部
  chatThread.scrollTop = chatThread.scrollHeight;
},
```

**Step 2: 添加提示样式**

**File:** `src/styles/chat.css`

```css
.room-hint {
  padding: 8px 12px;
  margin: 8px 0;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}

.room-hint-info {
  background: #e8f5e9;
  color: #1f2328;
}

.room-hint-error {
  background: #ffebe9;
  color: #cf222e;
}

.room-hint-warning {
  background: #fff8c5;
  color: #9a6700;
}
```

**Step 3: 更新 handleRoomSend 使用提示**

**File:** `src/js/app.js`

```javascript
async function handleRoomSend(message, attachments) {
  // ... (现有逻辑)

  // 检查是否有可用连接
  const participants = window.connectionManager.getParticipants();
  if (participants.length === 0) {
    if (window.UIManager.showRoomMessage) {
      window.UIManager.showRoomMessage('暂无可用连接，请先连接至少一个 AI', 'error');
    }
    return;
  }

  // ... (发送逻辑)

  // 显示发送结果
  for (const result of results) {
    if (!result.success) {
      if (window.UIManager.showRoomMessage) {
        window.UIManager.showRoomMessage(`"${result.connName}" 发送失败: ${result.error}`, 'error');
      }
    }
  }
}
```

**Step 4: 提交**

```bash
git add src/js/ui.js src/styles/chat.css src/js/app.js
git commit -m "feat: add error handling and user notifications for room"
```

---

### Task 12: 测试和验证

**Files:**
- Create: `tests/room-manager.test.html` (可选)

**Step 1: 创建测试页面**

**File:** `tests/room-manager.test.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Room Manager Test</title>
</head>
<body>
  <h1>公共聊天房间功能测试</h1>

  <div id="test-results"></div>

  <script>
    // 简单的测试框架
    function test(name, fn) {
      try {
        fn();
        log(`✓ ${name}`, 'pass');
      } catch (error) {
        log(`✗ ${name}: ${error.message}`, 'fail');
      }
    }

    function log(message, type) {
      const results = document.getElementById('test-results');
      const div = document.createElement('div');
      div.className = `test-${type}`;
      div.textContent = message;
      results.appendChild(div);
    }

    // 运行测试（需要在实际环境中运行）
    test('RoomManager 初始化', () => {
      if (typeof RoomManager === 'undefined') {
        throw new Error('RoomManager 未定义');
      }
    });
  </script>
</body>
</html>
```

**Step 2: 手动测试清单**

1. **基础功能测试**
   - [ ] 打开应用，侧边栏显示"公共聊天"选项
   - [ ] 点击"公共聊天"进入房间模式
   - [ ] 顶部显示参与中的连接列表

2. **消息发送测试**
   - [ ] 在房间中发送消息（无 @）
   - [ ] 所有已连接的 AI 都收到消息
   - [ ] 所有 AI 的回复显示在房间中

3. **@提及测试**
   - [ ] 输入 @ 时显示补全列表
   - [ ] 选择连接后正确插入 @连接名
   - [ ] @特定连接时只有该 AI 回复

4. **AI 交互模式测试**
   - [ ] 开启"AI 交互模式"开关
   - [ ] AI 能看到彼此的回复并继续讨论
   - [ ] 关闭开关后 AI 独立回答

5. **离线连接测试**
   - [ ] @离线连接时自动重连
   - [ ] 重连成功后发送消息
   - [ ] 重连失败时显示错误提示

6. **持久化测试**
   - [ ] 刷新页面后消息历史保留
   - [ ] AI 交互开关状态保留
   - [ ] 切换连接后状态正确

**Step 3: 提交**

```bash
git add tests/room-manager.test.html
git commit -m "test: add room manager test suite"
```

---

## 完成检查清单

- [ ] RoomManager 类创建完成
- [ ] 侧边栏显示"公共聊天"入口
- [ ] 房间界面正确显示
- [ ] MessageRouter 类创建完成
- [ ] 广播消息功能正常
- [ ] @提及功能正常
- [ ] @提及补全功能正常
- [ ] AI 交互开关正常工作
- [ ] AI 交互模式下上下文正确构建
- [ ] 离线连接自动重连
- [ ] 消息正确持久化
- [ ] 错误处理和用户提示完善
- [ ] 所有测试通过

---

## 下一步

实现完成后，可以考虑的增强功能：
1. 支持 @多个连接同时定向发送
2. 添加消息搜索功能
3. 支持 AI 回复的流式显示
4. 添加房间消息导出功能
5. 支持创建多个不同的房间

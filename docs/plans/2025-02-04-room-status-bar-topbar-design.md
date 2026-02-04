# 公共聊天状态栏顶部整合设计

**日期:** 2025-02-04
**状态:** 已批准

## 概述

将公共聊天的房间控制面板从独立区域移至顶部导航栏右侧，与连接状态并列显示，实现更紧凑的布局。

## 目标

1. 房间控制（参与者、AI交互开关、对话循环）移至右上角
2. 仅在公共聊天模式下显示房间控制
3. 普通连接模式只显示连接状态
4. 保持所有控件平铺显示，不折叠

## 布局设计

### 新的顶部结构

```
┌────────────────────────────────────────────────────────────┐
│  🔌 RoClaw              参与:3 │ [AI交互] │ 循环 3/10 [停止] │ ●已连接  │
└────────────────────────────────────────────────────────────┘
```

### HTML 结构

```html
<div class="topbar">
  <div class="brand">
    <div class="brand-dot"></div>
    <span class="brand-title">RoClaw 对话</span>
  </div>

  <div class="topbar-right">
    <!-- 房间状态栏（仅公共聊天） -->
    <div class="room-status-bar" id="roomStatusBar" style="display: none;">
      <div class="participants-compact">
        <span class="participants-label">参与:</span>
        <span class="participants-count" id="participantsCount">0</span>

        <!-- Tooltip -->
        <div class="participants-tooltip" id="participantsTooltip">
          <!-- 动态填充 -->
        </div>
      </div>

      <label class="interaction-switch">
        <input type="checkbox" id="aiInteractionToggle">
        <span>AI交互</span>
      </label>

      <div class="loop-control">
        <label class="loop-switch">
          <input type="checkbox" id="conversationLoopToggle">
          <span>循环</span>
        </label>
        <div class="loop-status" id="loopStatus" style="display: none;">
          <span class="loop-rounds" id="loopRounds">0/10</span>
          <button class="btn btn-mini" id="stopLoopBtn">停止</button>
        </div>
      </div>
    </div>

    <!-- 连接状态（始终显示） -->
    <div class="status" id="status">
      <div class="status-dot"></div>
      <span class="status-text" id="statusText">未连接</span>
    </div>
  </div>
</div>
```

## CSS 样式

### 顶部右侧容器

```css
.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.room-status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 999px;
}
```

### 参与者精简显示

```css
.participants-compact {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666;
  cursor: help;
}

.participants-label {
  font-weight: 500;
}

.participants-count {
  font-weight: 600;
  color: #07c160;
}
```

### 自定义 Tooltip

```css
.participants-tooltip {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 150px;
  z-index: 1000;
}

.participants-compact:hover .participants-tooltip {
  display: block;
}

.participant-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  white-space: nowrap;
}

.participant-item .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff4d4f;
}

.participant-item .status-dot.connected {
  background: #07c160;
}
```

### 控件样式调整

```css
/* 精简版开关 */
.interaction-switch,
.loop-switch {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.interaction-switch input,
.loop-switch input {
  cursor: pointer;
}

/* 循环状态 */
.loop-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.loop-rounds {
  font-size: 11px;
  color: #666;
}

.btn.btn-mini {
  padding: 2px 8px;
  font-size: 11px;
}
```

## JavaScript 实现

### UIManager 修改

```javascript
// ui.js

switchToRoom(roomId) {
  const roomStatusBar = document.getElementById('roomStatusBar');

  // 移除所有激活状态
  document.querySelectorAll('.conn-item.active, .room-item.active').forEach(el => {
    el.classList.remove('active');
  });

  if (roomId === 'public') {
    const roomBtn = document.getElementById('publicRoomBtn');
    if (roomBtn) roomBtn.classList.add('active');

    // 显示房间状态栏
    if (roomStatusBar) roomStatusBar.style.display = 'flex';

    this._showPublicChatRoom();
  } else {
    // 隐藏房间状态栏
    if (roomStatusBar) roomStatusBar.style.display = 'none';

    const connItem = document.querySelector(`.conn-item[data-id="${roomId}"]`);
    if (connItem) connItem.classList.add('active');
  }
}

_showPublicChatRoom() {
  const roomStatusBar = document.getElementById('roomStatusBar');
  if (roomStatusBar) roomStatusBar.style.display = 'flex';

  // 更新参与者计数和 tooltip
  this._updateParticipantsDisplay();

  // 设置 AI 交互开关状态
  const aiInteractionToggle = document.getElementById('aiInteractionToggle');
  if (aiInteractionToggle && window.roomManager) {
    aiInteractionToggle.checked = window.roomManager.aiInteractionEnabled;

    if (!aiInteractionToggle._hasChangeListener) {
      aiInteractionToggle.addEventListener('change', (e) => {
        if (window.roomManager) {
          window.roomManager.aiInteractionEnabled = e.target.checked;
          localStorage.setItem('roclaw.room.ai_interaction', String(e.target.checked));
        }
      });
      aiInteractionToggle._hasChangeListener = true;
    }
  }

  // 绑定循环开关（保持原有逻辑）
  // ...

  // 渲染房间消息
  this._renderRoomMessages();

  // 更新窗口标题
  const titleEl = document.getElementById('currentConnTitle');
  if (titleEl) titleEl.textContent = '公共聊天';
}

_updateParticipantsDisplay() {
  const participants = window.connectionManager?.getParticipants() || [];
  const countEl = document.getElementById('participantsCount');
  const tooltipEl = document.getElementById('participantsTooltip');

  if (countEl) countEl.textContent = participants.length;

  // 构建 tooltip 内容
  if (tooltipEl) {
    if (participants.length === 0) {
      tooltipEl.innerHTML = '<div class="participant-item">暂无参与者</div>';
    } else {
      tooltipEl.innerHTML = participants.map(conn => `
        <div class="participant-item">
          <span class="status-dot ${conn.status}"></span>
          <span>${this._escapeHtml(conn.name)}</span>
        </div>
      `).join('');
    }
  }
}

// 在 ConnectionManager 状态变化时调用
_updateRoomStatusBar() {
  const roomStatusBar = document.getElementById('roomStatusBar');
  if (roomStatusBar && roomStatusBar.style.display !== 'none') {
    this._updateParticipantsDisplay();
  }
}
```

### ConnectionManager 回调

```javascript
// connectionManager.js - 在 _updateConnectionStatus 中添加

_updateConnectionStatus(id, status) {
  // ... 现有代码 ...

  // 如果在公共聊天模式，更新参与者显示
  if (window.UIManager && window.UIManager._updateRoomStatusBar) {
    window.UIManager._updateRoomStatusBar();
  }
}
```

## 文件修改清单

### 需要修改的文件

1. **src/index.html**
   - 重构 `topbar` 结构，添加 `topbar-right` 容器
   - 添加 `room-status-bar` 及其子元素
   - 移除原有的独立 `room-controls` 区域

2. **src/styles/chat.css**
   - 添加 `.topbar-right` 样式
   - 添加 `.room-status-bar` 样式
   - 添加 `.participants-compact` 和 `.participants-tooltip` 样式
   - 调整控件样式以适应顶栏

3. **src/js/ui.js**
   - 修改 `switchToRoom()` 控制房间状态栏显示
   - 修改 `_showPublicChatRoom()` 使用新布局
   - 添加 `_updateParticipantsDisplay()` 方法
   - 添加 `_updateRoomStatusBar()` 方法
   - 移除旧的 `room-controls` 相关代码

4. **src/js/connectionManager.js** (可选)
   - 在状态变化时触发 UI 更新

## 实现步骤

1. 修改 HTML 结构
2. 添加 CSS 样式
3. 更新 UIManager 逻辑
4. 测试显示/隐藏切换
5. 测试参与者 tooltip
6. 测试循环模式集成

## 验收标准

- [x] 公共聊天模式：顶栏显示 `参与:N | [AI交互] | [循环] | N/10 [停止] | ●已连接`
- [x] 普通连接模式：顶栏只显示 `●已连接`
- [x] hover 参与者数字显示气泡列表
- [x] 切换房间时状态栏正确显示/隐藏
- [x] 所有开关和按钮功能正常

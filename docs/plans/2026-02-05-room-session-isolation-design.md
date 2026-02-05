# 公共聊天室会话隔离设计

## 概述

在公共聊天房间中，为每个 AI 实例使用独立的会话标识（sessionKey），避免会话上下文互相污染。

## 背景

### 当前问题
- 公共聊天室允许多个 AI 实例参与对话
- 目前所有 AI 共享同一个 sessionKey
- 导致 AI 之间的会话上下文混淆（会话污染）

### sessionKey 格式
```
agent:xxx:yyy
```
- `agent` - 固定前缀，标识这是 AI 代理会话
- `xxx` - 应用/代理 ID（用户配置）
- `yyy` - 会话 ID（需要动态生成）

## 设计方案

### 核心思路
在公共聊天房间中，为每个 AI 实例动态生成独立的 sessionKey，其中 `yyy` 部分使用时间戳。这些动态 sessionKey 存储在 RoomManager 中，只在公共聊天模式下使用。

### 模式说明

**1. 普通聊天模式（非房间模式）**
- 一对一聊天界面
- 使用连接原始的 sessionKey
- **不受本设计影响**

**2. 公共聊天房间模式（房间模式）**
- 多个 AI 同时参与的群聊
- 为每个 AI 使用独立的动态 sessionKey
- **本设计的目标范围**

## 数据结构

### RoomManager 新增属性
```javascript
this.sessionKeyMap = new Map();

// 存储格式：
// key: connId (如 "conn-1")
// value: {
//   original: "agent:app123:original-session",
//   dynamic: "agent:app123:1738765200000",
//   timestamp: 1738765200000
// }
```

### localStorage 存储
```json
{
  "roclaw.room.sessionKeys": {
    "conn-1": {
      "original": "agent:app123:original-session",
      "dynamic": "agent:app123:1738765200000",
      "timestamp": 1738765200000
    }
  }
}
```

## 流程设计

### 添加参与者
```
用户点击右上角 + 按钮
  → 打开参与者选择界面
  → 用户选择 AI
  → RoomManager.addParticipant(connId)
  → 检查 sessionKeyMap 是否已有记录
  → 如果没有：生成动态 sessionKey (agent:xxx:时间戳)
  → 保存映射并存储到 localStorage
  → 添加到参与者列表
```

### 发送消息
```
用户发送消息或 AI 回复
  → MessageRouter._sendToConnection()
  → 检查是否在房间模式
  → 如果是：从 sessionKeyMap 获取动态 sessionKey
  → 如果否：使用连接原始的 sessionKey
  → 发送消息
```

### 重置会话
```
用户点击"重置会话"按钮
  → 显示确认对话框（"确定要重置所有 AI 的会话并清空消息记录吗？"）
  → 用户确认后
  → RoomManager.resetAllSessionKeys()
  → 遍历所有参与者
  → 为每个生成新的时间戳 sessionKey
  → 更新 sessionKeyMap
  → 保存到 localStorage
  → RoomManager.clearMessages()
  → 重新渲染消息列表
  → 显示成功提示（"已重置 X 个 AI 的会话并清空消息"）
```

## 代码实现

### RoomManager 新增方法

#### generateDynamicSessionKey
```javascript
generateDynamicSessionKey(originalSessionKey) {
  const parts = originalSessionKey.split(':');
  if (parts.length !== 3) return originalSessionKey;

  const [, appid] = parts;
  const newSessionId = Date.now().toString();
  return `${parts[0]}:${appid}:${newSessionId}`;
}
```

#### addParticipant
```javascript
addParticipant(connId) {
  const conn = window.connectionManager.getConnection(connId);
  if (!conn) return false;

  if (!this.sessionKeyMap.has(connId)) {
    const dynamicKey = this.generateDynamicSessionKey(conn.sessionKey);
    this.sessionKeyMap.set(connId, {
      original: conn.sessionKey,
      dynamic: dynamicKey,
      timestamp: Date.now()
    });
    this.saveSessionKeys();
  }

  this.participantIds.add(connId);
  return true;
}
```

#### resetAllSessionKeys
```javascript
resetAllSessionKeys() {
  let count = 0;
  for (const connId of this.participantIds) {
    const mapping = this.sessionKeyMap.get(connId);
    if (mapping) {
      const newDynamic = this.generateDynamicSessionKey(mapping.original);
      mapping.dynamic = newDynamic;
      mapping.timestamp = Date.now();
      count++;
    }
  }
  this.saveSessionKeys();
  return count;
}
```

#### getDynamicSessionKey
```javascript
getDynamicSessionKey(connId) {
  const mapping = this.sessionKeyMap.get(connId);
  return mapping ? mapping.dynamic : null;
}
```

### MessageRouter 修改

```javascript
async _sendToConnection(conn, message, options = {}) {
  let sessionKey = conn.sessionKey;

  // 仅在房间模式下使用动态 key
  const isInRoomMode = this._isInRoomMode();
  if (isInRoomMode && window.roomManager) {
    const dynamicKey = window.roomManager.getDynamicSessionKey(conn.id);
    if (dynamicKey) {
      sessionKey = dynamicKey;
    }
  }

  // 发送消息使用 sessionKey
  const payload = JSON.stringify({
    type: 'req',
    id: requestId,
    method: 'chat.send',
    params: {
      sessionKey: sessionKey,
      message: finalMessage,
      deliver: false,
      idempotencyKey: requestId
    }
  });
}

_isInRoomMode() {
  const roomControls = document.getElementById('roomControls');
  return roomControls && roomControls.style.display === 'flex';
}
```

### Storage 新增方法

```javascript
const ROOM_SESSION_KEYS_KEY = 'roclaw.room.sessionKeys';

saveRoomSessionKeys(sessionKeyMap) {
  try {
    const obj = Object.fromEntries(sessionKeyMap);
    localStorage.setItem(ROOM_SESSION_KEYS_KEY, JSON.stringify(obj));
  } catch (error) {
    console.error('[Storage] Failed to save room sessionKeys:', error);
  }
}

getRoomSessionKeys() {
  try {
    const data = localStorage.getItem(ROOM_SESSION_KEYS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('[Storage] Failed to load room sessionKeys:', error);
    return {};
  }
}
```

### UI 修改

#### 新增按钮（选项 C：放在右侧最前面）
```html
<div class="room-controls" id="roomControls">
  <div class="room-participants">
    <!-- 参与者列表 -->
  </div>

  <div class="room-actions">
    <!-- 重置会话按钮：放在右侧最前面 -->
    <button class="btn btn-mini" id="resetAllSessionsBtn">
      重置会话
    </button>

    <label class="interaction-switch">
      <input type="checkbox" id="aiInteractionToggle">
      <span>AI交互</span>
    </label>

    <label class="interaction-switch">
      <input type="checkbox" id="loopEnabledToggle">
      <span>循环</span>
    </label>
  </div>
</div>
```

**布局效果**: `[重置会话] AI交互[☐] 循环[☐]`（从右到左顺序）

#### 事件绑定
```javascript
document.getElementById('resetAllSessionsBtn').addEventListener('click', async () => {
  // 检查是否有参与者
  if (window.roomManager.participantIds.size === 0) {
    showHint('房间中没有参与者');
    return;
  }

  // 显示确认对话框
  if (!confirm('确定要重置所有 AI 的会话并清空消息记录吗？')) {
    return;
  }

  // 重置所有会话密钥
  const count = window.roomManager.resetAllSessionKeys();

  // 清空消息记录
  window.roomManager.clearMessages();

  // 重新渲染消息列表
  UIManager._renderRoomMessages();

  showHint(`已重置 ${count} 个 AI 的会话并清空消息`);
});
```

## 错误处理

| 情况 | 处理方式 |
|------|----------|
| 原始 sessionKey 格式无效 | 保持原样，不生成动态 key |
| 连接断开后再重连 | 保持已有的动态 sessionKey |
| 用户在房间外重置连接配置 | 不影响房间内的动态 key |
| localStorage 存储失败 | 降级到内存存储（刷新后丢失） |
| 参与者被移出房间 | 保留其 sessionKey 映射（方便重新加入） |
| 重置会话操作 | 同时清空消息记录和重置 sessionKey |
| 空参与者列表时重置 | 显示提示"房间中没有参与者"，不执行操作 |
| 首次进入房间 | 自动为现有参与者生成动态 key |

## 修改的文件

| 文件 | 修改内容 |
|------|----------|
| `src/js/roomManager.js` | 新增 sessionKeyMap 管理、生成/重置方法 |
| `src/js/messageRouter.js` | 修改发送逻辑，仅在房间模式使用动态 key |
| `src/js/storage.js` | 新增 sessionKey 映射的存储/加载方法 |
| `src/index.html` | 新增"重置所有会话"按钮 |
| `src/js/ui.js` | 绑定重置按钮事件 |

## 设计原则

1. **最小范围修改** - 只修改公共聊天房间相关代码
2. **向后兼容** - 普通聊天模式完全不受影响
3. **用户可控** - 提供重置按钮让用户决定何时清除会话
4. **默认保留** - 默认保留会话上下文，方便连续对话

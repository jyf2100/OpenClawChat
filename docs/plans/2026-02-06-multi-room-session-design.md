# 多房间会话管理系统设计

## 概述

参考 ACP (Agent Client Protocol) 的 Session 管理概念，重构公共聊天房间系统，支持多个独立房间，每个房间可以有多个 AI Agent 参与。

## 背景

### 当前限制
- 只支持单个固定房间（"公共聊天"）
- ConnectionManager 和 RoomManager 职责不清
- 数据结构分散，难以扩展

### 目标
- 支持多个独立房间
- 统一的 Session 概念管理连接和房间
- 对齐 ACP 协议的 sessionKey 格式

---

## 核心概念

### Session 统一模型

```
┌─────────────────────────────────────────────────────────────┐
│                      SessionManager                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Connection  │  │   Room 1    │  │   Room 2    │        │
│  │ (1:1 会话)  │  │ (1:N 会话)  │  │ (1:N 会话)  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                           ↓
            ┌──────────────────────────┐
            │   ConnectionManager      │
            │   (WebSocket 连接池)     │
            └──────────────────────────┘
```

### Session Key 格式

```
agent:<agentId>:client:room:<roomName>:<timestamp>

示例：
agent:main:client:room:技术讨论:1738765200000
agent:design:client:room:技术讨论:1738765250000
agent:code:client:room:技术讨论:1738765300000
```

| 部分 | 说明 | 示例 |
|------|------|------|
| `agent` | 固定前缀 | `agent` |
| `<agentId>` | Agent ID | `main`, `design`, `code` |
| `client` | 渠道类型 | `client` (标识来自 Tauri 客户端) |
| `room` | 会话类型 | `room` |
| `<roomName>` | 规范化房间名 | `技术讨论` (原"技术:讨论") |
| `<timestamp>` | 时间戳 | `1738765200000` |

---

## 数据结构

### Session 数据结构

```javascript
// 连接型会话
{
  id: 'conn-1',
  type: 'connection',
  name: '默认连接',
  gatewayUrl: 'ws://localhost:18789',
  token: 'xxx',
  sessionKey: 'agent:main:main',
  messages: [],
  settings: {},
  createdAt: 1738765200000
}

// 房间型会话
{
  id: 'room-tech',
  type: 'room',
  name: '技术讨论',
  normalizedRoomName: '技术讨论',
  roomId: 'room:技术讨论',
  messages: [],
  participants: [
    {
      connId: 'conn-1',
      agentId: 'main',
      sessionKey: 'agent:main:main',
      dynamicKey: 'agent:main:client:room:技术讨论:1738765200000',
      name: 'AI助手'
    },
    {
      connId: 'conn-2',
      agentId: 'design',
      sessionKey: 'agent:design:design',
      dynamicKey: 'agent:design:client:room:技术讨论:1738765250000',
      name: '设计助手'
    }
  ],
  settings: {
    aiInteractionEnabled: true,
    conversationLoop: { enabled: false }
  },
  createdAt: 1738765200000
}
```

### localStorage 存储

```javascript
{
  'roclaw.sessions': {
    'conn-1': { /* Session 对象 */ },
    'room-tech': { /* Session 对象 */ }
  },
  'roclaw.activeSession': 'room-tech',
  'roclaw.migration.version': 2
}
```

---

## 架构设计

### SessionManager 类

```javascript
class SessionManager {
  constructor() {
    this.sessions = new Map();           // sessionId → Session
    this.activeSessionId = null;
    this.connectionManager = new ConnectionManager();
  }

  // ========== Session CRUD ==========
  createSession(type, config) { }
  switchSession(sessionId) { }
  deleteSession(sessionId) { }
  getSession(sessionId) { }
  getAllSessions() { }

  // ========== 房间专用 ==========
  createRoom(name, participantIds) { }
  addParticipantToRoom(roomId, connId) { }
  removeParticipantFromRoom(roomId, connId) { }

  // ========== 消息发送 ==========
  async sendMessage(sessionId, message) { }
  async sendMessageToRoom(roomId, message) { }

  // ========== 辅助方法 ==========
  normalizeRoomName(name) {
    return name
      .replace(/:/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[\/\\]/g, '-')
      .toLowerCase();
  }

  generateDynamicSessionKey(agentId, roomName, timestamp) {
    const normalized = this.normalizeRoomName(roomName);
    return `agent:${agentId}:client:room:${normalized}:${timestamp}`;
  }
}
```

---

## UI 设计

### 侧边栏布局

```
┌──────────────┐
│   +          │  ← 添加连接按钮
├──────────────┤
│   连接        │
├──────────────┤
│ 🔌 默认连接   │
│    ● 已连接   │
│ 🔌 测试环境   │
│    ○ 未连接   │
├──────────────┤
│   房间   +    │  ← 创建房间按钮
├──────────────┤
│ 🏠 技术讨论   │
│    (3) ⚙️    │
│ 🏠 代码审查   │
│    (2) ⚙️    │
└──────────────┘
```

### 主要界面

1. **创建房间模态框**
   - 输入房间名称
   - 选择参与者（多选）
   - 高级设置（可选）

2. **房间设置界面**
   - 参与者管理
   - 房间选项（AI 交互、对话循环）
   - 危险操作（重置会话、清空消息、删除房间）

---

## 实施计划

### Phase 1: 基础架构（1-2天）
- 新增 SessionManager 类
- 重构 ConnectionManager

### Phase 2: 房间功能（2-3天）
- 重构 RoomManager 为可实例化
- 修改 Storage 支持 Session

### Phase 3: UI 改造（2-3天）
- 修改侧边栏，添加房间列表
- 新增房间操作界面

### Phase 4: 消息路由（1-2天）
- 修改消息发送逻辑
- 修改消息接收逻辑

### Phase 5: 测试和优化（1-2天）
- 数据迁移测试
- UI 测试和优化

**总计**：约 7-12 天

---

## 文件变更清单

| 文件 | 操作 | 变更量 |
|------|------|--------|
| `src/js/sessionManager.js` | 新增 | +400 行 |
| `src/js/connectionManager.js` | 重构 | -150/+50 行 |
| `src/js/roomManager.js` | 重构 | -100/+200 行 |
| `src/js/storage.js` | 修改 | +80 行 |
| `src/js/ui.js` | 修改 | +150 行 |
| `src/js/app.js` | 修改 | +30 行 |
| `src/js/messageRouter.js` | 修改 | +40 行 |
| `src/js/dataMigration.js` | 新增 | +150 行 |
| `src/index.html` | 修改 | +50 行 |
| `src/styles/chat.css` | 修改 | +100 行 |

---

## 数据迁移

### 迁移策略

1. 连接数据 → Connection Session
2. 房间消息/设置 → Room Session
3. 保留原始 sessionKey
4. 生成新的动态 sessionKey

### 迁移代码

```javascript
const DataMigration = {
  VERSION: 2,

  migrate() {
    const sessions = {};

    // 迁移连接
    const connections = Storage.getConnections();
    for (const conn of connections) {
      sessions[conn.id] = {
        id: conn.id,
        type: 'connection',
        // ...
      };
    }

    // 迁移房间
    if (localStorage.getItem('roclaw.room.messages')) {
      sessions['room-public'] = {
        id: 'room-public',
        type: 'room',
        name: '公共聊天',
        // ...
      };
    }

    Storage.saveSessions(sessions);
    this._cleanupOldData();
    localStorage.setItem('roclaw.migration.version', this.VERSION);
  }
};
```

---

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 创建房间时名称为空 | 提示"请输入房间名称" |
| 房间名称包含特殊字符 | 自动规范化（替换 `:` 为 `-`） |
| 没有选择参与者创建房间 | 允许创建，稍后添加 |
| 参与者连接断开 | 标记为离线，保留在房间中 |
| 删除房间时有消息 | 提示确认，删除后不可恢复 |
| 数据迁移失败 | 保留旧数据，提示用户重试 |

---

## 设计原则

1. **统一抽象** - Session 作为统一概念
2. **向后兼容** - 自动迁移现有数据
3. **渐进增强** - 分阶段实施，每阶段可独立验证
4. **用户友好** - 简洁的 UI，清晰的操作流程

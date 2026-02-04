# 多连接管理功能设计文档

**日期**: 2026-02-04
**目标**: 为 OpenClaw 桌面应用添加多个配置连接的支持
**状态**: 设计完成，待实施

---

## 1. 概述

### 1.1 功能描述

支持用户同时管理多个网关连接配置，每个连接有独立的配置（网关地址、token、sessionKey）和独立的聊天历史。通过侧边栏列表管理多个连接，支持快速切换。

### 1.2 核心特性

- **侧边栏连接列表**: 左侧显示所有连接，点击切换
- **独立配置**: 每个连接有完整的独立配置
- **独立消息**: 每个连接有独立的聊天历史和消息队列
- **状态管理**: 实时显示连接状态（已连接/连接中/断开/错误）
- **未读计数**: 非活跃连接收到消息时显示未读数
- **持久化存储**: 配置和消息缓存保存在 localStorage

### 1.3 限制条件

- 最多支持 3-5 个同时活跃连接
- 单个连接最多缓存 1000 条消息
- 消息缓存超过 7 天自动清理

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Application                          │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  Sidebar     │         Main Chat Area                 │
│  (260px)     │         (flex: 1)                      │
│              │                                          │
│ ┌──────────┐ │  ┌─────────────────────────────────┐   │
│ │ Header   │ │  │ Status Bar                      │   │
│ │ + Title  │ │  ├─────────────────────────────────┤   │
│ ├──────────┤ │  │                                 │   │
│ │          │ │  │  Chat Thread (Active Conn)     │   │
│ │ Conn List│ │  │                                 │   │
│ │          │ │  │  - Messages                    │   │
│ │ Conn A ● │ │  │  - Stream                      │   │
│ │ Conn B ○ │ │  │  - Images                      │   │
│ │ Conn C ● │ │  │                                 │   │
│ ├──────────┤ │  ├─────────────────────────────────┤   │
│ │ Settings │ │  │ Input Area                      │   │
│ └──────────┘ │  └─────────────────────────────────┘   │
└──────────────┴──────────────────────────────────────────┘
```

### 2.2 数据结构

```javascript
// 连接配置
{
  id: string,              // 唯一 ID (conn-1, conn-2, ...)
  name: string,            // 连接名称（"生产环境"）
  gatewayUrl: string,      // 网关地址
  token: string,           // 认证令牌
  sessionKey: string,      // 会话标识
  status: 'connected' | 'connecting' | 'disconnected' | 'error',
  unreadCount: number,     // 未读消息数
  createdAt: number,       // 创建时间
  lastConnected: number    // 最后连接时间
}

// 全局状态
{
  activeConnectionId: string,    // 当前活跃连接 ID
  connections: Array,            // 所有连接配置
  connectionStates: Map,         // 每个连接的状态
  messageCache: Map,             // 每个连接的消息缓存
  scrollPositions: Map,          // 每个连接的滚动位置
  websockets: Map                // 每个连接的 WebSocket 实例
}
```

---

## 3. 用户界面设计

### 3.1 侧边栏布局

```
┌─────────────────────────┐
│  🔌 OpenClaw 对话      │
├─────────────────────────┤
│  [+]                   │
├─────────────────────────┤
│ ● 生产环境      (0)    │
│ ├─测试环境      (3)    │
│ ○ 开发环境      (0)    │
├─────────────────────────┤
│  ⚙️ 设置               │
└─────────────────────────┘
```

### 3.2 连接项样式

- **状态指示器**:
  - ● 绿色：已连接
  - ● 黄色：连接中
  - ○ 灰色：未连接
  - ● 红色：连接错误

- **当前活跃连接**: 蓝色左边框 + 深色背景

- **未读徽章**: 红色圆形，显示数字或 "99+"

### 3.3 弹窗设计

**添加/编辑连接**：

```
┌─────────────────────────────┐
│  添加连接                   │
├─────────────────────────────┤
│  名称: [我的测试环境      ] │
│                             │
│  网关 WS:                   │
│  [ws://localhost:18789    ] │
│                             │
│  令牌:                      │
│  [•••••••••••••••••••••  ] │
│                             │
│  会话:                      │
│  [agent:main:main        ] │
│                             │
│  [取消]        [保存]      │
└─────────────────────────────┘
```

**删除确认**：

```
┌─────────────────────────────┐
│  ⚠️ 确认删除                │
├─────────────────────────────┤
│                             │
│  确定要删除"生产环境"连接吗？│
│                             │
│  此操作将删除该连接的所有    │
│  聊天记录，无法恢复。        │
│                             │
│  [取消]        [删除]      │
└─────────────────────────────┘
```

---

## 4. 交互流程

### 4.1 添加连接

1. 点击侧边栏 `[+]` 按钮
2. 弹出"添加连接"对话框
3. 填写配置信息（名称、网关、令牌、会话）
4. 点击"保存"
5. 验证通过 → 保存到 localStorage
6. 新连接出现在列表中
7. 自动连接到新连接

### 4.2 切换连接

1. 用户在连接A中聊天
2. 收到连接B的新消息（未读数变成 1）
3. 点击连接B
4. 保存连接A的滚动位置
5. 切换到连接B
6. 未读数清零
7. 显示连接B的聊天历史

### 4.3 编辑连接

1. 右键点击连接 → 选择"编辑"
2. 弹出"编辑连接"对话框（预填充现有值）
3. 修改配置
4. 点击"保存"
5. 如果网关/token改变 → 断开并重新连接
6. 如果只是名称 → 仅更新显示

### 4.4 删除连接

1. 右键点击连接 → 选择"删除"
2. 确认对话框显示
3. 确认 → 删除配置和消息缓存
4. 如果是活跃连接 → 切换到其他连接

---

## 5. 文件结构

### 5.1 新增文件

```
src/js/
├── connectionManager.js    # 连接管理核心逻辑
├── ui.js                   # UI 操作和渲染
└── storage.js              # 存储封装
```

### 5.2 修改文件

```
src/
├── index.html              # 添加侧边栏结构
├── styles/
│   └── chat.css           # 添加侧边栏样式
└── js/
    └── app.js             # 改造为多连接状态管理
```

---

## 6. 关键实现

### 6.1 连接管理器 (connectionManager.js)

```javascript
class ConnectionManager {
  // CRUD 操作
  addConnection(config)
  updateConnection(id, config)
  deleteConnection(id)
  getConnection(id)
  getAllConnections()

  // 连接控制
  connect(id)
  disconnect(id)
  reconnect(id)
  getStatus(id)

  // 消息管理
  sendMessage(id, message)
  getMessages(id)
  markAsRead(id)

  // 状态管理
  setActiveConnection(id)
  getActiveConnection()
  switchConnection(id)
}
```

### 6.2 存储管理 (storage.js)

```javascript
const Storage = {
  // 连接配置
  getConnections()
  saveConnections(conns)

  // 消息缓存
  getMessages(connId)
  saveMessages(connId, msgs)
  clearMessages(connId)

  // 滚动位置
  getScrollPos(connId)
  saveScrollPos(connId, pos)

  // 活跃连接
  getActiveConnection()
  setActiveConnection(id)
}
```

### 6.3 连接切换逻辑

```javascript
function switchConnection(connId) {
  // 1. 保存当前连接状态
  const currentPos = elements.chatThread.scrollTop;
  Storage.saveScrollPos(appState.activeConnectionId, currentPos);

  // 2. 切换活跃连接
  appState.activeConnectionId = connId;

  // 3. 加载新连接消息
  const messages = Storage.getMessages(connId);
  appState.messageCache[connId] = messages;

  // 4. 重新渲染
  buildRenderedMessages();

  // 5. 恢复滚动位置
  const savedPos = Storage.getScrollPos(connId);
  if (savedPos) {
    elements.chatThread.scrollTop = savedPos;
  }

  // 6. 更新 UI
  updateActiveConnectionUI(connId);
  updateUnreadCount(connId, 0);
}
```

---

## 7. 数据存储

### 7.1 localStorage 键名

```javascript
const KEYS = {
  CONNECTIONS: "openclaw.connections",      // 连接配置列表
  ACTIVE_CONN: "openclaw.active_conn",      // 当前活跃连接
  MESSAGES_PREFIX: "openclaw.messages.",    // 消息缓存前缀
  SCROLL_PREFIX: "openclaw.scroll.",        // 滚动位置前缀
};
```

### 7.2 存储格式

```javascript
// openclaw.connections
{
  connections: [...],
  version: 1,
  activeConnectionId: "conn-1"
}

// openclaw.messages.conn-1
{
  sessionId: "agent:main:main",
  messages: [...],
  lastSync: 1704355200000
}

// openclaw.scroll.conn-1
1234  // 滚动位置
```

---

## 8. 错误处理

### 8.1 连接错误

| 错误类型 | 显示方式 | 处理方式 |
|---------|---------|---------|
| 网关无法访问 | 红色图标 | 自动重试 3 次 |
| Token 无效 | 错误提示 | 停止重试 |
| Session 不存在 | 错误提示 | 保持连接 |
| 超时 | 黄色图标 | 5 秒后重试 |

### 8.2 配置验证

```javascript
function validateConnection(config) {
  const errors = [];

  if (!config.name?.trim()) {
    errors.push("名称不能为空");
  }

  if (!config.gatewayUrl?.startsWith("ws://") &&
      !config.gatewayUrl?.startsWith("wss://")) {
    errors.push("网关地址必须以 ws:// 或 wss:// 开头");
  }

  if (config.token && config.token.length < 10) {
    errors.push("令牌长度至少 10 个字符");
  }

  if (!config.sessionKey?.includes(":")) {
    errors.push("会话格式错误");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

## 9. 性能考虑

### 9.1 缓存限制

- 单个连接最多缓存 1000 条消息
- 超过限制时，删除最旧的消息

### 9.2 清理策略

```javascript
// 定期清理旧消息
function cleanupOldMessages(connId) {
  const messages = Storage.getMessages(connId);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const filtered = messages.filter(m =>
    m.timestamp > sevenDaysAgo
  );

  // 保持最新 1000 条
  const trimmed = filtered.slice(-1000);

  Storage.saveMessages(connId, trimmed);
}
```

### 9.3 懒加载

- 切换连接时才加载消息历史
- 连接列表按需渲染

---

## 10. 实施步骤

### 10.1 Phase 1: 基础结构
- 创建侧边栏 HTML 结构
- 添加 CSS 样式
- 修改主布局为 flex

### 10.2 Phase 2: 状态管理
- 改造全局状态为多连接模式
- 实现 ConnectionManager 类
- 实现 Storage 模块

### 10.3 Phase 3: UI 交互
- 实现连接列表渲染
- 实现添加/编辑/删除连接
- 实现连接切换

### 10.4 Phase 4: 连接管理
- 实现多 WebSocket 管理
- 实现消息路由
- 实现未读计数

### 10.5 Phase 5: 测试与优化
- 添加单元测试
- 性能优化
- 错误处理完善

---

## 11. 验收标准

- [ ] 可以添加最多 5 个连接
- [ ] 可以切换连接，消息独立显示
- [ ] 连接状态正确显示
- [ ] 未读计数正确更新
- [ ] 配置可以持久化保存
- [ ] 编辑连接后正确重新连接
- [ ] 删除连接后数据清理
- [ ] 自动重连机制正常工作

---

**文档版本**: 1.0
**最后更新**: 2026-02-04

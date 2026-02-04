# 公共聊天房间功能设计文档

**日期**: 2026-02-04
**作者**: Claude + User
**状态**: 设计阶段

---

## 概述

在 RoClaw 桌面应用中添加一个**公共聊天房间**功能，允许用户与多个 AI 连接同时交互，类似群聊体验。

### 核心特性

- **广播消息**: 发送给所有连接的 AI
- **@提及**: 通过 @名字让特定 AI 单独回答
- **AI 交互模式**: AI 可以看到彼此的回复并继续讨论
- **自动重连**: @离线连接时自动尝试重连并发送消息
- **群聊风格**: 显示发送者名称，按时间排序

---

## 第 1 部分：核心架构

### 组件设计

#### 1. RoomManager（房间管理器）

```javascript
class RoomManager {
  constructor() {
    this.roomId = 'public-room';
    this.messages = [];  // 房间消息历史
    this.aiInteractionEnabled = false;  // AI 交互开关
  }

  // 添加消息到房间
  addMessage(message) { }

  // 获取房间消息历史
  getMessages() { }

  // 构建 AI 上下文（根据交互开关）
  buildContext(connId) { }
}
```

#### 2. MessageRouter（消息路由器）

```javascript
class MessageRouter {
  // 解析 @提及
  parseMentions(text) {
    // 返回: { cleanText, mentionedIds }
  }

  // 路由消息到目标连接
  async route(message, mentions) {
    // mentions 为空 → 广播到所有连接
    // mentions 有值 → 只发送到指定连接
  }
}
```

#### 3. InteractionSwitch（交互开关）

- 全局开关，存储在 `localStorage`
- 键名: `roclaw.room.ai_interaction`
- 开启时: AI 能看到彼此的回复
- 关闭时: AI 只看到用户的原始消息

### 数据流

```
用户输入 → MessageRouter 解析 @提及
            ↓
    判断目标连接（所有 or 特定）
            ↓
    根据 InteractionSwitch 决定上下文
            ↓
    发送消息到目标连接的 WebSocket
            ↓
    收到回复 → 添加到房间消息历史
            ↓
    更新 UI 显示
```

---

## 第 2 部分：UI 结构

### 侧边栏布局

```
侧边栏结构：
├── 🔌 RoClaw
├── [+] 添加连接
├── ─────────────
├── 🌐 公共聊天 ⭐  ← 新增，特殊样式
├── ─────────────
├── 默认连接
├── 生产环境
└── 测试环境
```

### 聊天区域

当切换到"公共聊天"时：
- 顶部显示参与中的 AI 连接（已连接的）
- 开关按钮：**AI 交互模式** [开启/关闭]
- 消息区域显示群聊风格的消息：
  ```
  [10:30] 你: 帮我解释一下什么是闭包？

  [10:31] 默认连接(AI): 闭包是指...

  [10:32] 生产环境(AI): 简单来说，闭包是...
  ```

### @提及的输入体验

- 输入 `@` 时，弹出连接列表补全
- 选择后显示为 `@默认连接 ` （高亮样式）
- 可以同时 @多个连接：`@默认连接 @生产环境 你们都好`

### 消息发送逻辑

| 条件 | 行为 |
|------|------|
| 无 @提及，交互关闭 | 每个 AI 独立回答，看不到其他回复 |
| 无 @提及，交互开启 | 每个 AI 回答，能看到之前的所有回复 |
| 有 @提及 | 只有被提到的 AI 回答 |

---

## 第 3 部分：数据结构与存储

### 存储键名

```javascript
Storage.ROOM_MESSAGES = "roclaw.room.messages";
Storage.AI_INTERACTION_ENABLED = "roclaw.room.ai_interaction";
```

### 消息数据结构

```javascript
{
  id: "room-msg-1234567890",
  roomId: "public-room",
  senderId: "user" | "conn-1" | "conn-2",
  senderName: "你" | "默认连接" | "生产环境",
  senderType: "user" | "ai",
  content: "消息内容",
  timestamp: 1707072000000,
  mentions: ["conn-1", "conn-2"],  // @提到的连接 ID（可选）
  replyTo: "room-msg-xxx",  // 回复的消息 ID（可选）
}
```

### ConnectionManager 扩展

```javascript
class ConnectionManager {
  constructor() {
    // ... 现有属性
    this.publicRoomEnabled = false;
    this.aiInteractionEnabled = false;
    this.roomMessages = [];
  }

  // 获取参与房间的连接
  getParticipants() {
    return this.connections.filter(conn =>
      this.connectionStates.get(conn.id)?.status === 'connected'
    );
  }
}
```

### 消息分发逻辑

```javascript
async function sendToRoom(message, mentions = []) {
  const participants = getParticipants();
  const targets = mentions.length > 0
    ? participants.filter(p => mentions.includes(p.id))
    : participants;

  const context = aiInteractionEnabled
    ? buildContextWithHistory()  // 包含 AI 之间的对话
    : { content: message };  // 只有原始消息

  for (const conn of targets) {
    await sendToConnection(conn, context);
  }
}
```

---

## 第 4 部分：错误处理与边界情况

### 连接状态处理

**场景 1：部分连接离线**
- 只发送给已连接的参与者
- 显示提示：`"生产环境" 离线，未收到消息`

**场景 2：所有连接离线**
- 显示提示：`暂无可用连接，请先连接至少一个 AI`
- 禁用消息输入框

### @提及的边界情况

**场景 1：@不存在的连接**
- 输入：`@不存在的连接 你好`
- 处理：显示提示：`"不存在的连接" 未找到，跳过`

**场景 2：@离线的连接（自动重连）**
- 输入：`@离线连接 你好`
- 处理：
  1. 自动尝试重连该连接
  2. 连接成功后发送消息
  3. 显示提示：`正在重连 "离线连接"...`
  4. 如果重连失败，显示：`"离线连接" 重连失败，无法发送`

### 重连策略

```javascript
async function handleMentionedConnection(connId, message) {
  const conn = getConnection(connId);
  const state = connectionStates.get(connId);

  if (state.status === 'connected') {
    await sendToConnection(conn, message);
  } else {
    showStatus(`正在重连 "${conn.name}"...`);

    try {
      await connect(connId);
      await sendToConnection(conn, message);
      showStatus(`"${conn.name}" 已连接并发送消息`);
    } catch (error) {
      showStatus(`"${conn.name}" 重连失败: ${error.message}`, 'error');
    }
  }
}
```

### 超时处理

- 单次重连超时：5 秒
- 如果超时，显示：`"${conn.name}" 连接超时，已取消`
- 用户可以稍后手动重试

### AI 交互模式限制

**开启时：**
- 只发送最近 N 条消息（如最近 20 条）
- 避免单个请求过大

**关闭时：**
- AI 回复彼此独立
- 响应更快

### 并发处理

- 使用消息 ID 避免混乱
- UI 按接收顺序显示
- 支持流式响应，每个 AI 独立显示

---

## 第 5 部分：实现计划

### 阶段 1：基础架构

1. 创建 `RoomManager` 类
2. 添加"公共聊天"选项到侧边栏
3. 实现基本的广播消息功能
4. 实现消息显示（群聊风格）

### 阶段 2：@提及功能

1. 实现消息路由器（解析 @提及）
2. 添加输入框的 @补全功能
3. 实现定向发送
4. 处理 @离线连接的重连逻辑

### 阶段 3：AI 交互模式

1. 添加 AI 交互开关 UI
2. 实现上下文构建逻辑
3. 处理长上下文的截取
4. 优化消息历史加载

### 阶段 4：完善与优化

1. 错误处理与用户提示
2. 消息持久化存储
3. 性能优化（并发处理）
4. 用户体验优化

### 关键文件变更

```
新增文件：
src/js/roomManager.js        # 房间管理器
src/js/messageRouter.js      # 消息路由器

修改文件：
src/js/connectionManager.js  # 添加房间参与者管理
src/js/ui.js                 # 添加房间 UI 相关方法
src/js/app.js                # 集成房间功能
src/index.html               # 添加房间界面元素
src/styles/chat.css          # 添加房间样式
```

---

## 成功标准

- ✅ 用户可以与所有 AI 同时对话
- ✅ 通过 @名字让特定 AI 回答
- ✅ AI 交互开关控制 AI 是否看到彼此的回复
- ✅ 离线连接自动重连
- ✅ 消息正确持久化存储
- ✅ 群聊风格的消息显示

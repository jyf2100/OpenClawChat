# Roclaw Tauri Desktop 项目总结

## 1. 项目概述

**Roclaw Tauri Desktop** 是一个基于 Tauri 2.0 的跨平台桌面应用客户端，用于连接 OpenClaw 网关服务，实现 AI 聊天和多智能体协作功能。

---

## 2. 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Tauri | 2.0 |
| 前端 | React | 19.1.0 |
| 语言 | TypeScript | 5.8 |
| 构建工具 | Vite | 7.0 |
| 样式 | Tailwind CSS | 4.1 |
| 状态管理 | Zustand | 5.0 |
| 桌面存储 | @tauri-apps/plugin-store | 2.4 |
| 工具库 | lodash-es | 4.17 |

---

## 3. 项目结构

```
src/
├── App.tsx                 # 应用入口，路由和全局状态管理
├── main.tsx               # React 挂载点
├── components/
│   ├── chat/              # 聊天组件
│   │   ├── Chat.tsx       # 聊天容器
│   │   ├── MessageList.tsx# 消息列表（虚拟滚动）
│   │   ├── MessageItem.tsx# 单条消息渲染
│   │   ├── InputArea.tsx  # 消息输入区域
│   │   ├── ContextMenu.tsx# 右键菜单
│   │   ├── ImagePreview.tsx
│   │   └── LazyImage.tsx
│   ├── gateway/           # 网关管理组件
│   │   ├── GatewayList.tsx    # 网关列表
│   │   ├── GatewayCard.tsx    # 网关卡片
│   │   ├── GatewayForm.tsx    # 网关表单
│   │   ├── AgentConfigPage.tsx# Agent 配置页面
│   │   └── AgentFileEditor.tsx# Agent 文件编辑器
│   ├── layout/            # 布局组件
│   │   ├── Header.tsx     # 顶部栏
│   │   ├── Sidebar.tsx    # 侧边栏
│   │   └── MainChat.tsx   # 主聊天区域
│   ├── room/              # 房间管理组件
│   │   ├── RoomList.tsx   # 房间列表
│   │   ├── RoomCard.tsx   # 房间卡片
│   │   ├── RoomForm.tsx   # 房间表单
│   │   ├── CreateRoomModal.tsx
│   │   ├── CollaborationRoomForm.tsx
│   │   ├── CollaborationStatusIndicator.tsx
│   │   └── ParticipantList.tsx
│   └── ui/                # 通用 UI 组件
│       └── Toast.tsx      # 通知提示
├── hooks/                 # 自定义 Hooks
│   ├── useWebSocket.ts    # WebSocket 通信
│   ├── useCollaboration.ts# 协作功能
│   ├── useMessages.ts     # 消息管理
│   ├── useTheme.ts        # 主题切换
│   ├── useKeyboardShortcuts.ts
│   ├── useDebounce.ts
│   ├── useThrottle.ts
│   └── ...
├── stores/                # Zustand 状态管理
│   ├── gatewayStore.ts    # 网关状态
│   ├── roomStore.ts       # 房间和消息状态
│   ├── collaborationStore.ts      # 协作会话状态
│   ├── collaborationQueueStore.ts # 协作消息队列
│   ├── sidebarStore.ts    # 侧边栏状态
│   └── toastStore.ts      # 通知状态
├── lib/                   # 工具库
│   ├── storage.ts         # 数据持久化
│   └── protocol.ts        # 协议工具
├── types/                 # TypeScript 类型定义
│   └── index.ts
└── styles/                # 全局样式
    └── globals.css
```

---

## 4. 核心功能模块

### 4.1 网关管理

| 组件 | 功能 |
|------|------|
| GatewayList | 网关列表展示，支持删除确认 |
| GatewayCard | 单个网关卡片，显示连接状态、快捷操作 |
| GatewayForm | 网关添加/编辑表单，支持默认模型配置 |
| AgentConfigPage | Agent 配置页面，从服务端加载 Agent 列表 |
| AgentFileEditor | 编辑 SOUL.md、AGENTS.md 等配置文件 |

**网关配置字段：**
```typescript
interface GatewayConfig {
  id: string;
  name: string;
  url: string;           // WebSocket 地址
  token?: string;        // 认证令牌
  status: GatewayStatus; // 连接状态
  autoConnect?: boolean; // 自动连接
  defaultModel?: string; // 默认模型
  agentConfigs?: Record<string, AgentConfig>;
}
```

### 4.2 聊天功能

- **流式消息**：支持 AI 响应实时流式输出
- **消息渲染**：支持文本、图片、代码高亮
- **虚拟滚动**：使用 react-window 优化长列表
- **上下文菜单**：复制、删除、引用等操作

### 4.3 房间管理

- **房间类型**：channel / private / group
- **房间模式**：单网关 / 协作模式
- **房间操作**：创建、编辑、删除、置顶

---

## 5. 状态管理

### 5.1 Store 职责

| Store | 职责 |
|-------|------|
| `gatewayStore` | 网关配置、连接状态、默认模型 |
| `roomStore` | 房间列表、消息存储、活跃房间 |
| `collaborationStore` | 协作会话状态、步骤进度、参与者管理 |
| `collaborationQueueStore` | 协作消息队列、待处理计数 |
| `sidebarStore` | 侧边栏展开/折叠状态 |
| `toastStore` | 全局通知消息 |

### 5.2 数据流

```
用户操作 → Action → Store 更新 → UI 重渲染
                ↓
            持久化存储 (Tauri Store)
```

---

## 6. 通信机制

### 6.1 WebSocket 通信

使用 Tauri Rust 层管理 WebSocket 连接，支持 JSON-RPC 风格的请求/响应。

**主要 API 方法：**

| 方法 | 说明 |
|------|------|
| `agents.list` | 获取 Agent 列表 |
| `sessions.list` | 获取会话列表和默认配置 |
| `agents.files.get` | 获取 Agent 文件内容 |
| `agents.files.set` | 设置 Agent 文件内容 |
| `chat.send` | 发送聊天消息 |

### 6.2 请求示例

```typescript
// 获取 Agent 列表
const result = await request(gatewayId, 'agents.list', {});

// 发送聊天消息
await request(gatewayId, 'chat.send', {
  sessionKey: 'agent:main:main',
  message: '用户消息',
  deliver: true,
});
```

---

## 7. 数据持久化

使用 `@tauri-apps/plugin-store` 将数据存储到本地 JSON 文件。

**存储键：**

| 键名 | 内容 |
|------|------|
| `clawchat.gateways` | 网关配置列表 |
| `clawchat.rooms` | 房间配置列表 |
| `clawchat.messages` | 消息历史（按房间分组） |
| `clawchat.settings` | 应用设置 |

**特性：**
- 支持批量写入和防抖优化
- 自动从 localStorage 迁移数据
- 加密存储敏感信息

---

## 8. 房间功能 - 智能体网络 + OpenClaw

### 8.1 房间类型架构

```typescript
interface Room {
  id: string;
  gatewayId: string;
  name: string;
  type: "channel" | "private" | "group";
  roomType?: 'single-gateway' | 'collaboration';
  collaboration?: CollaborationConfig;
  unreadCount: number;
  lastMessage?: Message;
  pinned?: boolean;
  order?: number;
}
```

### 8.2 两种房间模式

#### 单网关房间
- 连接**一个** OpenClaw 网关
- 与该网关下的**单个 Agent** 对话
- 消息流程：`用户消息 → 网关 → Agent → 响应`

#### 协作房间
- 可连接**多个网关**的**多个 Agent**
- 支持按顺序执行多智能体对话
- 消息流程：`用户消息 → Agent1 → Agent2 → ... → 最终响应`

### 8.3 协作参与者

```typescript
interface CollaborationParticipant {
  gatewayId: string;    // 网关 ID
  agentId: string;      // Agent ID（如 "main"）
  order: number;        // 执行顺序
  isActive: boolean;    // 是否激活
  name: string;         // 显示名称
  avatar?: string;      // 头像
  color?: string;       // 消息颜色标识
}
```

### 8.4 协作执行流程

```
┌─────────────────────────────────────────────────────────────┐
│  用户发送消息                                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  1. startCollaboration()                                    │
│     - 保存用户消息                                           │
│     - 创建协作会话 (sessionId)                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. processNextStep() - 循环执行每个参与者                    │
│     ├─ 获取当前参与者 (按 order 顺序)                        │
│     ├─ 确保网关已连接                                        │
│     ├─ 构建带历史的消息 (buildMessageWithHistory)            │
│     ├─ 调用 chat.send API                                   │
│     └─ 等待响应...                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. onStepResponse() - 流式响应处理                          │
│     - 实时更新消息内容                                       │
│     - 显示参与者名称和颜色                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. onStepComplete() - 步骤完成                              │
│     - 标记当前步骤完成                                       │
│     - 继续下一个参与者 (continueToNext)                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    所有参与者完成后
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. onCollaborationComplete()                               │
│     - 检查消息队列                                           │
│     - 如有待处理消息，继续新一轮协作                          │
└─────────────────────────────────────────────────────────────┘
```

### 8.5 消息历史构建

协作模式下，每个 Agent 收到的消息包含**完整对话历史**：

```
【用户】请帮我分析这段代码...

【Claude】我来分析这段代码...
首先，这段代码实现了...

【GPT】补充一下 Claude 的分析...
另外还需要注意...

【当前用户】继续分析...
```

### 8.6 @提及功能

协作房间支持 **@提及** 来指定特定 Agent：

```typescript
// 解析 @mentions
const mentions = parseMentions('@Claude 请分析代码 @GPT 补充建议');
// → ['Claude', 'GPT']

// 过滤参与者
const filteredParticipants = filterParticipantsByMentions(
  allParticipants,
  mentions
);
```

### 8.7 消息队列机制

协作进行中收到的消息会进入**队列等待**：

```typescript
// 协作完成时自动处理队列
if (hasPending(roomId)) {
  const nextMessage = dequeue(roomId);
  await startCollaboration(roomId, nextMessage.content, participants);
}
```

---

## 9. Agent 配置功能

### 9.1 功能概述

- 从服务端加载 Agent 列表
- 配置 SOUL.md、AGENTS.md、USER.md、TOOLS.md、HEARTBEAT.md
- 支持模型设置（跟随网关默认/自定义）
- 一键从服务端加载/推送配置

### 9.2 配置文件说明

| 文件 | 说明 |
|------|------|
| SOUL.md | Agent 人格定义 |
| AGENTS.md | 工作区指令 |
| USER.md | 用户档案 |
| TOOLS.md | 工具配置 |
| HEARTBEAT.md | 心跳任务 |

### 9.3 API 调用

```typescript
// 获取默认模型配置
const sessionsResult = await request(gatewayId, 'sessions.list', { limit: 1 });
const defaultModel = sessionsResult.defaults.model;

// 获取文件内容
const fileResult = await request(gatewayId, 'agents.files.get', {
  agentId: 'main',
  name: 'SOUL.md'
});
const content = fileResult.file?.content;

// 设置文件内容
await request(gatewayId, 'agents.files.set', {
  agentId: 'main',
  name: 'SOUL.md',
  content: '...'
});
```

---

## 10. 打包发布

```bash
# 开发模式
npm run tauri dev

# 生产打包
npm run tauri build
```

**打包产物：**
- macOS: `Roclaw.app` + `Roclaw_1.0.0_aarch64.dmg` (~3.5MB)

**输出路径：**
```
src-tauri/target/release/bundle/
├── macos/Roclaw.app
└── dmg/Roclaw_1.0.0_aarch64.dmg
```

---

## 11. 开发指南

### 11.1 环境要求

- Node.js 18+
- Rust 1.70+
- Tauri CLI 2.0

### 11.2 常用命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run tauri dev

# 类型检查
npx tsc --noEmit

# 打包应用
npm run tauri build
```

### 11.3 代码规范

- 使用 TypeScript 严格模式
- 组件使用函数式组件 + Hooks
- 状态管理使用 Zustand
- 样式使用 Tailwind CSS

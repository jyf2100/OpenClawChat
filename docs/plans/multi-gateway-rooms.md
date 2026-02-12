# 多网关房间功能设计

## 需求背景

当前实现中，每个房间只能关联一个网关（`gatewayId: string`）。实际应用中，需要支持多个网关的 Agent 在同一房间内协作交互。

## 功能目标

1. **多网关参与**：一个房间可以包含多个网关
2. **消息广播**：用户消息发送到房间所有网关
3. **会话隔离**：每个网关拥有独立的会话上下文
4. **对话循环**：AI 之间可以轮流对话

## 数据结构设计

### Room 类型

```typescript
interface Room {
  id: string;                          // 唯一标识
  name: string;                        // 房间名称
  type: 'room';                        // 类型
  gatewayIds: string[];                // 参与的网关 ID 列表（多个）
  participants: Participant[];         // 参与者详情
  settings: RoomSettings;
  messages: Message[];
  createdAt: number;
  pinned?: boolean;
  order?: number;
}
```

### Participant 类型

```typescript
interface Participant {
  gatewayId: string;                   // 关联的网关 ID
  agentId: string;                     // Agent ID
  name: string;                        // 显示名称
  dynamicSessionKey: string;           // 动态会话键（会话隔离）
  avatarUrl?: string;                  // 头像
  status: 'active' | 'inactive';       // 参与状态
}
```

### RoomSettings 类型

```typescript
interface RoomSettings {
  aiInteractionEnabled: boolean;       // AI 是否参与互动
  conversationLoop: {                  // 对话循环
    enabled: boolean;
    maxRounds: number;
    delaySeconds: number;
  };
}
```

## 动态 SessionKey 生成

```typescript
function generateDynamicSessionKey(
  originalKey: string,
  roomId: string,
  gatewayId: string
): string {
  const normalized = roomId.toLowerCase().replace(/\s+/g, '-');
  const timestamp = Date.now();
  // 格式: agent:main:client:room:{normalized_room_name}:{gatewayId}:{timestamp}
  return `${originalKey}:client:room:${normalized}:${gatewayId}:${timestamp}`;
}
```

## 消息流程

```
用户发送消息 "分析这个代码"
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  房间控制器 (Room Controller)                        │
│  - 获取房间所有参与者                                │
│  - 为每个参与者生成独立消息                          │
└─────────────────────────────────────────────────────┘
    │
    ├─────────────────────────────────────────────────┐
    │                    │                             │
    ▼                    ▼                             ▼
网关A                 网关B                          网关C
Session:             Session:                       Session:
agent:main:          agent:main:                    agent:main:
client:room:         client:room:                   client:room:
chat-room:           chat-room:                     chat-room:
gw-001:ts1           gw-002:ts2                     gw-003:ts3
    │                    │                             │
    ▼                    ▼                             ▼
AI-A 回复            AI-B 回补                      AI-C 补充
    │                    │                             │
    └────────────────────┴─────────────────────────────┘
                         │
                         ▼
                 显示所有回复
```

## UI/UX 设计

### 房间列表
- 显示所有房间（不依赖当前选中网关）
- 房间卡片显示参与网关数量（如"3个网关"）
- 点击房间显示参与网关列表

### 创建房间
```
┌──────────────────────────────────────┐
│  创建房间                            │
├──────────────────────────────────────┤
│  房间名称: [_______________]         │
│                                      │
│  选择网关:                           │
│  ☑ 本地网关 (已连接)                 │
│  ☐ 生产网关 (未连接)                 │
│  ☐ 测试网关 (已连接)                 │
│                                      │
│  AI 互动设置:                        │
│  ☑ 启用 AI 对话循环                  │
│  最大轮次: [3]                       │
│  延迟(秒): [2]                       │
│                                      │
│        [取消]           [创建]       │
└──────────────────────────────────────┘
```

### 房间详情
```
┌──────────────────────────────────────┐
│  代码评审室                    [设置]│
├──────────────────────────────────────┤
│  参与者 (3):                         │
│  ┌────────────────────────────┐     │
│  │ 🟢 本地网关 - GPT-4        │     │
│  │ Session: agent:main:...:gw1 │     │
│  └────────────────────────────┘     │
│  ┌────────────────────────────┐     │
│  │ 🟢 生产网关 - Claude-3.5   │     │
│  │ Session: agent:main:...:gw2 │     │
│  └────────────────────────────┘     │
│  ┌────────────────────────────┐     │
│  │ ⚫ 测试网关 - 离线          │     │
│  └────────────────────────────┘     │
└──────────────────────────────────────┘
```

## 需要修改的文件

### 1. 类型定义
**文件**: `src/types/index.ts`

```diff
export interface Room {
  id: string;
- gatewayId: string;
+ gatewayIds: string[];
+ participants: Participant[];
+ settings?: RoomSettings;
  name: string;
  ...
}

+ export interface Participant {
+   gatewayId: string;
+   agentId: string;
+   name: string;
+   dynamicSessionKey: string;
+   avatarUrl?: string;
+   status: 'active' | 'inactive';
+ }
+
+ export interface RoomSettings {
+   aiInteractionEnabled: boolean;
+   conversationLoop: {
+     enabled: boolean;
+     maxRounds: number;
+     delaySeconds: number;
+   };
+ }
```

### 2. Sidebar 组件
**文件**: `src/components/layout/Sidebar.tsx`

- 移除 `activeGateway` 过滤逻辑
- 显示所有房间
- 房间卡片显示参与网关数量

### 3. 创建房间模态框
**文件**: `src/components/room/CreateRoomModal.tsx`

- 添加多网关选择功能
- 添加对话循环设置

### 4. 房间 Store
**文件**: `src/stores/roomStore.ts`

- 更新 `addRoom` 支持多网关
- 添加参与者管理方法
- 添加消息广播方法

### 5. 消息发送逻辑
**文件**: `src/App.tsx` 或新建 `src/lib/roomController.ts`

- 实现消息广播到所有参与网关
- 实现对话循环逻辑

### 6. 房间详情组件
**新建**: `src/components/room/RoomDetail.tsx`

- 显示参与者列表
- 管理参与者状态

## 实施步骤

### Phase 1: 类型重构
1. 修改 `Room` 类型定义
2. 添加 `Participant` 和 `RoomSettings` 类型
3. 更新相关组件的类型注解

### Phase 2: UI 改造
1. 修改 Sidebar 显示逻辑
2. 重构 CreateRoomModal 支持多网关选择
3. 添加 RoomDetail 组件

### Phase 3: 核心逻辑
1. 实现房间控制器
2. 实现消息广播
3. 实现会话隔离

### Phase 4: 高级功能
1. 实现对话循环
2. 添加参与者管理
3. 添加房间设置

## 待解决问题

1. **向后兼容**：如何处理现有的单网关房间？
2. **离线网关**：参与网关离线时如何处理消息？
3. **状态同步**：如何同步不同网关的连接状态？
4. **消息去重**：如何避免重复消息？

## 参考文档

- `/Volumes/work/workspace/clawchat/房间消息交互机制.md` - SessionKey 格式、广播机制
- `/Volumes/work/workspace/clawchat/docs/groups.md` - 群组交互
- `/Volumes/work/workspace/clawchat/.worktrees/tauri-desktop/docs/plans/optimized-marinating-tower.md` - 原始设计计划

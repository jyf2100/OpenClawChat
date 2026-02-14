# 多机器人串行协作功能 - 实施方案

**创建日期**: 2026-02-12  
**状态**: 实施中  
**预计时间**: 6 天

---

## 一、需求概述

实现多机器人串行协作功能：
- 创建协作房间，包含多个 Gateway 的 Agent
- 用户发送消息后，Agent 按顺序串行回复
- 每个 Agent 能看到用户消息 + 之前所有 Agent 的回复
- 消息按时间顺序显示，标识来源 Agent

---

## 二、核心设计

### 2.1 SessionKey 格式

| 位置 | 格式 | 示例 |
|------|------|------|
| 客户端（房间ID） | `gateway-id:agent:<agentId>:main` | `gpt-gateway:agent:designer:main` |
| 网关端（协议中） | `agent:<agentId>:main` | `agent:designer:main` |

### 2.2 消息流程

```
用户发送消息
    ↓
创建 CollaborationSession
    ↓
for each participant in order:
    ↓
  构造消息（包含历史上下文）
    ↓
  发送到 Gateway[i] 的 Agent
    ↓
  等待响应（delta → final）
    ↓
  收到响应，添加到 Room
    ↓
  标记完成，继续下一个
```

### 2.3 需求确认汇总

| 问题 | 答案 |
|------|------|
| 消息历史传递 | 每个机器人能看到用户消息 + 之前所有机器人的回复 |
| SessionKey 冲突 | 使用标准 agent sessionKey 格式 |
| 状态持久化 | 需要，刷新页面后恢复协作 |
| 中途打断 | 等待当前协作完成后开始新协作（队列机制） |
| 协作失败处理 | 继续，不终止整个协作 |
| 多轮协作 | 无限继续直到用户主动停止 |
| 消息分组 | 保持普通消息的时间顺序 |
| 参与者标识 | 显示 Gateway 名称 + 头像/颜色 |
| 状态指示器 | 顶部 |

---

## 三、文件清单

### 新建文件（5个）

1. `src/stores/collaborationStore.ts` - 协作状态管理
2. `src/stores/collaborationQueueStore.ts` - 协作队列管理
3. `src/hooks/useCollaboration.ts` - 协作 Hook
4. `src/components/room/CollaborationRoomForm.tsx` - 协作房间表单
5. `src/components/room/CollaborationStatusIndicator.tsx` - 状态指示器

### 修改文件（6个）

1. `src/types/index.ts` - 扩展类型定义
2. `src/App.tsx` - 添加协作消息发送逻辑
3. `src/components/room/CreateRoomModal.tsx` - 添加协作房间选项
4. `src/components/chat/MessageItem.tsx` - 显示协作标签
5. `src/components/layout/MainChat.tsx` - 添加状态指示器
6. `src/styles/globals.css` - 协作样式

---

## 四、实施阶段

### Phase 1: 数据层（1.5天） ✅ 完成

- [x] 扩展类型定义 `src/types/index.ts`
- [x] 创建协作状态 Store `src/stores/collaborationStore.ts`
- [x] 创建协作队列 Store `src/stores/collaborationQueueStore.ts`

### Phase 2: 业务逻辑（2天） ✅ 完成

- [x] 创建协作 Hook `src/hooks/useCollaboration.ts`
- [x] 修改 App.tsx 集成协作逻辑
- [x] 处理协作消息响应

### Phase 3: UI 组件（2天） ✅ 完成

- [x] 创建协作房间表单 `src/components/room/CollaborationRoomForm.tsx`
- [x] 创建状态指示器 `src/components/room/CollaborationStatusIndicator.tsx`
- [x] 修改房间创建模态框 `src/components/room/CreateRoomModal.tsx`
- [x] 扩展消息显示 `src/components/chat/MessageItem.tsx`
- [x] 修改主聊天区域 `src/components/layout/MainChat.tsx`

### Phase 4: 样式和测试（0.5天）

- [x] 添加协作样式 `src/styles/globals.css`
- [ ] 功能测试
- [ ] Bug 修复

---

## 五、数据模型

### 5.1 类型定义

```typescript
// 协作参与者
interface CollaborationParticipant {
  gatewayId: string;      // 网关 ID
  agentId: string;        // Agent ID
  order: number;          // 顺序
  isActive: boolean;      // 是否参与
  name: string;           // 显示名称
  avatar?: string;        // 头像字符
  color?: string;         // 主题色
}

// 协作配置
interface CollaborationConfig {
  participants: CollaborationParticipant[];
  autoContinue: boolean;
  allowIntervention: boolean;
}

// 协作会话状态
interface CollaborationSession {
  sessionId: string;
  roomId: string;
  status: 'idle' | 'active' | 'paused' | 'completed';
  currentStep: number;
  participants: CollaborationParticipant[];
  userMessageId: string;
  userMessage: string;
  completedSteps: number[];
  failedSteps: Record<number, string>;
  createdAt: number;
  updatedAt: number;
}

// Room 扩展
interface Room {
  // ... 现有字段
  roomType: 'single-gateway' | 'collaboration';
  collaboration?: CollaborationConfig;
}

// ChatMessage 扩展
interface ChatMessage {
  // ... 现有字段
  collaborationContext?: {
    sessionId: string;
    step: number;
    participantName: string;
  };
}
```

---

## 六、核心函数

### 6.1 发送消息到参与者

```typescript
async function sendToParticipant(
  participant: CollaborationParticipant,
  message: string
) {
  const protocolSessionKey = `agent:${participant.agentId}:main`;
  
  await request(participant.gatewayId, 'chat.send', {
    sessionKey: protocolSessionKey,
    message: message,
    deliver: true,
  });
}
```

### 6.2 构造历史上下文

```typescript
function buildMessageWithHistory(session: CollaborationSession): string {
  const allMessages = getMessages(session.roomId);
  
  const historyLines = allMessages.map(msg => {
    if (msg.role === 'user') {
      return `【用户】${extractText(msg)}`;
    } else if (msg.collaborationContext) {
      return `【${msg.collaborationContext.participantName}】${extractText(msg)}`;
    }
    return `【助手】${extractText(msg)}`;
  });
  
  return `
[协作上下文]
${historyLines.join('\n\n')}

[当前任务]
${session.userMessage}
`;
}
```

---

## 七、UI 设计

### 7.1 协作房间创建

- 房间类型选择（单网关 / 协作）
- 参与者列表管理（添加/删除/排序）
- 每个参与者配置：Gateway ID, Agent ID, 显示名称

### 7.2 状态指示器（顶部）

- 当前状态（协作进行中...）
- 当前进度（完成/总数）
- 进度点（每个参与者的状态）
- 队列消息数
- 取消按钮

### 7.3 消息显示

- 协作标签（参与者名称 + 颜色）
- 保持时间顺序

---

## 八、测试清单

- [ ] 创建协作房间
- [ ] 添加/删除参与者
- [ ] 发送消息触发协作
- [ ] 消息按顺序显示
- [ ] 参与者标识正确
- [ ] 状态指示器正常
- [ ] 队列机制正常
- [ ] 刷新页面恢复状态
- [ ] 取消协作功能
- [ ] 失败处理正常

---

## 九、风险和缓解

| 风险 | 缓解措施 |
|------|----------|
| 状态管理复杂 | 使用 Zustand persist，简化数据结构 |
| 消息同步问题 | 使用 sessionId + stepIndex 精确匹配 |
| 连接不稳定 | 添加重试机制，失败后继续下一个 |
| UI 性能 | 使用 React.memo 优化渲染 |

---

## 十、后续优化

1. 并行协作模式
2. 协作模板保存
3. 协作历史查看
4. 可视化图表
5. 导出功能

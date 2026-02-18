# 协作房间多轮对话方案

## 概述

**目标**：实现协作房间的多轮对话功能，支持 Agent 循环执行直到任务完成。

**策略**：智能策略 - 裁判 Agent 协调 + 最大轮次兜底

---

## 核心设计

### 协作流程

```
Round 1:
  Agent1 → Agent2 → Agent3
      │
      ▼
  裁判Agent
      │
      ├─ 总结本轮成果
      ├─ 指出问题和不足
      ├─ 给出下一轮建议
      └─ 决定是否继续
      │
      ▼ shouldContinue: true

Round 2:
  Agent1 → Agent2 → Agent3
      │
      ▼
  裁判Agent
      │
      └─ shouldContinue: false → 终止
```

### 裁判模式

| 模式 | 条件 | 决策方式 |
|------|------|----------|
| **AI 裁判** | 配置了 `judge` | Agent 自动总结 + 判断 |
| **人工裁判** | 未配置 `judge` | 用户手动决定 |

### 终止条件

| 优先级 | 条件 | 说明 |
|--------|------|------|
| 1 | 裁判/用户决定 | AI: `shouldContinue: false` / 人工: 点击"完成" |
| 2 | 最大轮次 | `currentRound >= maxRounds` |
| 3 | 用户中断 | 点击"停止"按钮 |

### 裁判 Agent 职责

1. **总结**：概括本轮各 Agent 的贡献
2. **问题发现**：指出遗漏、错误或不足
3. **建议**：给出下一轮的改进方向
4. **终止判断**：决定任务是否完成

### @提及与多轮

用户在第一轮消息中使用 @提及 时：
- **第一轮**：只有被 @ 的 Agent 参与
- **后续轮次**：使用完整的 participants 列表

这样可以实现"先让特定 Agent 处理，再让所有 Agent 补充"的协作模式。

---

## 人工裁判模式

当未配置裁判 Agent 时，由用户承担裁判角色。

### 流程

```
Round 1:
  Agent1 → Agent2 → Agent3
      │
      ▼
  显示决策面板
      │
      ├─ [继续下一轮] → Round 2
      │
      └─ [完成] → 终止
```

### 决策面板 UI

```
┌─────────────────────────────────────────────────────┐
│  📋 本轮完成 (Round 1/3)                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  【Agent1】分析了架构方案...                         │
│  【Agent2】评估了性能影响...                         │
│  【Agent3】提出了安全建议...                         │
│                                                     │
├─────────────────────────────────────────────────────┤
│  是否继续下一轮？                                    │
│                                                     │
│  [⏹️ 完成]              [▶️ 继续下一轮]              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 可选：用户输入指导

用户可以在继续下一轮前输入指导信息：

```
┌─────────────────────────────────────────────────────┐
│  给下一轮的指导（可选）                              │
│  ┌─────────────────────────────────────────────┐    │
│  │ 请重点关注分布式场景的实现细节...            │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [⏹️ 完成]              [▶️ 继续下一轮]              │
└─────────────────────────────────────────────────────┘
```

### @Agent 代行裁判职责

如果没有配置裁判 Agent，用户可以指定某个参与 Agent 来做总结：

```
┌─────────────────────────────────────────────────────┐
│  📋 本轮完成 (Round 1/10)                            │
├─────────────────────────────────────────────────────┤
│  【Agent1】分析了架构方案...                         │
│  【Agent2】评估了性能影响...                         │
│  【Agent3】提出了安全建议...                         │
├─────────────────────────────────────────────────────┤
│  选择一个 Agent 来做总结（可选）：                   │
│  ┌─────────────────────────────────────────────┐    │
│  │ @Agent1 ▼                                   │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [⏹️ 完成]    [🎯 @Agent 总结]    [▶️ 继续下一轮]    │
└─────────────────────────────────────────────────────┘
```

**流程**：
1. 用户选择一个 Agent，点击 [🎯 @Agent 总结]
2. 调用该 Agent（使用裁判提示词模板）
3. Agent 返回 `JudgeResponse` 格式的总结
4. 显示总结，并根据 `shouldContinue` 决定下一步

**优势**：
- 灵活：可以指定不同的 Agent 做总结
- 智能：利用 Agent 的能力做语义判断
- 节省：不需要额外配置裁判 Agent

```typescript
interface HumanJudgeInput {
  round: number;
  guidance?: string;    // 用户给下一轮的指导
  timestamp: number;
}
```

---

## 裁判响应格式

### JSON 结构

```typescript
interface JudgeResponse {
  summary: string;             // 本轮总结
  issues: string[];            // 发现的问题
  suggestions: string[];       // 下轮建议
  shouldContinue: boolean;     // 是否继续
  reason: string;              // 决定原因
}
```

### 示例响应

```json
{
  "summary": "本轮三个 Agent 分别从架构、性能、安全角度分析了方案",
  "issues": [
    "Agent1 的架构方案没有考虑分布式场景",
    "Agent3 的安全建议缺少具体实现细节"
  ],
  "suggestions": [
    "Agent1 请补充分布式部署方案",
    "Agent3 请提供具体的安全配置示例"
  ],
  "shouldContinue": true,
  "reason": "仍有重要问题需要深入讨论"
}
```

### 裁判提示词模板

```
你是一个协作对话的裁判和协调者。你的任务是评估对话进展并指导下一步。

## 用户原始请求
{userMessage}

## 当前轮次
Round {currentRound} / {maxRounds}

## 本轮对话
{currentRoundMessages}

## 完整历史
{fullHistory}

## 你的任务
1. 总结本轮各参与者的贡献
2. 指出遗漏、错误或需要改进的地方
3. 给出下一轮的具体建议（如果需要继续）
4. 判断任务是否已经完成

## 输出格式
请严格使用以下 JSON 格式回复，不要包含其他内容：
{
  "summary": "本轮总结...",
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"],
  "shouldContinue": true/false,
  "reason": "决定原因..."
}
```

---

## 数据结构变更

### CollaborationConfig（更新）

```typescript
interface CollaborationConfig {
  participants: CollaborationParticipant[];

  // 多轮配置
  maxRounds: number;           // 最大轮次，默认 10

  // 裁判配置（可选）
  judge?: {
    gatewayId: string;         // 裁判所在网关
    agentId: string;           // 裁判 Agent ID
    name?: string;             // 裁判显示名称，默认 "裁判"
    avatar?: string;           // 裁判头像
    color?: string;            // 裁判消息颜色
    prompt?: string;           // 自定义提示词（覆盖默认）
  };
}
```

### CollaborationSession（更新）

```typescript
interface CollaborationSession {
  sessionId: string;
  roomId: string;
  status: CollaborationStatus;
  currentStep: number;
  currentRound: number;              // 新增：当前轮次，从 1 开始
  maxRounds: number;                 // 新增：最大轮次
  participants: CollaborationParticipant[];
  judge?: CollaborationConfig['judge']; // 新增：裁判配置（可选）
  userMessageId: string;
  userMessage: string;
  completedSteps: number[];
  failedSteps: Record<number, string>;
  judgeResponses: JudgeResponse[];   // 新增：每轮裁判响应
  humanJudgeInputs: HumanJudgeInput[]; // 新增：人工裁判输入
  terminationReason?:                 // 新增：终止原因
    | 'ai_judge_decided'    // AI 裁判决定完成
    | 'agent_judge_decided' // @Agent 代行裁判决定完成
    | 'user_decided'        // 用户在决策面板点击完成
    | 'max_rounds'          // 达到最大轮次
    | 'user_cancel';        // 用户中断
  createdAt: number;
  updatedAt: number;
}
```

### JudgeResponse（新增）

```typescript
interface JudgeResponse {
  round: number;               // 轮次
  summary: string;             // 本轮总结
  issues: string[];            // 发现的问题
  suggestions: string[];       // 下轮建议
  shouldContinue: boolean;     // 是否继续
  reason: string;              // 决定原因
  timestamp: number;           // 时间戳
}
```

### ChatMessage 扩展

```typescript
interface ChatMessage {
  // ... 现有字段
  collaborationContext?: {
    sessionId: string;
    step: number;
    round: number;              // 新增：轮次
    participantName: string;
    participantColor?: string;
  };
  judgeContext?: {              // 新增：裁判消息上下文
    round: number;
    response: JudgeResponse;
  };
}
```

---

## 消息历史构建

每轮 Agent 和裁判收到的历史格式：

```
[协作上下文]

## 用户原始请求
{userMessage}

## Round 1
【Agent1】...
【Agent2】...
【Agent3】...

🎯 【裁判】
> **总结**：...
> **问题**：...
> **建议**：...
> **决定**：继续（原因：...）

## Round 2
【Agent1】...
...

---
[当前任务]
请根据以上上下文继续处理任务。
```

---

## 实施任务

### Task 1: 类型定义更新

**Files**: `src/types/index.ts`

**变更**:
1. 更新 `CollaborationConfig` 添加 `maxRounds` 和 `judge`
2. 更新 `CollaborationSession` 添加 `currentRound`, `maxRounds`, `judge`, `judgeResponses`, `terminationReason`
3. 新增 `JudgeResponse` 接口
4. 更新 `ChatMessage` 添加 `judgeContext`

**验证命令**:
```bash
npx tsc --noEmit
```

**预期结果**: 无类型错误

---

### Task 2: Store 更新

**Files**: `src/stores/collaborationStore.ts`

**变更**:
1. `startSession` 初始化 `currentRound: 1`, `maxRounds`, `judge`, `judgeResponses: []`
2. 添加 `nextRound(sessionId)` 方法：
   - 重置 `currentStep = 0`
   - 增加 `currentRound++`
3. 添加 `addJudgeResponse(sessionId, response)` 方法
4. 添加 `terminateSession(sessionId, reason)` 方法

**验证命令**:
```bash
npx tsc --noEmit
```

**预期结果**: 无类型错误

---

### Task 3: 裁判调用逻辑

**Files**: `src/hooks/useCollaboration.ts`

**变更**:
1. 添加 `callJudge(session)` 方法：
   - 构建裁判提示词
   - 调用 `chat.send` API
   - 解析 JSON 响应
2. 添加 `callAgentAsJudge(agentId, session)` 方法：
   - 让普通 Agent 临时扮演裁判角色
   - 使用相同的裁判提示词模板
3. 添加 `parseJudgeResponse(text)` 方法：
   - 提取 JSON（处理可能的额外文本）
4. 添加网关断开检测和降级逻辑

**代码片段**:
```typescript
const parseJudgeResponse = (text: string): JudgeResponse | null => {
  try {
    // 尝试直接解析
    return JSON.parse(text);
  } catch {
    // 尝试提取 JSON 块
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
};
```

**验证命令**:
```bash
npx tsc --noEmit
```

**预期结果**: 无类型错误

---

### Task 4: 轮次循环逻辑

**Files**: `src/hooks/useCollaboration.ts`

**变更**:
1. 修改 `continueToNext` 逻辑：
   - 当前步骤不是最后一个 → 继续下一步
   - 当前步骤是最后一个 → 调用裁判
2. 添加 `handleJudgeDecision(sessionId, response)` 方法：
   - 保存裁判响应
   - 显示裁判消息
   - 根据 `shouldContinue` 决定下一步

**逻辑流程**:
```
onStepComplete (最后一个 Agent)
    │
    ▼
检查裁判模式
    │
    ├─ 有 AI 裁判且网关已连接?
    │   └─ YES → callJudge
    │       │
    │       └─ 失败? → showDecisionPanel (降级)
    │
    └─ 无裁判或网关断开?
        └─ showDecisionPanel (人工裁判)
            │
            ├─ 用户点击 [完成] → terminate(user_decided)
            │
            ├─ 用户点击 [继续] → nextRound
            │
            └─ 用户点击 [@Agent 总结]
                │
                ▼
              callAgentAsJudge
                │
                ├─ 成功 → handleJudgeResponse
                │
                └─ 失败 → showDecisionPanel (回退)

handleJudgeResponse
    │
    ├─ shouldContinue: true
    │   │
    │   ├─ currentRound < maxRounds?
    │   │   └─ YES → nextRound, 开始新一轮
    │   │   └─ NO → terminate(max_rounds)
    │   │
    └─ shouldContinue: false
        └─ terminate(ai_judge_decided 或 agent_judge_decided)
```

**验证命令**:
```bash
npx tsc --noEmit
```

**预期结果**: 无类型错误

---

### Task 5: 裁判消息渲染

**Files**: `src/components/chat/MessageItem.tsx`

**变更**:
1. 检测 `message.judgeContext` 存在时，使用裁判消息样式渲染
2. 裁判消息样式：
   - 特殊图标 🎯
   - 分区显示：总结、问题、建议、决定

**验证命令**:
```bash
npm run tauri dev
```

**预期结果**: 裁判消息正确渲染

---

### Task 6: 房间配置 UI

**Files**: `src/components/room/CollaborationRoomForm.tsx`

**变更**:
1. 添加"最大轮次"输入框，默认值 10
2. 添加裁判配置区域：
   - 选择网关（下拉）
   - 选择 Agent（下拉，从网关获取）
   - 可选：自定义名称、提示词

**验证命令**:
```bash
npm run tauri dev
```

**预期结果**: 可以配置裁判

---

### Task 7: 人工裁判决策面板

**Files**: `src/components/room/RoundDecisionPanel.tsx` (新建)

**变更**:
1. 创建 `RoundDecisionPanel` 组件：
   - 显示当前轮次
   - 显示本轮消息摘要
   - Agent 选择下拉框（用于 @Agent 总结）
   - 可选：用户输入指导
   - 三个按钮：完成 / @Agent 总结 / 继续下一轮
2. 在聊天区域底部显示（当需要人工决策时）

**代码结构**:
```typescript
interface RoundDecisionPanelProps {
  round: number;
  maxRounds: number;
  messages: ChatMessage[];        // 本轮消息
  participants: CollaborationParticipant[];  // 可选的 Agent 列表
  onComplete: () => void;
  onContinue: (guidance?: string) => void;
  onAgentJudge: (agentId: string) => void;  // @Agent 总结
}
```

**UI 结构**:
```
┌─────────────────────────────────────────────────────┐
│  📋 本轮完成 (Round 1/10)                            │
├─────────────────────────────────────────────────────┤
│  【Agent1】...                                       │
│  【Agent2】...                                       │
├─────────────────────────────────────────────────────┤
│  选择 Agent 做总结（可选）：                         │
│  [ @Agent1 ▼ ]                                      │
│                                                     │
│  [⏹️ 完成]  [🎯 @Agent 总结]  [▶️ 继续下一轮]        │
└─────────────────────────────────────────────────────┘
```

**验证命令**:
```bash
npm run tauri dev
```

**预期结果**: 决策面板正确显示和交互

---

### Task 8: UI 状态指示器更新

**Files**: `src/components/room/CollaborationStatusIndicator.tsx`

**变更**:
1. 显示当前轮次：`轮次 2/5`
2. 显示裁判状态
3. 显示终止原因（如果已终止）
4. 添加"停止"按钮

**验证命令**:
```bash
npm run tauri dev
```

**预期结果**: 状态指示器正确显示

---

### Task 9: 用户中断功能

**Files**:
- `src/hooks/useCollaboration.ts`
- `src/components/room/CollaborationStatusIndicator.tsx`

**变更**:
1. 添加 `interruptCollaboration(sessionId)` 方法
2. "停止"按钮点击时调用
3. 设置 `terminationReason: 'user_cancel'`

**验证命令**:
```bash
npm run tauri dev
```

**预期结果**: 点击停止按钮可以中断协作

---

## 向后兼容

### 现有房间迁移

现有房间没有 `maxRounds` 和 `judge` 配置，处理方式：

1. `maxRounds` 默认值：10（合理的上限）
2. `judge` 可选：没有裁判时，使用**人工裁判模式**

### 代码处理

```typescript
// 在 startSession 中
const maxRounds = room.collaboration?.maxRounds ?? 10;
const judge = room.collaboration?.judge;

// 在一轮完成后
if (judge) {
  // AI 裁判模式
  await callJudge(session);
} else {
  // 人工裁判模式：显示决策面板，等待用户操作
  showDecisionPanel(session);
}
```

---

## 测试场景

### 场景 1: AI 裁判决定

1. 创建协作房间，配置 AI 裁判，maxRounds=5
2. 发送消息
3. Round 1 完成，裁判返回 `shouldContinue: true`
4. 开始 Round 2
5. Round 2 完成，裁判返回 `shouldContinue: false`
6. 协作终止，terminationReason: `ai_judge_decided`

### 场景 2: 达到最大轮次

1. 创建协作房间，配置裁判，maxRounds=2
2. 发送消息
3. Round 1 完成，裁判返回 `shouldContinue: true`
4. Round 2 完成，裁判返回 `shouldContinue: true`
5. 达到 maxRounds，终止
6. terminationReason: `max_rounds`

### 场景 3: 用户中断

1. 创建协作房间
2. 协作进行中，用户点击"停止"按钮
3. 协作终止，terminationReason: `user_cancel`

### 场景 4: 人工裁判模式

1. 创建协作房间，不配置裁判
2. 发送消息
3. Round 1 完成，显示决策面板
4. 用户点击"继续下一轮"
5. Round 2 完成，显示决策面板
6. 用户点击"完成"
7. 协作终止，terminationReason: `user_decided`

### 场景 5: @Agent 代行裁判

1. 创建协作房间，不配置裁判
2. 发送消息
3. Round 1 完成，显示决策面板
4. 用户选择 @Agent1，点击 "@Agent 总结"
5. Agent1 返回总结和建议，`shouldContinue: true`
6. 自动开始 Round 2
7. Round 2 完成，用户选择 @Agent2 总结
8. Agent2 返回 `shouldContinue: false`
9. 协作终止，terminationReason: `agent_judge_decided`

### 场景 6: Agent 失败继续

1. 创建协作房间
2. Agent1 执行成功
3. Agent2 执行失败（网络错误）
4. 系统记录失败，继续执行 Agent3
5. Agent3 执行成功
6. 裁判/用户决定是否继续

### 场景 7: 裁判网关断开降级

1. 创建协作房间，配置 AI 裁判
2. Round 1 执行中，裁判网关断开
3. Round 1 完成后，系统检测到裁判网关已断开
4. 自动降级为人工裁判模式
5. 显示决策面板，用户手动决定

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 裁判返回非 JSON | 解析失败时默认 `shouldContinue: false` |
| 裁判 API 超时 | 超时后默认继续下一轮 |
| 历史消息过长 | 限制最近 5 轮历史（见下方实现） |
| 裁判网关断开 | 降级为人工裁判模式 |
| Agent 执行失败 | 记录失败，继续下一个 Agent |

---

## 异常处理策略

### Agent 执行失败

```typescript
// 某个 Agent 失败时，记录错误但继续执行
if (error) {
  failStep(sessionId, stepIndex, error.message);
  // 不中断协作，继续下一个 Agent
  await continueToNext(sessionId);
}
```

### 裁判网关断开

```typescript
// AI 裁判的网关断开时，降级为人工裁判
if (judge && getStatus(judge.gatewayId) !== 'connected') {
  console.warn('裁判网关已断开，降级为人工裁判模式');
  // 显示人工裁判决策面板
  showDecisionPanel(session);
}
```

### @Agent 总结失败

```typescript
// @Agent 总结失败时，回退到人工决策
try {
  const response = await callAgentAsJudge(agentId, session);
  handleJudgeResponse(response);
} catch (error) {
  console.warn('@Agent 总结失败，回退到人工决策');
  showDecisionPanel(session);
}
```

---

## 历史消息限制

多轮对话会导致历史消息无限增长，需要限制：

```typescript
const MAX_HISTORY_ROUNDS = 5;

const buildMessageWithHistory = (session: CollaborationSession): string => {
  const allMessages = getMessages(session.roomId);

  // 按轮次分组
  const messagesByRound = groupMessagesByRound(allMessages);

  // 只保留最近 MAX_HISTORY_ROUNDS 轮
  const recentRounds = messagesByRound.slice(-MAX_HISTORY_ROUNDS);

  // 构建历史文本
  return formatHistory(recentRounds, session.userMessage);
};
```

**配置化**（可选）：
```typescript
interface CollaborationConfig {
  // ...
  maxHistoryRounds?: number;  // 默认 5
}
```

---

## 实施顺序

| # | 任务 | 依赖 |
|---|------|------|
| 1 | Task 1: 类型定义更新 | - |
| 2 | Task 2: Store 更新 | Task 1 |
| 3 | Task 3: 裁判调用逻辑 | Task 1, 2 |
| 4 | Task 4: 轮次循环逻辑 | Task 3 |
| 5 | Task 5: 裁判消息渲染 | Task 1 |
| 6 | Task 6: 房间配置 UI | Task 1 |
| 7 | Task 7: 人工裁判决策面板 | Task 2, 4 |
| 8 | Task 8: UI 状态指示器更新 | Task 2 |
| 9 | Task 9: 用户中断功能 | Task 2, 4 |

---

## 后续优化（Phase 2）

1. **裁判提示词模板**：提供多种预设模板（严格模式/宽松模式）
2. **裁判统计**：记录每轮裁判的决策统计
3. **手动覆盖**：允许用户在裁判决定继续时手动终止
4. **历史轮次配置化**：`maxHistoryRounds` 可在房间配置中设置

# 网关默认 Agent 配置功能

## 需求

在网关配置中为该网关的默认 agent 预设 SOUL.md、AGENTS.md 等文件，保存时自动推送到 openclaw 服务端。

## 数据结构

### 扩展 GatewayConfig

```typescript
// 文件配置
export interface AgentFileConfig {
  soulMd?: string;       // SOUL.md 内容
  agentsMd?: string;     // AGENTS.md 内容
  userMd?: string;       // USER.md 内容
  toolsMd?: string;      // TOOLS.md 内容
  heartbeatMd?: string;  // HEARTBEAT.md 内容
}

// 扩展 GatewayConfig
export interface GatewayConfig {
  id: string;
  name: string;
  url: string;
  token?: string;
  status: GatewayStatus;
  autoConnect?: boolean;
  agentFiles?: AgentFileConfig;  // 新增：agent 文件配置
}
```

## UI 设计

### GatewayForm 布局

```
┌──────────────────────────────────────────────┐
│  网关名称 *                                   │
│  [_______________]                           │
├──────────────────────────────────────────────┤
│  网关地址 *                                   │
│  [_______________]                           │
├──────────────────────────────────────────────┤
│  认证令牌（可选）                              │
│  [_______________]                           │
├──────────────────────────────────────────────┤
│  ☐ 自动连接                                   │
├──────────────────────────────────────────────┤
│  ▼ Agent 配置 (可选)                          │
│  ┌──────────────────────────────────────────┐│
│  │ SOUL.md (人格定义)                        ││
│  │ ┌────────────────────────────────────────┐││
│  │ │ # SOUL.md - Who You Are               │││
│  │ │                                        │││
│  │ │ ## Core Truths                        │││
│  │ │ ...                                    │││
│  │ └────────────────────────────────────────┘││
│  │                                          ││
│  │ ▶ 高级配置 (AGENTS.md, USER.md...)       ││
│  └──────────────────────────────────────────┘│
├──────────────────────────────────────────────┤
│              [取消]           [保存]          │
└──────────────────────────────────────────────┘
```

### 交互细节

1. **Agent 配置区域** 默认折叠，点击展开
2. **SOUL.md** 作为主要配置，直接显示编辑器
3. **高级配置** 默认折叠，包含其他文件
4. **从服务端加载** 展开时如果有 agentId，可从服务端加载现有配置
5. **默认模板** 提供默认的 SOUL.md 模板

## 提交流程

```
用户点击保存
    │
    ▼
保存网关配置到本地存储
    │
    ▼
如果有 token 且有 agentFiles 配置
    │
    ├─ 连接网关（如果未连接）
    │
    ├─ 调用 agents.list 获取默认 agentId
    │
    └─ 对每个非空文件调用 agents.files.set
       {
         agentId: "main",
         name: "SOUL.md",
         content: "..."
       }
```

## 需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `src/types/index.ts` | 添加 AgentFileConfig 类型，扩展 GatewayConfig |
| `src/components/gateway/GatewayForm.tsx` | 添加 Agent 配置 UI |
| `src/stores/gatewayStore.ts` | 更新保存逻辑，支持 agentFiles |
| `src/lib/storage.ts` | 确保 agentFiles 被正确存储 |

## 实施步骤

### Phase 1: 类型定义
1. 添加 AgentFileConfig 类型
2. 扩展 GatewayConfig

### Phase 2: UI 实现
1. 添加折叠面板组件
2. 添加 SOUL.md 编辑器
3. 添加高级配置折叠区

### Phase 3: 提交逻辑
1. 连接网关
2. 获取默认 agent
3. 调用 agents.files.set API

## 注意事项

1. **离线保存**：agentFiles 应该保存到本地，下次连接时再推送
2. **加载现有配置**：编辑网关时，应该先从服务端加载现有文件内容
3. **错误处理**：推送失败不应阻止网关保存
4. **Agent ID**：默认使用 "main" agent，未来可支持选择

## 参考文档

- openclaw API: `agents.files.set` - 参数: `{ agentId, name, content }`
- SOUL.md 模板: `/Volumes/work/workspace/openclaw/docs/reference/templates/SOUL.md`

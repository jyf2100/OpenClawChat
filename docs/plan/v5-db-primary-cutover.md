# v5-db-primary-cutover

## Goal

- 把当前“DB 双写/灰度切读过渡态”推进到“SQLite 唯一主存储”。

## Why Now

- Phase 1 已经完成：
  - SQLite 基础设施
  - 轻量实体双写
  - 轻量实体灰度切读
  - 消息后台导入框架
  - 导入调度 / 抽样校验 / 状态观测
- 当前最大问题不再是“能不能迁”，而是“何时停止依赖旧 JSON 业务路径”。

## Hard Constraints

- 历史消息不能丢
- 启动不能变慢
- 不能让 UI 在切换过程中出现大量行为回退

## Final Architecture

### SQLite 作为唯一主存储

- `templates`
- `gateways`
- `agent_configs`
- `rooms`
- `messages`
- `documents`
- `archives`

### plugin-store / localStorage 只保留

- `theme`
- `activeGatewayId`
- 视图折叠/展开状态
- logger level
- 纯 UI 偏好

### 旧 JSON 存储的最终命运

- 仅作为一次性迁移源
- 切换完成后不再参与业务读写

## Current State

### 已完成

- SQLite schema / migration runner
- `templates / gateways / agent_configs / rooms` 双写
- `templates / gateways / agent_configs / rooms` DB 优先 + store 回退
- `messages` 后台导入框架
- `messages` 导入调度
- `messages` 抽样校验 + 全量校验命令
- 设置页导入状态观测
- `templates / gateways / rooms` DB 主路径切换
- `messages` 最近一页灰度切读
- `messages` 主写切换到 DB
- `documents / archives` DB 主流程

### 未完成

- 旧 JSON 业务键退役
- `activeSession` 等少量业务边界是否继续留在旧轻存储仍需明确

## Recommended Cutover Sequence

### Phase A: 轻量实体切到 DB 主路径

目标：

- `templates / gateways / agent_configs / rooms` 只读写 DB
- 旧 store 仅在“DB 空且检测到旧数据”时用于一次性导入

验收：

- 轻量实体主逻辑不再依赖 `defaultStorage.set/get`
- 应用重启后仅从 DB 读取这些实体
- `npm run build`
- `cargo check`

风险：

- 旧数据导入时机不对会导致首次切换丢配置

缓解：

- 增加 migration complete 标记
- 切换前做数量一致性校验

### Phase B: 消息最近一页灰度切读

目标：

- 仅当前活跃房间最近一页消息从 DB 读取
- 失败立即回退旧路径

验收：

- 打开房间速度不慢于当前版本
- 最近一页消息数量一致
- 校验工具报告无缺失/无不一致

风险：

- DB 尚未导入完成时读路径切换会出现“看起来消息少了”

缓解：

- 只有当该房间导入完成且校验通过才允许切读
- 加开关与回滚标志

#### Status

- 已完成：
  - Rust 侧已新增最近一页消息分页读取能力
  - Tauri command / 前端 DB bridge 已接通
  - `roomStore` 已在活跃房间切换时预热最近一页 DB 消息
  - 仅当最近一页校验通过时，第一页分页结果才会使用 DB 数据
- 当前仍保留：
  - 仅第一页灰度切读
  - 失败立即回落到内存/旧路径
- 未完成：
  - 没有全局开关面板
  - 没有长期错误率阈值

### Phase C: 消息主写切换到 DB

目标：

- `addMessage / updateMessage / deleteMessage / clearMessages` 主写入切到 DB
- 旧 JSON 消息只保留迁移与紧急回退

验收：

- 新消息实时写入 DB
- 当前房间读写一致
- 不影响流式消息更新

风险：

- `roomStore` 目前的内存结构和旧消息持久化强绑定

缓解：

- 先保留内存结构
- 只替换持久化后端

### Phase D: documents / archives 迁移

目标：

- `documents / archives` 双写 → 切读 → 主路径切换

#### Status

- 已完成：
  - `documents / archives` 已具备 DB 表、repository、commands
  - `documentStorage / archiveStorage` 已在 Tauri 中切到 DB 主路径
- 未完成：
  - 旧 JSON 键仍保留作为历史迁移来源

### Phase E: 退役旧业务 JSON

目标：

- 停止写业务数据到 `clawchat.gateways / rooms / messages / roleTemplates / documents / archivedConversations`
- 只保留 UI 偏好键

## Task Breakdown

### Task 1: 轻量实体 DB 主路径切换

- Files
  - Modify: `src/lib/storage.ts`
  - Modify: `src/stores/gatewayStore.ts`
  - Modify: `src/stores/templateStore.ts`
  - Modify: `src/stores/roomStore.ts`
- Red
  - 写失败测试：当前轻量实体仍依赖旧 store 回退
- Green
  - 增加 DB ready / migrated 标记
  - 轻量实体改成 DB-only primary
  - 旧 store 只在一次性导入时读取
- Verify
  - `npm run build`
  - `cargo check`

#### Status

- 已完成：
  - `templates / gateways / rooms` 在 Tauri 运行时已切到 DB 主读写
  - 旧 store 仅作为一次性迁移来源
  - 引入迁移完成标记，避免删空 DB 后再次把旧脏数据导回
- 未完成：
  - `documents / archives` 旧 JSON 键尚未彻底清理
  - `activeSession` 是否迁 DB 还未决

### Task 2: 最近一页消息灰度切读

- Files
  - Modify: `src/lib/storage.ts`
  - Modify: `src/stores/roomStore.ts`
  - Possibly Create: `src/lib/messageReadPolicy.ts`
- Red
  - 测试当前不存在按房间切读策略
- Green
  - 只对导入完成且校验通过的房间启用最近一页 DB 读取
  - 增加回滚开关
- Verify
  - `npm run build`
  - 活跃房间消息数/首末消息一致

### Task 3: 消息主写切换

- Files
  - Modify: `src/lib/storage.ts`
  - Modify: `src/stores/roomStore.ts`
  - Modify: `src-tauri/src/db/repositories/messages.rs`
- Red
  - 测试当前消息主写仍落旧 JSON
- Green
  - DB 成为主写
  - JSON 仅保留 fallback/迁移
- Verify
  - `npm run build`
  - `cargo check`
  - 手动流式消息更新验证

### Task 4: documents / archives 迁移

- Files
  - Modify: `src/lib/storage.ts`
  - Modify: `src/stores/documentStore.ts`
  - Modify: `src/App.tsx`
  - Modify: Rust DB schema / repository / commands

### Task 5: 退役旧业务 JSON 键

- Files
  - Modify: `src/lib/storage.ts`
  - Update: docs

## DoD

- 轻量实体和消息最终都能从 DB 直接恢复
- 旧业务 JSON 不再参与正常业务流
- 最近一页消息切读有显式开关和回滚
- 历史消息不丢
- 启动不变慢

## Current Recommendation

下一步先做 **Task 5: 退役旧业务 JSON 键**。  
同时明确 `activeSession` 是否继续留在轻量存储；如果保留，就把它正式定义为 UI/会话偏好而非业务主存储。

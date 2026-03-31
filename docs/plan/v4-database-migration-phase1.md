# v4-database-migration-phase1

## Goal

- 为轻量实体建立 SQLite 双写/灰度切读兼容层，并补齐 `messages` 的后台导入框架，不切换消息主读路径。

## Scope

- 做：
  - Rust DB 删除命令
  - 前端 `db.ts`
  - `storage.ts` 双写网关、模板、Agent 配置
  - `rooms` 元数据双写与灰度切读
  - `messages` 后台导入框架与统计校验基础设施
- 不做：
  - `messages` 读路径迁移
  - 全量数据库切读

## Acceptance

- [x] `gatewayStorage.saveGateways()` 会把网关和其 `agentConfigs` 双写到 DB
- [x] `roleTemplateStorage.saveTemplates()` 会双写到 DB
- [x] `roomStorage.saveRooms()` 会把房间元数据双写到 DB
- [x] 删除网关/模板时不会在 DB 留脏数据
- [x] `templates` 已实现 DB 优先、旧存储回退的灰度切读
- [x] `gateways / agent_configs` 已实现 DB 优先、旧存储回退的读取 facade
- [x] `rooms` 元数据已实现 DB 优先、旧存储回退的灰度切读
- [x] 轻量实体已增加读取来源日志与数量一致性校验
- [x] `messages` 已具备后台导入 DB 的批量命令与统计校验能力
- [x] `messages` 已具备活跃房间优先、分批限流、非阻塞触发的导入调度
- [x] `messages` 已具备内容级抽样校验
- [x] `messages` 已具备错误计数与导入状态观测
- [x] `npm run build` 通过
- [x] `cd src-tauri && cargo test --lib` 通过
- [x] `cd src-tauri && cargo check` 通过

## Files

- Modify: `src-tauri/src/db/repositories/*.rs`
- Modify: `src-tauri/src/commands/storage.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/db.ts`
- Modify: `src/lib/storage.ts`
- Modify: `docs/plan/v4-database-migration-phase1.md`

## Steps

1. 红测：补前端/后端需要的 DB 删除接口引用，验证当前不存在完整双写能力
2. 实现：补齐 DB 删除命令和前端 DB facade
3. 实现：在 `storage.ts` 中加入 `templates / gateways / agent_configs` 双写
4. 绿测：`npm run build`
5. 绿测：`cd src-tauri && cargo check`

## Risks

- 双写失败不能阻断旧存储
- 删除同步不完整会导致未来切读时脏数据回流

## Review

### 已完成

- Rust 侧已引入 SQLite 基础设施、migration runner、核心轻量表和 DB commands。
- 前端已新增 `db.ts` bridge，并在 `storage.ts` 中对 `templates / gateways / agent_configs` 做双写。
- 当前读取路径已经支持：
  - `templates`: DB 优先，旧存储回退
  - `gateways / agent_configs`: DB 优先，旧存储回退
  - `rooms`: DB 优先，旧存储回退（仅房间元数据，消息仍未迁移）
- 轻量实体已增加读取来源日志与数量一致性校验，便于后续灰度观察。
- `messages` 已新增后台导入框架：
  - Rust 侧 `messages` 表与索引
  - 批量导入 command
  - 按房间统计 command
  - 前端 `importMessagesToDbInBackground()` 入口
- `messages` 调度器已接入：
  - 活跃房间优先
  - 每批最多 3 个房间
  - 每房间最多导入最近 500 条消息
  - 使用 `setTimeout` 异步调度，避免阻塞当前交互
- 已增加内容级抽样校验：
  - 取首条 / 中间 / 末条消息 ID
  - 导入后从 DB 回读样本，对比 JSON 内容
- 已增加导入状态观测：
  - `running`
  - `pendingRooms`
  - `activeRoomId`
  - `importedRooms`
  - `importedMessages`
  - `failedRooms`
  - `sampleMismatches`
  - `lastError`
- 仍未切任何消息读路径，启动链路不受影响。

### 验证

- `cd src-tauri && cargo test --lib`
- `cd src-tauri && cargo check`
- `npm run build`

### 已知风险

- `rooms` 已灰度切读，但 `activeSession` 仍走旧存储，后续要明确是否迁入 DB。
- `messages` 仍完全走旧读路径，后续迁移要继续守住启动性能红线。
- 消息导入状态目前只在内存与日志中可见，尚未接入可视化调试面板。
- 抽样校验仍是有限样本，不是全量一致性校验。

### 下一个最小任务

- 将消息导入状态暴露到调试/设置页，便于人工观测。
- 在不切主读路径的前提下，增加全量校验工具或按房间校验命令。

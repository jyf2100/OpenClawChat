# v4-database-migration-phase1

## Goal

- 为 `templates / gateways / agent_configs` 建立 SQLite 双写兼容层，不切换主读路径。

## Scope

- 做：
  - Rust DB 删除命令
  - 前端 `db.ts`
  - `storage.ts` 双写网关、模板、Agent 配置
- 不做：
  - `messages` 读路径迁移
  - `rooms` 读路径迁移
  - 全量数据库切读

## Acceptance

- [x] `gatewayStorage.saveGateways()` 会把网关和其 `agentConfigs` 双写到 DB
- [x] `roleTemplateStorage.saveTemplates()` 会双写到 DB
- [x] 删除网关/模板时不会在 DB 留脏数据
- [x] `templates` 已实现 DB 优先、旧存储回退的灰度切读
- [x] `gateways / agent_configs` 已实现 DB 优先、旧存储回退的读取 facade
- [x] `npm run build` 通过
- [x] `cd src-tauri && cargo check` 通过

## Files

- Modify: `src-tauri/src/db/repositories/*.rs`
- Modify: `src-tauri/src/commands/storage.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/db.ts`
- Modify: `src/lib/storage.ts`

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

### 验证

- `cd src-tauri && cargo test --lib`
- `cd src-tauri && cargo check`
- `npm run build`

### 已知风险

- 目前尚未增加“读取来源观测”与一致性统计，出问题时诊断信息还不够强。
- 轻量实体已灰度切读，但未对 DB/旧存储做启动时数量对比校验。
- `messages / rooms` 仍完全走旧路径，后续迁移要继续守住启动性能红线。

### 下一个最小任务

- 为 `templates / gateways / agent_configs` 增加读取来源日志与一致性校验钩子。
- 在不切消息读路径的前提下，准备 `rooms` 元数据迁移方案。

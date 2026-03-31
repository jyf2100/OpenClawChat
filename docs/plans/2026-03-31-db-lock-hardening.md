# 数据库锁冲突硬化计划

## Goal

- 修复当前 SQLite 层的锁冲突放大问题，确保数据库在运行中可稳定读写。

## Facts

- 当前每个 Tauri DB command 都会重新 `Database::open(...)`。
- `Database::open(...)` 每次都会运行 migration/bootstrap。
- 当前 `busy_timeout = 0`，锁冲突直接失败。
- `db_upsert_message` 复用了 `import_room_messages`，存在整房间删除风险。
- 当前 migration 版本仍停留在 `1`，不是严格版本化迁移。

## Acceptance

- `busy_timeout` 显式配置且大于 0。
- migrations 只在 app startup 跑一次，不在每个 command 里重复执行。
- DB commands 通过统一 DB manager 获取连接。
- `db_upsert_message` 改成真正的单条 upsert，不再整房间替换。
- 老库从 v1 能增量补齐后续表结构。
- `cargo test --lib`、`cargo check`、`npm run build` 全绿。

## Tasks

### Task 1

- Files
  - Modify: `src-tauri/src/db/schema.rs`
  - Modify: `src-tauri/src/db/migrations.rs`
  - Modify: `src-tauri/src/db/mod.rs`
  - Modify: `src-tauri/src/lib.rs`
- Red
  - 证明当前 migration 仍是一段 version=1 bootstrap。
- Green
  - 改成版本化迁移
  - setup 时统一跑 migration

### Task 2

- Files
  - Modify: `src-tauri/src/db/mod.rs`
  - Modify: `src-tauri/src/commands/storage.rs`
- Red
  - 证明当前 command 仍逐次 open DB。
- Green
  - 引入 DB manager/state
  - commands 通过 manager 打开配置好的连接
  - 配置 `busy_timeout`

### Task 3

- Files
  - Modify: `src-tauri/src/db/repositories/messages.rs`
  - Modify: `src-tauri/src/commands/storage.rs`
  - Modify: `src-tauri/src/lib.rs`
- Red
  - 证明 `db_upsert_message` 语义错误。
- Green
  - 拆分 `replace_room_messages` 与 `upsert_message`
  - 为单条 upsert 写测试

## Risks

- 迁移版本提升后，需要保证旧库自动补齐 schema。
- 如果 manager 设计不当，可能引入新的生命周期问题。

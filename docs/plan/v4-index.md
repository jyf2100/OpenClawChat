# v4-index

## 愿景

- 将核心业务数据从 JSON/Tauri store 逐步迁移到 SQLite，同时满足两条红线：
  - 历史消息不能丢
  - 启动不能变慢

## 里程碑

- M1: Rust 侧 SQLite 基础设施与核心轻量表落地
- M2: 前端双写兼容层接入 `templates / gateways / agent_configs`
- M3: 轻量实体切读与校验
- M4: `rooms / messages` 后台迁移与分页读路径

## 计划索引

- [v4-database-migration-phase1](/Volumes/work/workspace/roclaw/docs/plan/v4-database-migration-phase1.md)

## 追溯矩阵

- 当前为基础设施里程碑，无直接 PRD Req ID；服务于“数据库迁移 Phase 1”工程目标。

## ECN 索引

- 暂无

## 差异列表

- 尚未切前端双写兼容层
- 尚未提供 DB 删除命令
- 尚未进行消息路径迁移

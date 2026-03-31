# v5-index

## 愿景

- 将 Roclaw 的业务数据存储**彻底切换到 SQLite**，使数据库成为唯一主存储。
- 保留两条硬约束不变：
  - 历史消息不能丢
  - 启动不能变慢

## 最终目标

- `templates / gateways / agent_configs / rooms / messages / documents / archives` 最终都以 SQLite 为唯一主存储。
- `plugin-store / localStorage` 只保留 UI 偏好、轻量视图状态与必要的本地兼容信息。
- 旧 JSON 业务数据只作为一次性迁移来源，不再参与正常业务读写。

## 里程碑

- M1 已完成：SQLite 基础设施、轻量实体双写、灰度切读、消息后台导入框架
- M2 进行中：消息导入调度、校验、状态观测
- M3 待完成：轻量实体切换到 DB 唯一主路径
- M4 待完成：消息最近一页灰度切读 + 回滚开关
- M5 待完成：消息主读写切换到 DB
- M6 待完成：documents / archives 迁移
- M7 待完成：移除旧业务 JSON 路径，仅保留 UI 偏好

## 计划索引

- [v4-database-migration-phase1](/Volumes/work/workspace/roclaw/docs/plan/v4-database-migration-phase1.md)
- [v5-db-primary-cutover](/Volumes/work/workspace/roclaw/docs/plan/v5-db-primary-cutover.md)

## 差异列表

- 轻量实体仍有旧存储回退路径，尚未成为纯 DB 主路径
- `messages` 仍未切主读路径
- `documents / archives` 仍未进入 DB 主流程
- 缺少长期统计沉淀和告警阈值

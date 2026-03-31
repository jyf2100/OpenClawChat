# v6-local-auth

## Goal

- 为桌面端增加本地账号注册/登录/登出能力，并在 App 启动时做本地认证门禁。

## Scope

- 做：
  - SQLite 用户表和会话表
  - Rust 认证命令
  - 前端登录门禁
  - 注册 / 登录 / 登出 UI
- 不做：
  - 第三方登录
  - 云同步账号
  - 多租户权限系统

## Acceptance

- 首次启动无用户时显示注册页
- 注册成功后自动登录
- 已存在用户时显示登录页
- 登录成功后进入现有 App
- 刷新/重启能根据本地 token 恢复登录态
- 登出后回到登录页
- `cargo test --lib`、`cargo check`、`npm run build` 全绿

## Review

### 已完成

- Rust 侧已新增：
  - `local_users`
  - `auth_sessions`
  - `auth_get_status`
  - `auth_register`
  - `auth_login`
  - `auth_logout`
- 前端已新增本地登录门禁页：
  - 首次无用户显示注册
  - 已存在用户显示登录
- 登录成功后使用本地 session token 恢复登录态
- Header 用户菜单已支持登出

### 验证

- `cd src-tauri && cargo test --lib`
- `cd src-tauri && cargo check`
- `npm run build`

### 剩余风险

- 当前只支持单本地账号，不支持多账号切换
- session token 目前保存在本地轻量存储中，未接系统钥匙串

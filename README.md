# Roclaw Desktop

基于 Tauri 2.0 的跨平台 AI 聊天桌面客户端，连接 OpenClaw 网关服务，支持多智能体协作。

## 功能特性

- **多网关管理** - 支持连接多个 OpenClaw 网关
- **Agent 配置** - 可视化配置 SOUL.md、AGENTS.md 等文件
- **协作房间** - 多智能体顺序执行，支持 @提及
- **流式消息** - AI 响应实时流式输出
- **本地存储** - 消息历史和配置本地持久化

## 技术栈

| 技术 | 版本 |
|------|------|
| Tauri | 2.0 |
| React | 19 |
| TypeScript | 5.8 |
| Tailwind CSS | 4.1 |
| Zustand | 5.0 |

## 快速开始

### 环境要求

- Node.js 18+
- Rust 1.70+
- pnpm / npm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri dev
```

### 生产打包

```bash
npm run tauri build
```

打包产物位于 `src-tauri/target/release/bundle/`

## 项目结构

```
src/
├── components/
│   ├── chat/          # 聊天组件
│   ├── gateway/       # 网关管理
│   ├── layout/        # 布局组件
│   └── room/          # 房间管理
├── hooks/             # 自定义 Hooks
├── stores/            # Zustand 状态管理
├── types/             # TypeScript 类型
└── lib/               # 工具库
```

## 核心功能

### 网关管理

- 添加/编辑/删除网关
- 配置默认模型
- 自动连接

### Agent 配置

- 从服务端加载 Agent 列表
- 编辑配置文件：SOUL.md、AGENTS.md、USER.md、TOOLS.md、HEARTBEAT.md
- 一键推送到服务端

### 协作房间

- 多个 Agent 顺序执行
- @提及指定 Agent
- 消息队列机制

## API 方法

| 方法 | 说明 |
|------|------|
| `agents.list` | 获取 Agent 列表 |
| `sessions.list` | 获取会话和默认配置 |
| `agents.files.get` | 获取 Agent 文件 |
| `agents.files.set` | 设置 Agent 文件 |
| `chat.send` | 发送聊天消息 |

## 相关链接

- [OpenClaw](https://github.com/anthropics/openclaw) - 智能体网关服务
- [Tauri](https://tauri.app/) - 跨平台桌面应用框架

## License

MIT

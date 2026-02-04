# OpenClaw 桌面应用设计文档

**日期**: 2025-02-04
**目标**: 将微信小程序改造成 Tauri 桌面应用
**状态**: 设计完成，待实施

---

## 1. 概述

### 1.1 目标

将现有的 OpenClaw 微信小程序客户端改造成跨平台桌面应用，保留所有核心功能，并增强用户体验。

### 1.2 技术选型

| 技术层 | 选择 | 说明 |
|--------|------|------|
| 框架 | Tauri 1.x | 轻量、安全、打包体积小 |
| 前端 | 原生 HTML/CSS/JS | 最大程度复用现有代码 |
| 后端 | Rust | 类型安全、高性能 |
| 数据库 | SQLite (sqlx) | 轻量、无需额外服务 |
| 目标平台 | macOS + Windows | 覆盖主流桌面系统 |

### 1.3 核心功能（保留）

- WebSocket 实时通信
- 流式响应显示
- 图片附件支持
- 聊天历史加载
- 消息队列管理

### 1.4 新增功能

- SQLite 数据库存储
- 系统托盘支持
- 全局快捷键
- 桌面通知
- 自动重连机制

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri 桌面应用                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐      ┌─────────────────┐         │
│  │   WebView 窗口   │      │   系统托盘       │         │
│  │  (HTML/CSS/JS)  │◄────►│  (通知/快捷操作)  │         │
│  └────────┬────────┘      └─────────────────┘         │
│           │                                              │
│           │ Tauri IPC (invoke)                          │
│           │                                              │
│  ┌────────▼────────┐      ┌─────────────────┐         │
│  │  Rust Backend   │◄────►│  SQLite 数据库   │         │
│  │  - WebSocket    │      │  - 聊天记录      │         │
│  │  - 文件系统     │      │  - 用户配置      │         │
│  │  - 通知/托盘    │      └─────────────────┘         │
│  └─────────────────┘                                    │
│           │                                              │
│           │ WebSocket                                    │
│           ▼                                              │
│  ┌─────────────────┐                                    │
│  │ OpenClaw 网关    │                                    │
│  │ (ws://127.0.0.1:18789)                              │
│  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 项目结构

```
OpenClawChat-Desktop/
├── src-tauri/                 # Rust 后端
│   ├── src/
│   │   ├── main.rs           # 主入口
│   │   ├── lib.rs            # 库导出
│   │   ├── commands/         # Tauri 命令（暴露给前端）
│   │   │   ├── mod.rs
│   │   │   ├── chat.rs       # 聊天相关命令
│   │   │   ├── config.rs     # 配置管理
│   │   │   └── database.rs   # 数据库操作
│   │   ├── models/           # 数据模型
│   │   │   ├── message.rs
│   │   │   └── config.rs
│   │   ├── db/               # SQLite 模块
│   │   │   ├── mod.rs
│   │   │   └── schema.sql    # 数据库表结构
│   │   ├── error.rs          # 错误类型定义
│   │   └── tray.rs           # 系统托盘
│   ├── Cargo.toml
│   ├── tauri.conf.json       # Tauri 配置
│   └── icons/                # 应用图标
│
├── src/                       # 前端 (迁移自小程序)
│   ├── index.html            # 主页面
│   ├── styles/
│   │   └── chat.css          # 从 chat.wxss 转换
│   ├── js/
│   │   ├── app.js            # 主逻辑 (从 chat.js 迁移)
│   │   ├── protocol.js       # WebSocket 协议封装
│   │   ├── storage.js        # 前端存储适配层
│   │   └── ui.js             # UI 操作
│   └── assets/               # 静态资源
│
├── dist/                      # 构建输出
├── package.json
└── tauri.conf.json
```

---

## 4. 数据库设计

### 4.1 表结构

```sql
-- 配置表
CREATE TABLE configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 聊天会话表
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  session_key TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,        -- 'user' | 'assistant' | 'tool'
  content TEXT,              -- JSON 格式存储 content blocks
  text TEXT,                 -- 纯文本（用于搜索）
  timestamp INTEGER NOT NULL,
  run_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- 附件表
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,        -- 'image' | 'file'
  mime_type TEXT,
  data BLOB,                 -- 二进制数据
  url TEXT,                  -- 外部 URL
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

-- 索引
CREATE INDEX idx_messages_session ON messages(session_id, timestamp);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_attachments_message ON attachments(message_id);
```

### 4.2 Tauri 命令

```rust
#[tauri::command]
async fn save_message(
    message: Message,
    attachments: Vec<Attachment>,
    db: State<'_, SqlitePool>,
) -> Result<(), String>;

#[tauri::command]
async fn load_history(
    session_key: String,
    limit: i32,
    db: State<'_, SqlitePool>,
) -> Result<Vec<Message>, String>;

#[tauri::command]
async fn search_messages(
    query: String,
    db: State<'_, SqlitePool>,
) -> Result<Vec<Message>, String>;
```

---

## 5. 前端迁移

### 5.1 WXML → HTML 映射

| 微信小程序 (WXML) | 桌面应用 (HTML) |
|------------------|----------------|
| `<view>` | `<div>` |
| `<text>` | `<span>` |
| `<image>` | `<img>` |
| `<scroll-view>` | `<div>` + CSS overflow |
| `<textarea>` | `<textarea>` |
| `{{variable}}` | JavaScript 模板字符串 |
| `wx:if="{{condition}}"` | `element.style.display` |
| `wx:for="{{array}}"` | `array.forEach()` 或 `map()` |

### 5.2 WXSS → CSS 转换

```css
/* 微信小程序 (rpx 单位) */
.chat-line {
  margin-bottom: 32rpx;
  padding: 20rpx 30rpx;
}

/* 桌面应用 (转换为 px) */
.chat-line {
  margin-bottom: 16px;    /* 32rpx ≈ 16px */
  padding: 10px 15px;     /* 20rpx ≈ 10px, 30rpx ≈ 15px */
}
```

### 5.3 API 适配层

```javascript
// src/js/storage.js - 兼容层
const wxCompat = {
  setStorageSync(key, data) {
    return invoke('save_config', { key, value: JSON.stringify(data) });
  },
  getStorageSync(key) {
    return invoke('get_config', { key }).then(v => JSON.parse(v));
  },
  chooseImage(options) {
    return invoke('choose_image', { count: options.count });
  },
  getFileSystemManager() {
    return {
      readFileSync(path, encoding) {
        return invoke('read_file', { path, encoding });
      }
    };
  }
};

// 替换全局 wx 对象
window.wx = wxCompat;
```

---

## 6. 系统功能增强

### 6.1 系统托盘

```rust
// src-tauri/src/tray.rs
pub fn create_tray() -> SystemTray {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "显示窗口"))
        .add_item(CustomMenuItem::new("new_chat", "新会话"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "退出"));

    SystemTray::new().with_menu(tray_menu)
}

pub fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::MenuItemClick { id, .. } => {
            match id.as_str() {
                "show" => { /* 显示窗口 */ }
                "new_chat" => { /* 发送 /new 命令 */ }
                "quit" => { app.exit(0); }
                _ => {}
            }
        }
        _ => {}
    }
}
```

### 6.2 全局快捷键

```json
{
  "tauri": {
    "shortcuts": {
      "CommandOrControl+N": "new_chat",
      "CommandOrControl+Q": "quit",
      "CommandOrControl+K": "focus_search"
    }
  }
}
```

### 6.3 窗口配置

```json
{
  "windows": [{
    "title": "OpenClaw 对话",
    "width": 900,
    "height": 700,
    "minWidth": 600,
    "minHeight": 400,
    "resizable": true,
    "alwaysOnTop": false
  }]
}
```

### 6.4 桌面通知

```rust
#[tauri::command]
async fn show_notification(title: String, body: String) -> Result<(), String> {
    Notification::new()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}
```

---

## 7. 错误处理与重试

### 7.1 错误类型

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("网络错误: {0}")]
    Network(#[from] reqwest::Error),

    #[error("数据库错误: {0}")]
    Database(#[from] sqlx::Error),

    #[error("WebSocket 连接断开")]
    WebSocketDisconnected,

    #[error("配置错误: {0}")]
    Config(String),
}
```

### 7.2 自动重连

```rust
use backoff::{ExponentialBackoff, future::retry};

pub async fn connect_with_retry(url: &str) -> Result<WebSocketStream, AppError> {
    retry(ExponentialBackoff::default(), || async {
        match WebSocket::connect(url).await {
            Ok(ws) => Ok(ws),
            Err(e) => {
                log::warn!("连接失败，2秒后重试: {}", e);
                Err(backoff::Error::transient(AppError::Network(e)))
            }
        }
    }).await
}
```

### 7.3 前端重连逻辑

```javascript
class ConnectionManager {
  async reconnect() {
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        await this.connect();
        return;
      } catch (err) {
        if (attempt >= maxRetries) {
          this.setStatus('error', '连接失败，已停止重试');
          return;
        }
        await this.sleep(2000 * attempt); // 指数退避
      }
    }
  }
}
```

---

## 8. 构建与分发

### 8.1 构建配置

```json
{
  "bundle": {
    "identifier": "com.openclaw.chat",
    "category": "Developer Tool",
    "shortDescription": "OpenClaw AI 对话客户端",
    "longDescription": "本地桌面应用，支持实时 AI 对话、流式响应、图片附件"
  }
}
```

### 8.2 构建命令

```bash
# 开发模式
npm run tauri dev

# 构建 macOS 版本
npm run tauri build -- --target universal-apple-darwin

# 构建 Windows 版本
npm run tauri build -- --target x86_64-pc-windows-msvc
```

### 8.3 输出产物

```
dist/
├── OpenClawChat_0.1.0_x64.dmg        # macOS 安装包
├── OpenClawChat_0.1.0_x64.app        # macOS 应用
├── OpenClawChat_0.1.0_x64-setup.exe  # Windows 安装包
└── OpenClawChat_0.1.0_x64.exe        # Windows 可执行文件
```

---

## 9. 实施步骤

1. **初始化 Tauri 项目**
   - 安装 Tauri CLI
   - 创建项目结构

2. **数据库实现**
   - 设计表结构
   - 实现数据访问层

3. **后端命令开发**
   - WebSocket 通信
   - 文件操作
   - 配置管理

4. **前端迁移**
   - WXML → HTML
   - WXSS → CSS
   - API 适配层

5. **系统功能集成**
   - 系统托盘
   - 快捷键
   - 通知

6. **测试与构建**
   - 功能测试
   - 打包分发

---

**文档版本**: 1.0
**最后更新**: 2025-02-04

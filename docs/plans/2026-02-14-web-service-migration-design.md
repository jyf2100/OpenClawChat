# Tauri 桌面应用转 Web 服务设计方案

> 日期：2026-02-14
> 目标：快速构建 demo，最小改动迁移

## 1. 背景

当前项目是 Tauri v2 + React 19 桌面应用，核心功能是多网关聊天室 + 多 Agent 协作。需要将其转换为纯 Web 应用，支持 Docker 部署。

## 2. 需求决策

| 项目 | 决策 |
|------|------|
| 应用类型 | 纯静态 Web 应用（移除 Tauri） |
| WebSocket | 前端直连外部网关 |
| 数据存储 | 浏览器 localStorage |
| 部署方式 | Docker + Nginx |
| 实施策略 | 最小改动，快速构建 demo |

## 3. 整体架构

```
┌─────────────────────────────────────────────────┐
│                  Docker 容器                      │
│  ┌───────────────────────────────────────────┐  │
│  │              Nginx                         │  │
│  │         (静态文件服务)                      │  │
│  │         监听 80 端口                        │  │
│  └───────────────────────────────────────────┘  │
│                    │                            │
│  ┌───────────────────────────────────────────┐  │
│  │         React 静态文件                      │  │
│  │         (Vite 构建)                        │  │
│  │         index.html + assets               │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                         │
           用户浏览器访问 :80
                         │
              ┌──────────┴──────────┐
              │                     │
         HTTP 请求            WebSocket 直连
         获取静态页面              外部网关
```

**核心要点：**
- 单容器部署，Nginx 提供静态文件
- 前端直连外部网关 WebSocket
- localStorage 存储配置数据
- 无需后端服务

## 4. 代码改动

### 4.1 需要移除

```
src-tauri/                    # 整个 Tauri 目录删除
```

### 4.2 需要修改

| 文件 | 改动内容 |
|------|----------|
| `package.json` | 移除 Tauri 依赖和 scripts |
| `vite.config.ts` | 移除 Tauri 插件配置 |
| `src/hooks/useWebSocket.ts` | Tauri WebSocket → 浏览器原生 WebSocket |
| `src/stores/` | tauri-plugin-store → localStorage |

### 4.3 需要新增

```
docker/
├── Dockerfile              # 构建镜像
├── nginx.conf              # Nginx 配置
└── .dockerignore           # 忽略文件

docker-compose.yml          # 方便本地启动（可选）
src/utils/storage.ts        # localStorage 封装
```

## 5. 实施步骤

### 步骤 1：清理 Tauri 相关
- 删除 `src-tauri/` 目录
- 移除 `package.json` 中的 Tauri 依赖和 scripts
- 清理 `vite.config.ts` 中的 Tauri 插件

### 步骤 2：替换 WebSocket 实现
- 修改 `useWebSocket` hook，使用浏览器原生 WebSocket API
- 保持接口不变，只改底层实现

### 步骤 3：替换存储实现
- 创建 `src/utils/storage.ts` 封装 localStorage
- 修改现有 store 代码，调用新的 storage 工具

### 步骤 4：添加 Docker 配置
- 创建 `docker/Dockerfile`
- 创建 `docker/nginx.conf`
- 添加 `docker-compose.yml`（可选）

### 步骤 5：测试验证
- `npm run build` 确保构建成功
- `docker build` 构建镜像
- `docker run` 本地测试
- 验证 WebSocket 连接和页面功能

## 6. Dockerfile 参考

```dockerfile
# 阶段1: 构建
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 阶段2: 运行
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

## 7. nginx.conf 要点

- 配置 SPA 路由回退（所有路由返回 index.html）
- 静态资源缓存策略
- gzip 压缩

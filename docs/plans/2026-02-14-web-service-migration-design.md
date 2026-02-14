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

## 5. 成功标准

| # | 验收标准 | 验证命令 | 预期结果 |
|---|----------|----------|----------|
| 1 | TypeScript 编译通过 | `npx tsc --noEmit` | exit 0 |
| 2 | Vite 构建成功 | `npm run build` | exit 0, 生成 dist/ |
| 3 | 构建产物存在 | `ls dist/index.html` | 文件存在 |
| 4 | Docker 镜像构建成功 | `docker build -t clawchat-web . -f docker/Dockerfile` | exit 0 |
| 5 | 容器启动正常 | `docker run -d -p 8080:80 clawchat-web` | 容器运行中 |
| 6 | 页面可访问 | `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080` | 200 |

## 6. 风险分析

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| WebSocket 跨域限制 | 中 | 确认网关支持浏览器 WebSocket 连接 |
| localStorage 容量 5MB 限制 | 低 | 消息量可控，影响较小 |
| 动态 import '@tauri-apps' 报错 | 低 | 已有 try-catch + fallback |

## 7. 关键发现

> ⚠️ 代码已经做了浏览器兼容适配，实际改动范围比预期小很多！

| 模块 | 现状 | 需要改动 |
|------|------|----------|
| WebSocket | ✅ 已使用浏览器原生 API | 无需改动 |
| Storage | ✅ 已有环境检测 + fallback | 可选：简化代码 |
| Tauri 依赖 | ⚠️ 动态 import | 移除依赖即可 |

## 8. 实施任务（可执行）

### Task 1: 清理 Tauri 依赖
**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (自动更新)

**Step 1:** 移除 Tauri 相关依赖
```bash
npm uninstall @tauri-apps/api @tauri-apps/plugin-opener @tauri-apps/plugin-store @tauri-apps/cli
```

**Step 2:** 移除 Tauri 相关 scripts
```json
// 从 package.json scripts 中移除
"tauri": "tauri"
```

**Step 3:** 验证
```bash
npm run build
# 预期: 构建成功，无 Tauri 相关报错
```

---

### Task 2: 删除 Tauri 目录
**Files:**
- Delete: `src-tauri/` (整个目录)

**Step 1:** 删除目录
```bash
rm -rf src-tauri/
```

**Step 2:** 验证
```bash
ls src-tauri 2>&1
# 预期: No such file or directory
```

---

### Task 3: 清理 vite.config.ts
**Files:**
- Modify: `vite.config.ts`

**Step 1:** 移除 Tauri 相关注释和变量
```typescript
// 移除这行
const host = process.env.TAURI_DEV_HOST;

// server 配置中移除
host: host || false,
hmr: host ? { ... } : undefined,
watch: { ignored: ["**/src-tauri/**"] },
```

**Step 2:** 验证
```bash
npx tsc --noEmit
npm run build
# 预期: 无报错
```

---

### Task 4: 添加 Docker 配置
**Files:**
- Create: `docker/Dockerfile`
- Create: `docker/nginx.conf`
- Create: `docker/.dockerignore`
- Create: `docker-compose.yml`

**Step 1:** 创建目录和文件（见下方详细内容）

**Step 2:** 构建镜像
```bash
docker build -t clawchat-web . -f docker/Dockerfile
# 预期: Successfully built xxx
```

**Step 3:** 运行容器
```bash
docker run -d -p 8080:80 --name clawchat-test clawchat-web
curl http://localhost:8080
# 预期: 返回 HTML 内容
```

**Step 4:** 清理测试容器
```bash
docker rm -f clawchat-test
```

---

### Task 5: 端到端验证
**Step 1:** 完整构建流程
```bash
npm ci
npm run build
docker build -t clawchat-web . -f docker/Dockerfile
docker run -d -p 8080:80 --name clawchat-test clawchat-web
```

**Step 2:** 功能验证
- 浏览器访问 http://localhost:8080
- 验证页面加载正常
- 验证 WebSocket 连接（需要网关服务）

**Step 3:** 清理
```bash
docker rm -f clawchat-test
```

## 9. Docker 配置文件详情

### 9.1 docker/Dockerfile
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
CMD ["nginx", "-g", "daemon off;"]
```

### 9.2 docker/nginx.conf
```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;

    # 静态资源缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 9.3 docker/.dockerignore
```
node_modules/
dist/
src-tauri/
.git/
*.md
.claude/
.opencode/
```

### 9.4 docker-compose.yml（可选）
```yaml
version: '3.8'
services:
  clawchat-web:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "8080:80"
    restart: unless-stopped
```

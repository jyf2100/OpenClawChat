# OpenClaw Docker 部署手册

> 基于 Docker Compose 的 OpenClaw 一键部署方案，支持智谱 AI 等多种模型提供商。

## 目录

- [快速开始](#快速开始)
- [系统要求](#系统要求)
- [一键部署](#一键部署)
- [配置说明](#配置说明)
- [常用命令](#常用命令)
- [模型配置](#模型配置)
- [故障排查](#故障排查)
- [高级配置](#高级配置)

---

## 快速开始

### 30 秒快速部署

```bash
# 1. 进入项目目录
cd ~/openclaw-docker

# 2. 一键启动
./scripts/start.sh

# 3. 访问 Web UI
open http://127.0.0.1:18789
```

---

## 系统要求

### 硬件要求
- **CPU**: 2 核心以上推荐
- **内存**: 2GB 以上可用内存
- **磁盘**: 10GB 以上可用空间

### 软件要求
- **Docker**: 20.10+
- **Docker Compose**: V2 (已集成到 Docker CLI)
- **操作系统**: macOS / Linux / Windows (WSL2)

### 检查 Docker 环境

```bash
# 检查 Docker 版本
docker --version

# 检查 Docker Compose
docker compose version

# 检查 Docker 状态
docker ps
```

---

## 一键部署

### 方式一：使用部署脚本（推荐）

```bash
cd ~/openclaw-docker
chmod +x scripts/*.sh
./scripts/start.sh
```

### 方式二：手动部署

```bash
# 1. 确保在项目目录
cd ~/openclaw-docker

# 2. 确保 .env 文件存在且配置正确
cat .env

# 3. 启动服务
docker compose up -d

# 4. 等待服务启动
sleep 10

# 5. 验证状态
docker compose ps
docker logs openclaw-gateway --tail 20
```

### 验证部署成功

```bash
# 1. 检查容器状态（应该是 Up (healthy)）
docker ps | grep openclaw-gateway

# 2. 检查日志中的绑定地址（应该是 0.0.0.0:18789）
docker logs openclaw-gateway | grep "listening on"

# 3. 测试 Web UI 访问
curl -I http://127.0.0.1:18789/

# 4. 运行诊断
./scripts/diagnose.sh
```

---

## 配置说明

### 环境变量配置 (.env)

```bash
# ============================================
# Gateway 基础配置
# ============================================
# Gateway 认证 Token（64位十六进制）
GATEWAY_TOKEN=73c4741e098ea7d589859385a7dee91b03b4505dfe5f4f6d6faa67dd3adca738

# ============================================
# 模型提供商配置
# ============================================
# 智谱 AI (Zhipu GLM) - 推荐
ZAI_API_KEY=your_zhipu_api_key_here

# OpenAI（可选）
# OPENAI_API_KEY=your_openai_api_key_here

# Claude（可选）
# ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Google Gemini（可选）
# GEMINI_API_KEY=your_gemini_api_key_here
```

### 生成新的 GATEWAY_TOKEN

```bash
# 生成随机 Token
openssl rand -hex 32
```

### Docker Compose 配置详解

#### 端口说明
| 端口 | 用途 | 说明 |
|------|------|------|
| 18789 | Gateway WebSocket / Web UI | 主要服务端口 |
| 18790 | Bridge | 桥接服务端口 |

#### 卷挂载说明
| 卷名 | 路径 | 用途 |
|------|------|------|
| openclaw_config | /home/node/.openclaw | 配置文件存储 |
| openclaw_workspace | /home/node/.openclaw/workspace | 工作区数据 |

#### 关键配置说明

```yaml
# 启动命令 - 关键配置
command:
  [
    "node",
    "dist/index.js",
    "gateway",
    "--bind",                # 绑定地址参数
    "lan",                   # lan = 0.0.0.0（所有接口）
    "--port",
    "18789",
    "--allow-unconfigured",  # 允许未配置启动
  ]
```

**重要**:
- `--bind lan` 是关键，让 Gateway 绑定到 `0.0.0.0` 而非 `127.0.0.1`
- `--allow-unconfigured` 绕过配置检查，避免启动失败

---

## 常用命令

### 服务管理

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose stop

# 重启服务
docker compose restart

# 查看状态
docker compose ps

# 查看日志（实时）
docker logs openclaw-gateway -f

# 查看最近 50 行日志
docker logs openclaw-gateway --tail 50

# 完全移除（包括数据卷）
docker compose down -v
```

### CLI 命令

```bash
# 运行 CLI
docker compose run --rm openclaw-cli --help

# 查看模型列表
docker compose run --rm openclaw-cli models list

# 查看所有可用模型（包括未配置的）
docker compose run --rm openclaw-cli models list --all

# 设置默认模型
docker compose run --rm openclaw-cli models set zai/glm-4.7

# 查看 Agent 列表
docker compose run --rm openclaw-cli agents list

# 创建新 Agent
docker compose run --rm openclaw-cli agents add myagent --model zai/glm-4.7 --workspace /home/node/.openclaw/workspace

# 运行诊断
docker compose run --rm openclaw-cli doctor
```

### 管理脚本

```bash
# 启动服务
./scripts/start.sh

# 停止服务
./scripts/stop.sh

# 查看状态
./scripts/status.sh

# 备份数据
./scripts/backup.sh

# 恢复数据
./scripts/restore.sh <backup-file>

# 运行诊断
./scripts/diagnose.sh
```

---

## 模型配置

### 智谱 AI (Zhipu GLM) - 推荐

#### 获取 API Key
1. 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
2. 注册/登录账号
3. 进入 API Keys 页面
4. 创建新的 API Key

#### 配置

```bash
# 编辑 .env 文件
nano .env

# 添加或修改：
ZAI_API_KEY=your_api_key_here

# 重启服务
docker compose restart
```

#### 可用模型

```bash
# 查看所有智谱模型
docker compose run --rm openclaw-cli models list --all | grep zai
```

| 模型 | 上下文 | 说明 | 推荐用途 |
|------|--------|------|----------|
| `zai/glm-4.7` | 200k | 最强版本 | 日常使用，复杂任务 |
| `zai/glm-4.7-flash` | 195k | 快速响应 | 简单对话，快速响应 |
| `zai/glm-4.6` | 200k | 标准版本 | 通用任务 |
| `zai/glm-4.5` | 128k | 轻量版本 | 成本敏感场景 |

#### 设置默认模型

```bash
# 设置为 glm-4.7
docker compose run --rm openclaw-cli models set zai/glm-4.7

# 设置为 glm-4.7-flash（更快）
docker compose run --rm openclaw-cli models set zai/glm-4.7-flash
```

### 其他模型提供商

#### OpenAI

```bash
# .env 文件
OPENAI_API_KEY=your_openai_api_key_here

# 重启服务
docker compose restart

# 设置模型
docker compose run --rm openclaw-cli models set openai/gpt-4o
```

#### Google Gemini

```bash
# .env 文件
GEMINI_API_KEY=your_gemini_api_key_here

# 重启服务
docker compose restart

# 设置模型
docker compose run --rm openclaw-cli models set google/gemini-2.0-flash-exp
```

#### Claude (Anthropic)

```bash
# .env 文件
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# 重启服务
docker compose restart

# 设置模型
docker compose run --rm openclaw-cli models set anthropic/claude-opus-4-5
```

---

## 故障排查

### 问题 1: Web UI 无法访问

**症状**: `curl http://127.0.0.1:18789/` 返回 `Connection refused`

**检查步骤**:

```bash
# 1. 检查容器状态
docker ps | grep openclaw-gateway

# 2. 检查日志中的绑定地址
docker logs openclaw-gateway | grep "listening on"
```

**应该看到**: `listening on ws://0.0.0.0:18789`

**如果看到**: `listening on ws://127.0.0.1:18789`

**解决方案**: 检查 `docker-compose.yml` 中的 command 配置：

```yaml
command:
  [
    "node",
    "dist/index.js",
    "gateway",
    "--bind",      # 必须是 "lan"
    "lan",         # 不是 "all"！
    "--port",
    "18789",
    "--allow-unconfigured",
  ]
```

### 问题 2: 容器不断重启

**症状**: `docker ps` 显示 `Restarting`

**检查步骤**:

```bash
# 查看错误日志
docker logs openclaw-gateway --tail 50
```

**常见错误**: `Gateway start blocked: set gateway.mode=local`

**解决方案**: 确保在 command 中添加 `--allow-unconfigured` 参数

### 问题 3: 模型未识别

**症状**: `Unknown model: zai/glm-4.7`

**检查步骤**:

```bash
# 1. 检查环境变量
docker exec openclaw-gateway printenv | grep ZAI_API_KEY

# 2. 检查模型是否可用
docker compose run --rm openclaw-cli models list --all | grep zai
```

**常见错误**:
- `zai/glm-4-flash` (错误)
- `zai/glm-4.7-flash` (正确)

**解决方案**: 使用正确的模型名称

### 问题 4: 权限错误

**症状**: `EACCES: permission denied` on canvas/cron 目录

**解决方案**:

```bash
# 修复卷权限
docker run --rm --user root \
  -v openclaw_docker_openclaw_config:/data \
  ghcr.io/openclaw/openclaw:latest \
  sh -c "chown -R 1000:1000 /data && chmod 755 /data/canvas /data/cron 2>/dev/null || true"

# 重启服务
docker compose restart
```

### 问题 5: 健康检查失败

**症状**: 容器状态显示 `(unhealthy)`

**检查步骤**:

```bash
# 1. 检查健康检查日志
docker inspect openclaw-gateway --format='{{json .State.Health}}' | python3 -m json.tool

# 2. 手动运行健康检查
docker exec openclaw-gateway node dist/index.js health
```

**解决方案**: 确保健康检查配置正确

```yaml
healthcheck:
  test: ["CMD", "node", "dist/index.js", "health"]
  # 不要使用 --token 参数
```

### 通用诊断

```bash
# 运行完整诊断
./scripts/diagnose.sh

# 或手动检查
echo "=== 1. Docker 状态 ==="
docker ps -a | grep openclaw

echo "=== 2. 端口监听 ==="
lsof -i :18789 -i :18790 2>/dev/null || netstat -an | grep 1879

echo "=== 3. 容器日志 ==="
docker logs openclaw-gateway --tail 20

echo "=== 4. 卷挂载 ==="
docker inspect openclaw-gateway --format='{{json .Mounts}}' | python3 -m json.tool
```

---

## 高级配置

### 自定义绑定地址

```yaml
# 绑定到特定 IP
command:
  [
    "node",
    "dist/index.js",
    "gateway",
    "--bind",
    "192.168.1.100",  # 自定义 IP
    "--port",
    "18789",
    "--allow-unconfigured",
  ]
```

### 资源限制

```yaml
deploy:
  resources:
    limits:
      cpus: '4'      # 最大 4 核
      memory: 4G     # 最大 4GB 内存
    reservations:
      cpus: '1'      # 保留 1 核
      memory: 1G     # 保留 1GB 内存
```

### 日志配置

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "50m"   # 单个日志文件最大 50MB
    max-file: "5"     # 保留 5 个日志文件
```

### 数据备份

#### 手动备份

```bash
# 备份到 tar.gz
docker run --rm \
  -v openclaw_docker_openclaw_config:/data \
  -v openclaw_docker_openclaw_workspace:/workspace \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/openclaw-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data /workspace

# 或使用脚本
./scripts/backup.sh
```

#### 自动备份（cron）

```bash
# 编辑 crontab
crontab -e

# 添加每天凌晨 2 点备份
0 2 * * * cd ~/openclaw-docker && ./scripts/backup.sh
```

### 数据恢复

```bash
# 使用脚本恢复
./scripts/restore.sh backups/openclaw-backup-20260205-020000.tar.gz

# 或手动恢复
docker run --rm \
  -v openclaw_docker_openclaw_config:/data \
  -v openclaw_docker_openclaw_workspace:/workspace \
  -v $(pwd):/backup \
  alpine tar xzf /backup/openclaw-backup-20260205-020000.tar.gz -C /
```

### 多模型配置

```bash
# .env 文件配置多个模型
ZAI_API_KEY=your_zhipu_key
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key

# 设置不同的 agent 使用不同的模型
docker compose run --rm openclaw-cli agents add chat --model zai/glm-4.7
docker compose run --rm openclaw-cli agents add code --model openai/gpt-4o
docker compose run --rm openclaw-cli agents add fast --model zai/glm-4.7-flash
```

### 创建管理脚本

#### start.sh

```bash
#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Starting OpenClaw Gateway..."
docker compose up -d
echo "⏳ Waiting for services to be ready..."
sleep 10
echo "✅ OpenClaw is ready!"
echo "🌐 Web UI: http://127.0.0.1:18789"
echo "📊 Status: ./scripts/status.sh"
```

#### stop.sh

```bash
#!/bin/bash
cd "$(dirname "$0")"
echo "🛑 Stopping OpenClaw Gateway..."
docker compose stop
echo "✅ Stopped"
```

#### status.sh

```bash
#!/bin/bash
cd "$(dirname "$0")"
echo "📊 OpenClaw Status"
echo "=================="
echo ""
echo "📦 Containers:"
docker compose ps
echo ""
echo "📋 Recent Logs:"
docker logs openclaw-gateway --tail 10
echo ""
echo "🌐 Web UI: http://127.0.0.1:18789"
```

---

## 附录

### 项目目录结构

```
~/openclaw-docker/
├── docker-compose.yml    # Docker Compose 配置
├── .env                  # 环境变量配置（不提交到 Git）
├── .gitignore           # Git 忽略文件
├── README.md            # 本文档
└── scripts/             # 管理脚本
    ├── start.sh         # 启动脚本
    ├── stop.sh          # 停止脚本
    ├── status.sh        # 状态查看
    ├── backup.sh        # 备份脚本
    ├── restore.sh       # 恢复脚本
    └── diagnose.sh      # 诊断脚本
```

### 数据持久化说明

所有数据通过 Docker 命名卷持久化：

| 卷名 | 用途 | 备份建议 |
|------|------|----------|
| `openclaw_config` | 配置文件、Agent 设置 | 每周备份 |
| `openclaw_workspace` | 会话历史、工作区数据 | 每日备份 |

**数据存储位置**: `/var/lib/docker/volumes/openclaw_docker_*/_data/`

### 相关链接

- [OpenClaw 官方文档](https://docs.openclaw.ai/)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [Docker 官方文档](https://docs.docker.com/)

### 版本信息

- OpenClaw 版本: 2026.2.3
- Docker Image: `ghcr.io/openclaw/openclaw:latest`
- 文档更新时间: 2026-02-05

---

## 获取帮助

遇到问题？

1. 查看 [故障排查](#故障排查) 章节
2. 运行诊断脚本: `./scripts/diagnose.sh`
3. 查看日志: `docker logs openclaw-gateway -f`
4. 访问 [OpenClaw Docs](https://docs.openclaw.ai/)
5. 提交 [GitHub Issue](https://github.com/openclaw/openclaw/issues)

---

## 更新日志

### 2026-02-05
- ✅ 修复 Gateway 绑定问题（使用 `--bind lan`）
- ✅ 添加智谱 AI 配置支持
- ✅ 完善故障排查文档
- ✅ 添加管理脚本

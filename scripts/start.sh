#!/bin/bash
set -euo pipefail

echo "启动 OpenClaw Gateway..."
docker compose up -d openclaw-gateway

echo "等待服务启动..."
sleep 30

echo "检查服务状态..."
docker compose ps

echo ""
echo "Gateway 已启动!"
echo "Web UI: http://localhost:18790"
echo "WebSocket: ws://localhost:18789"

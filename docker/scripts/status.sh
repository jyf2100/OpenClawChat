#!/bin/bash
set -euo pipefail

echo "=== OpenClaw Docker 状态 ==="
echo ""

echo "容器状态:"
docker compose ps
echo ""

echo "资源使用:"
docker stats openclaw-gateway --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
echo ""

echo "卷使用情况:"
docker volume ls | grep openclaw
echo ""

echo "最近日志:"
docker compose logs --tail=5 openclaw-gateway

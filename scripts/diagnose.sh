#!/bin/bash
set -euo pipefail

echo "=== OpenClaw 诊断工具 ==="
echo ""

echo "1. Docker 服务状态:"
docker info > /dev/null 2>&1 && echo "   ✓ Docker 运行中" || echo "   ✗ Docker 未运行"
echo ""

echo "2. 容器状态:"
if docker compose ps 2>/dev/null | grep -q "openclaw-gateway.*Up"; then
  echo "   ✓ Gateway 容器运行中"
else
  echo "   ✗ Gateway 容器未运行"
fi
echo ""

echo "3. 端口占用:"
if lsof -i :18789 > /dev/null 2>&1; then
  echo "   ✓ 端口 18789 已监听"
else
  echo "   ✗ 端口 18789 未监听"
fi

if lsof -i :18790 > /dev/null 2>&1; then
  echo "   ✓ 端口 18790 已监听"
else
  echo "   ✗ 端口 18790 未监听"
fi
echo ""

echo "4. 卷挂载:"
if docker volume ls | grep -q openclaw-docker; then
  echo "   ✓ 持久化卷已创建"
else
  echo "   ✗ 持久化卷未创建"
fi
echo ""

echo "5. 最近错误日志:"
echo "   查找 ERROR 关键词..."
docker compose logs openclaw-gateway 2>&1 | grep -i error | tail -5 || echo "   无错误日志"
echo ""

echo "6. 服务监听状态:"
if docker compose logs openclaw-gateway 2>&1 | grep -q "listening on"; then
  echo "   ✓ Gateway 正在监听端口"
else
  echo "   ✗ Gateway 未监听"
fi

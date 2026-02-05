#!/bin/bash
set -euo pipefail

BACKUP_DIR="$HOME/openclaw-backups"

if [ $# -eq 0 ]; then
  echo "可用的备份文件:"
  ls -lt "$BACKUP_DIR"/openclaw-*.tar.gz 2>/dev/null | head -10 || echo "  无备份文件"
  echo ""
  echo "使用方法: $0 <backup-file>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "错误: 备份文件不存在: $BACKUP_FILE"
  exit 1
fi

echo "警告: 此操作将覆盖当前数据!"
echo "备份文件: $BACKUP_FILE"
read -p "确认恢复? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "取消恢复"
  exit 0
fi

echo "停止服务..."
docker compose down

echo "恢复数据..."
docker run --rm \
  -v openclaw-docker_openclaw_config:/data \
  -v openclaw-docker_openclaw_workspace:/workspace \
  -v "$(dirname "$BACKUP_FILE")":/backup \
  alpine sh -c "cd / && tar xzf /backup/$(basename "$BACKUP_FILE")"

echo "重启服务..."
docker compose up -d openclaw-gateway

echo "等待服务启动..."
sleep 30

echo "恢复完成!"
./scripts/status.sh

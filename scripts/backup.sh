#!/bin/bash
set -euo pipefail

BACKUP_DIR="$HOME/openclaw-backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M)
BACKUP_FILE="$BACKUP_DIR/openclaw-$TIMESTAMP.tar.gz"

echo "开始备份 OpenClaw 数据..."
docker run --rm \
  -v openclaw-docker_openclaw_config:/data \
  -v openclaw-docker_openclaw_workspace:/workspace \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/openclaw-$TIMESTAMP.tar.gz" /data /workspace

echo "备份完成: $BACKUP_FILE"

# 清理 30 天前的备份
find "$BACKUP_DIR" -name "openclaw-*.tar.gz" -mtime +30 -delete

echo "旧备份已清理"

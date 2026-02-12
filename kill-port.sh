#!/bin/bash
# 清理端口 1420 占用

echo "🔍 检查端口 1420..."

PID=$(lsof -ti:1420)

if [ -n "$PID" ]; then
  echo "🔪 杀掉进程 $PID"
  kill -9 $PID
  echo "✅ 端口 1420 已释放"
else
  echo "✅ 端口 1420 未被占用"
fi

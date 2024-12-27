#!/bin/bash

# 查找运行 app.py 的进程
PIDS=$(ps aux | grep 'python3 app.py' | grep -v grep | awk '{print $2}')

if [ -z "$PIDS" ]; then
  echo "未找到运行的 Flask 应用程序 (app.py)。"
else
  # 杀死所有匹配的进程
  echo "正在停止 Flask 应用程序..."
  kill -9 $PIDS
  echo "Flask 应用程序已停止。"
fi
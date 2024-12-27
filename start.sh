#!/bin/bash

# 创建日志目录
LOG_DIR="./log"
if [ ! -d "$LOG_DIR" ]; then
  mkdir -p "$LOG_DIR"
fi

# 检查是否安装了 Flask
if ! python3 -c "import flask" &> /dev/null; then
  echo "Flask 未安装，正在安装 Flask..."
  pip3 install flask
fi

# 获取当前日期
DATE=$(date +"%Y-%m-%d")
LOG_FILE="$LOG_DIR/$DATE.log"

# 启动 Flask 应用
# Flask 应用文件为 app.py
nohup python3 app.py > "$LOG_FILE" 2>&1 &

# 输出启动信息
echo "Flask 应用已启动，日志文件位于: $LOG_FILE"
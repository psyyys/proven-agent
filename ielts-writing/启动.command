#!/bin/bash
# macOS：双击运行
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js，请先到 https://nodejs.org 下载安装（选 LTS 版本），装好后再双击本文件。"
  read -r -p "按回车键关闭…"
  exit 1
fi
node server.js --open

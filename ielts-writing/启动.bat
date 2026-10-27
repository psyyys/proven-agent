@echo off
chcp 65001 >nul
title 雅思写作练习
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 Node.js，请先到 https://nodejs.org 下载安装（选 LTS 版本），装好后再双击本文件。
  pause
  exit /b 1
)
node server.js --open
pause

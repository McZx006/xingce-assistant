@echo off
rem 停止监听 5173 端口的本地服务进程（含其子进程树）
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try { taskkill /PID $_.OwningProcess /T /F 2>$null | Out-Null } catch {} }"
exit /b 0

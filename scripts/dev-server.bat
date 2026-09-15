@echo off
rem 常驻运行 Vite 开发服务器（由 dev-run.vbs 隐藏窗口启动）
rem 标准输出与错误全部写入 logs\dev.log
cd /d "%~dp0.."
if not exist "logs" mkdir logs
call npm run dev >> "logs\dev.log" 2>&1

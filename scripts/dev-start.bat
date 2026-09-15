@echo off
rem ============================================================
rem 行测小助手 · 一键启动逻辑（由根目录 VBS 隐藏调用，勿双击）
rem 流程：检测 Node -> 已运行则直接开浏览器 -> 首次自动 npm install
rem       -> 隐藏启动 dev server -> 等待端口就绪 -> 打开浏览器
rem 所有输出写入 logs\dev.log，出错弹窗提示
rem ============================================================
cd /d "%~dp0.."
set "ROOT=%CD%"
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"
set "LOG=%ROOT%\logs\dev.log"

where node >nul 2>nul
if errorlevel 1 goto NONODE

rem 服务已在运行 -> 直接打开浏览器
call :CHECKPORT
if "%PORTOPEN%"=="1" (
  start "" "http://localhost:5173/"
  exit /b 0
)

rem 首次运行：自动安装依赖
if not exist "%ROOT%\node_modules" (
  echo [%date% %time%] 首次启动，正在安装依赖 npm install，请稍候... > "%LOG%"
  call npm install --no-audit --no-fund >> "%LOG%" 2>&1
  if errorlevel 1 goto INSTALLFAIL
)

echo [%date% %time%] 正在启动开发服务器... >> "%LOG%"
rem 通过独立 VBS 隐藏启动常驻服务进程（父进程退出后仍存活）
start "" wscript.exe "%ROOT%\scripts\dev-run.vbs"

rem 等待端口就绪，最多 90 秒
set /a N=0
:WAIT
set /a N+=1
if %N% GTR 90 goto STARTFAIL
ping 127.0.0.1 -n 2 >nul
call :CHECKPORT
if "%PORTOPEN%"=="0" goto WAIT

start "" "http://localhost:5173/"
exit /b 0

:CHECKPORT
set PORTOPEN=0
for /f %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',5173);$c.Close();1}catch{0}"') do set PORTOPEN=%%i
exit /b

:NONODE
mshta "javascript:new ActiveXObject('WScript.Shell').Popup('未检测到 Node.js，无法启动。' + String.fromCharCode(10) + '请先安装 LTS 版本（16 或以上）：' + String.fromCharCode(10) + 'https://nodejs.org/',0,'行测小助手 - 无法启动',16);close()"
exit /b 1

:INSTALLFAIL
mshta "javascript:new ActiveXObject('WScript.Shell').Popup('依赖安装失败，请查看日志文件：' + String.fromCharCode(10) + 'logs\dev.log',0,'行测小助手 - 启动失败',16);close()"
exit /b 1

:STARTFAIL
mshta "javascript:new ActiveXObject('WScript.Shell').Popup('开发服务器启动超时（90 秒），请查看日志文件：' + String.fromCharCode(10) + 'logs\dev.log',0,'行测小助手 - 启动失败',16);close()"
exit /b 1

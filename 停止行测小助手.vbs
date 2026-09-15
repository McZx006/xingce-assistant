' 行测小助手 · 一键停止入口（双击运行，无黑窗）
' 职责：隐藏调用 scripts\dev-stop.bat 关闭 5173 端口的本地服务，完成后弹窗提示
Option Explicit
Dim sh, fso, root
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root
sh.Run "cmd /c """ & root & "\scripts\dev-stop.bat""", 0, True
sh.Popup "本地服务已停止。" & Chr(10) & "下次使用请双击「启动行测小助手」。", 4, "行测小助手", 64

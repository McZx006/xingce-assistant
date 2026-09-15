' 行测小助手 · 一键启动入口（双击运行，无黑窗）
' 职责：隐藏调用 scripts\dev-start.bat（检测 Node、首次自动装依赖、起服务、开浏览器）
Option Explicit
Dim sh, fso, root
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root
sh.Run "cmd /c """ & root & "\scripts\dev-start.bat""", 0, False

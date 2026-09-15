' 以完全隐藏窗口的方式启动常驻 dev server（dev-server.bat）
Option Explicit
Dim sh, fso, scriptDir, rootDir
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)
sh.CurrentDirectory = rootDir
sh.Run "cmd /c """ & scriptDir & "\dev-server.bat""", 0, False

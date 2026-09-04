@echo off
setlocal

node "%~dp0scripts\start-windows.mjs" %*
set "DSH_START_EXIT=%ERRORLEVEL%"

if not "%DSH_START_EXIT%"=="0" pause
exit /b %DSH_START_EXIT%

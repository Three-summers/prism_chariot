@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\start.ps1"
if errorlevel 1 (
  echo.
  echo Failed to start the AMHS dashboard.
  pause
)

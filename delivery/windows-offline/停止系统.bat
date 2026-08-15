@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\stop.ps1"
if errorlevel 1 (
  echo.
  echo Failed to stop the AMHS dashboard.
  pause
)

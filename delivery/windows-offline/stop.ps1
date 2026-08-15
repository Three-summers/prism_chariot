$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path (Join-Path $packageRoot '.runtime') 'server.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host 'AMHS dashboard is not running.'
  exit 0
}

$savedPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if ($savedPid -match '^\d+$') {
  $server = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
  if ($server -and $server.ProcessName -eq 'caddy') {
    Stop-Process -Id $server.Id -Force
    $server.WaitForExit()
    Write-Host 'AMHS dashboard stopped.'
  } else {
    Write-Host 'The saved server process is no longer running.'
  }
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue

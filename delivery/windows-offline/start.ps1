$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $PSScriptRoot
$serverExe = Join-Path $PSScriptRoot 'caddy.exe'
$appRoot = Join-Path $packageRoot 'app'
$runtimeDir = Join-Path $packageRoot '.runtime'
$pidFile = Join-Path $runtimeDir 'server.pid'
$stdoutFile = Join-Path $runtimeDir 'caddy-output.log'
$stderrFile = Join-Path $runtimeDir 'caddy-error.log'
$port = 18080
$url = "http://127.0.0.1:$port/"

function Open-Dashboard {
  if ($env:AMHS_NO_BROWSER -ne '1') {
    Start-Process $url
  }
}

if (-not (Test-Path -LiteralPath $serverExe -PathType Leaf)) {
  throw "Missing offline server: $serverExe"
}

if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'index.html') -PathType Leaf)) {
  throw "Missing application files: $appRoot"
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

if (Test-Path -LiteralPath $pidFile) {
  $savedPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($savedPid -match '^\d+$') {
    $existing = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
    if ($existing -and $existing.ProcessName -eq 'caddy') {
      Open-Dashboard
      Write-Host "AMHS dashboard is already running at $url"
      exit 0
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

$server = Start-Process `
  -FilePath $serverExe `
  -ArgumentList @('file-server', '--root', 'app', '--listen', "127.0.0.1:$port", '--access-log') `
  -WorkingDirectory $packageRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutFile `
  -RedirectStandardError $stderrFile `
  -PassThru

Set-Content -LiteralPath $pidFile -Value $server.Id -Encoding ascii

for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Milliseconds 200
  if ($server.HasExited) { break }
  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null
    Open-Dashboard
    Write-Host "AMHS dashboard started at $url"
    exit 0
  } catch {
    # The server may still be starting.
  }
}

if (-not $server.HasExited) {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
throw "Unable to start the dashboard. See $stderrFile"

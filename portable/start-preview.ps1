$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root ".sayfashion.pid"
$url = "http://127.0.0.1:3210"

Set-Location $root

if (Test-Path -LiteralPath $pidFile) {
  $oldPid = [int](Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue)
  if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
    Start-Process $url
    Write-Host "SAY Fashion is already running at $url"
    exit 0
  }
  Remove-Item -LiteralPath $pidFile -Force
}

foreach ($line in Get-Content -LiteralPath (Join-Path $root ".env")) {
  if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
  }
}

$stdout = Join-Path $root "sayfashion.log"
$stderr = Join-Path $root "sayfashion-error.log"
$server = Start-Process -FilePath (Join-Path $root "node.exe") -ArgumentList "server.js" -WorkingDirectory $root -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
[IO.File]::WriteAllText($pidFile, [string]$server.Id)

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($server.HasExited) { break }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "$url/api/health" -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }

  if (!$ready) {
    Write-Host "The shop could not start. See sayfashion-error.log" -ForegroundColor Red
    if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Tail 20 }
    exit 1
  }

  Start-Process $url
  Write-Host ""
  Write-Host "SAY Fashion is running: $url" -ForegroundColor Green
  Write-Host "Admin: $url/admin"
  Write-Host "Admin password: demo2026"
  Write-Host ""
  Write-Host "Press ENTER to stop the shop."
  [void][Console]::ReadLine()
}
finally {
  if (!$server.HasExited) { & taskkill /PID $server.Id /T /F | Out-Null }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

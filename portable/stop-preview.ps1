$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root ".sayfashion.pid"

if (!(Test-Path -LiteralPath $pidFile)) {
  Write-Host "SAY Fashion is not running."
  exit 0
}

$serverPid = [int](Get-Content -LiteralPath $pidFile)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process) {
  & taskkill /PID $serverPid /T /F | Out-Null
  Write-Host "SAY Fashion stopped."
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue

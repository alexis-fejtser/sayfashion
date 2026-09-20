$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

# Keep this file ASCII-only: Windows PowerShell 5 reads UTF-8 files without a BOM
# using the system code page and can otherwise corrupt quoted strings.
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed or npm is not available in PATH. Install Node.js 22 LTS and try again."
}

if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
  Write-Host "Created .env. Set ADMIN_PASSWORD before production use." -ForegroundColor Yellow
}

if (-not (Test-Path -LiteralPath "node_modules")) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  & npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
}

# Next.js allows only one dev server per project. Reuse it when the user
# double-clicks the launcher again instead of starting a conflicting process.
$projectPattern = [regex]::Escape($PSScriptRoot)
$existingProcess = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -match $projectPattern -and
    $_.CommandLine -match "next\\dist\\server\\lib\\start-server"
  } |
  Select-Object -First 1

if ($null -ne $existingProcess) {
  $existingConnection = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -eq $existingProcess.ProcessId } |
    Select-Object -First 1
  if ($null -ne $existingConnection) {
    $existingPort = $existingConnection.LocalPort
    Write-Host "SAY Fashion is already running." -ForegroundColor Yellow
    Write-Host "Store: http://localhost:$existingPort" -ForegroundColor Green
    Write-Host "Admin: http://localhost:$existingPort/admin" -ForegroundColor Green
    exit 0
  }
}

$port = 3000
while ($port -lt 3010) {
  $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $inUse) { break }
  $port++
}

if ($port -ge 3010) { throw "No free local port found between 3000 and 3009." }

Write-Host "Store: http://localhost:$port" -ForegroundColor Green
Write-Host "Admin: http://localhost:$port/admin" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor DarkGray
& npm run dev -- -p $port
if ($LASTEXITCODE -ne 0) { throw "The local server stopped with an error." }

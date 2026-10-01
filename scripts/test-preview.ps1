$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Join-Path $projectRoot "dist\SayFashion-Preview"
$envFile = Join-Path $package ".env"
$envMap = @{}

Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    $envMap[$Matches[1]] = $Matches[2]
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
  }
}

$stdout = Join-Path $package "test-output.log"
$stderr = Join-Path $package "test-error.log"
$server = Start-Process -FilePath (Join-Path $package "node.exe") -ArgumentList "server.js" -WorkingDirectory $package -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

try {
  $health = $null
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try { $health = Invoke-RestMethod "http://127.0.0.1:3210/api/health" -TimeoutSec 2; break }
    catch { Start-Sleep -Milliseconds 500 }
  }
  if (!$health) { throw (Get-Content -Raw -LiteralPath $stderr) }

  $homeResponse = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3210"
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $login = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://127.0.0.1:3210/api/admin/login" -WebSession $session -ContentType "application/json" -Body '{"password":"demo2026"}'
  $admin = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3210/admin" -WebSession $session
  $store = Get-Content -Raw -LiteralPath (Join-Path $package "data\store.json") | ConvertFrom-Json
  $zip = Get-Item -LiteralPath (Join-Path $projectRoot "dist\SayFashion-Preview-Windows-x64.zip")

  [pscustomobject]@{
    Health = $health.ok
    Storage = $health.database.storage
    HomeStatus = $homeResponse.StatusCode
    LoginStatus = $login.StatusCode
    AdminStatus = $admin.StatusCode
    Products = @($store.products).Count
    Orders = @($store.orders).Count
    OpenRouterIncluded = ![string]::IsNullOrWhiteSpace($envMap["OPENROUTER_API_KEY"])
    BePaidTest = $envMap["BEPAID_TEST"]
    ZipMB = [math]::Round($zip.Length / 1MB, 1)
  } | Format-List
}
finally {
  if (!$server.HasExited) { Stop-Process -Id $server.Id -Force }
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
}

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
$target = [IO.Path]::GetFullPath((Join-Path $distRoot "SayFashion-Preview"))
$zipPath = [IO.Path]::GetFullPath((Join-Path $distRoot "SayFashion-Preview-Windows-x64.zip"))

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (!(Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
  }
  return $values
}

function Env-Value($Values, [string]$Name, [string]$Fallback = "") {
  if ($Values.ContainsKey($Name)) { return [string]$Values[$Name] }
  return $Fallback
}

if (!$target.StartsWith($distRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe output path." }

Push-Location $projectRoot
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "Next.js build failed." }

  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  New-Item -ItemType Directory -Path $target | Out-Null

  Copy-Item -Path (Join-Path $projectRoot ".next\standalone\*") -Destination $target -Recurse -Force
  New-Item -ItemType Directory -Path (Join-Path $target ".next\static") -Force | Out-Null
  Copy-Item -Path (Join-Path $projectRoot ".next\static\*") -Destination (Join-Path $target ".next\static") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot "public") -Destination (Join-Path $target "public") -Recurse -Force
  Copy-Item -Path (Join-Path $projectRoot "portable\*") -Destination $target -Recurse -Force

  $nodePath = (Get-Command node -ErrorAction Stop).Source
  if ((& $nodePath -p "process.platform + '-' + process.arch") -ne "win32-x64") { throw "Windows x64 Node.js is required." }
  Copy-Item -LiteralPath $nodePath -Destination (Join-Path $target "node.exe") -Force

  $storePath = Join-Path $projectRoot "data\store.json"
  $products = @()
  if (Test-Path -LiteralPath $storePath) { $products = @((Get-Content -Raw -LiteralPath $storePath | ConvertFrom-Json).products) }
  $previewStore = [ordered]@{ products = $products; orders = @(); prompts = @() }
  $dataDirectory = Join-Path $target "data"
  New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $dataDirectory "store.json"), ($previewStore | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))

  $randomBytes = New-Object byte[] 48
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($randomBytes) } finally { $random.Dispose() }
  $authSecret = [Convert]::ToBase64String($randomBytes)
  $localEnv = Read-EnvFile (Join-Path $projectRoot ".env")
  $envLines = @(
    "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3210",
    "PORT=3210",
    "HOSTNAME=127.0.0.1",
    "COOKIE_SECURE=false",
    "ADMIN_PASSWORD=demo2026",
    "AUTH_SECRET=$authSecret",
    "OPENROUTER_API_KEY=$(Env-Value $localEnv 'OPENROUTER_API_KEY')",
    "OPENROUTER_VISION_MODEL=$(Env-Value $localEnv 'OPENROUTER_VISION_MODEL' 'google/gemini-2.5-flash')",
    "OPENROUTER_IMAGE_MODEL=$(Env-Value $localEnv 'OPENROUTER_IMAGE_MODEL' 'google/gemini-3.1-flash-image')",
    "BEPAID_SHOP_ID=$(Env-Value $localEnv 'BEPAID_SHOP_ID')",
    "BEPAID_SECRET_KEY=$(Env-Value $localEnv 'BEPAID_SECRET_KEY')",
    "BEPAID_PUBLIC_KEY=$(Env-Value $localEnv 'BEPAID_PUBLIC_KEY')",
    "BEPAID_TEST=$(Env-Value $localEnv 'BEPAID_TEST' 'true')",
    "EUROPOST_API_URL=$(Env-Value $localEnv 'EUROPOST_API_URL' 'https://evropochta.by/rest/Json')",
    "EUROPOST_SERVICE_NUMBER=$(Env-Value $localEnv 'EUROPOST_SERVICE_NUMBER' 'E811AE79-DFDE-4F85-8715-DD3A8308707E')",
    "EUROPOST_DELIVERY_PRICE=$(Env-Value $localEnv 'EUROPOST_DELIVERY_PRICE' '7.90')"
  )
  [IO.File]::WriteAllLines((Join-Path $target ".env"), $envLines, [Text.UTF8Encoding]::new($false))

  Compress-Archive -LiteralPath $target -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "Preview package created: $zipPath" -ForegroundColor Green
}
finally {
  Pop-Location
}

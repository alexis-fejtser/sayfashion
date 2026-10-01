$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceEnv = Join-Path $projectRoot ".env"
$targetEnv = Join-Path $projectRoot ".env.production"

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (!(Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
  }
  return $values
}

function New-RandomSecret([int]$Bytes = 48) {
  $buffer = New-Object byte[] $Bytes
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($buffer) }
  finally { $generator.Dispose() }
  return [Convert]::ToBase64String($buffer)
}

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$local = Read-EnvFile $sourceEnv
$domain = (Read-Host "Store domain without https:// (example: shop.example.by)").Trim().TrimEnd("/")
$domain = $domain -replace '^https?://', ''
if ($domain -notmatch '^[A-Za-z0-9.-]+$') { throw "Invalid domain." }

$adminPassword = Read-Secret "New admin password"
if ($adminPassword.Length -lt 12) { throw "Admin password must contain at least 12 characters." }

$keysToCopy = @(
  "OPENROUTER_API_KEY", "OPENROUTER_VISION_MODEL", "OPENROUTER_IMAGE_MODEL",
  "BEPAID_SHOP_ID", "BEPAID_SECRET_KEY", "BEPAID_PUBLIC_KEY", "BEPAID_TEST",
  "EUROPOST_API_URL", "EUROPOST_SERVICE_NUMBER", "EUROPOST_DELIVERY_PRICE"
)

$values = [ordered]@{
  DOMAIN = $domain
  NEXT_PUBLIC_APP_URL = "https://$domain"
  ADMIN_PASSWORD = $adminPassword
  AUTH_SECRET = New-RandomSecret
  POSTGRES_PASSWORD = New-RandomSecret
}
foreach ($key in $keysToCopy) { if ($local.ContainsKey($key)) { $values[$key] = $local[$key] } }

$defaults = Read-EnvFile (Join-Path $projectRoot ".env.production.example")
foreach ($key in $defaults.Keys) { if (!$values.Contains($key)) { $values[$key] = $defaults[$key] } }

$content = @(
  "# Production configuration. Do not commit this file.",
  "# Created: $([DateTime]::UtcNow.ToString('u'))",
  ""
)
foreach ($entry in $values.GetEnumerator()) { $content += "$($entry.Key)=$($entry.Value)" }
[IO.File]::WriteAllLines($targetEnv, $content, [Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Created .env.production" -ForegroundColor Green
Write-Host "Check DOMAIN, bePaid and OpenRouter before deployment. This file is excluded from Git."

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$productionEnv = Join-Path $projectRoot ".env.production"
$archive = Join-Path $projectRoot "deploy-package.tar.gz"

if (!(Test-Path -LiteralPath $productionEnv)) {
  Write-Host "Run prepare-production.cmd first." -ForegroundColor Yellow
  exit 1
}

$hostName = (Read-Host "hoster.by server IP or SSH hostname").Trim()
$sshUser = (Read-Host "SSH user [root]").Trim()
if (!$sshUser) { $sshUser = "root" }
$portText = (Read-Host "SSH port [22]").Trim()
$sshPort = if ($portText) { [int]$portText } else { 22 }
$remotePath = (Read-Host "Project directory [/opt/sayfashion]").Trim()
if (!$remotePath) { $remotePath = "/opt/sayfashion" }

if ($hostName -notmatch '^[A-Za-z0-9.-]+$') { throw "Invalid server address." }
if ($sshUser -notmatch '^[A-Za-z_][A-Za-z0-9_-]*$') { throw "Invalid SSH user." }
if ($sshPort -lt 1 -or $sshPort -gt 65535) { throw "Invalid SSH port." }
if ($remotePath -notmatch '^/[A-Za-z0-9._/-]+$') { throw "Invalid project path." }

foreach ($command in @("ssh", "scp", "tar")) {
  if (!(Get-Command $command -ErrorAction SilentlyContinue)) { throw "Command $command was not found. Install OpenSSH Client." }
}

Push-Location $projectRoot
try {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
  & tar -czf $archive `
    --exclude=.git --exclude=node_modules --exclude=.next --exclude=.env --exclude=.env.production `
    --exclude=data --exclude=runtime --exclude=backups --exclude=deploy-package.tar.gz .
  if ($LASTEXITCODE -ne 0) { throw "Could not build the deployment archive." }

  $target = "${sshUser}@${hostName}"
  Write-Host "Uploading the project..." -ForegroundColor Cyan
  & scp -P $sshPort $archive $productionEnv (Join-Path $PSScriptRoot "setup-server.sh") "${target}:/tmp/"
  if ($LASTEXITCODE -ne 0) { throw "Could not upload files to the server." }

  $remoteCommand = "if [ `"`$(id -u)`" -eq 0 ]; then SUDO=''; else SUDO='sudo'; fi; " +
    "`$SUDO bash /tmp/setup-server.sh '$remotePath' '$sshUser'; " +
    "`$SUDO tar -xzf /tmp/deploy-package.tar.gz -C '$remotePath'; " +
    "`$SUDO cp /tmp/.env.production '$remotePath/.env'; `$SUDO chmod 600 '$remotePath/.env'; " +
    "cd '$remotePath'; `$SUDO docker compose up -d --build --remove-orphans; " +
    "`$SUDO docker compose exec -T shop wget -qO- http://127.0.0.1:3000/api/health; " +
    "rm -f /tmp/deploy-package.tar.gz /tmp/.env.production /tmp/setup-server.sh"

  Write-Host "Installing and starting containers..." -ForegroundColor Cyan
  & ssh -tt -p $sshPort $target $remoteCommand
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed. See the server output above." }

  $domainLine = Get-Content -LiteralPath $productionEnv | Where-Object { $_ -match '^DOMAIN=' } | Select-Object -First 1
  $domain = $domainLine -replace '^DOMAIN=', ''
  Write-Host ""
  Write-Host "Deployment complete: https://$domain" -ForegroundColor Green
  Write-Host "Health check: https://$domain/api/health"
}
finally {
  Pop-Location
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}

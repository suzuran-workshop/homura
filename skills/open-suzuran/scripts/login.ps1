# skills/open-suzuran/scripts/login.ps1
# Password login -> session -> token, stored at ~/.suzuran/token.json
# Usage: .\login.ps1 -Username xrl -Password demo1234 [-BaseUrl http://localhost:8888] [-OrgId 1]
param(
    [string]$Username,
    [string]$Password,
    [string]$BaseUrl = "http://localhost:8888",
    [int]$OrgId = 1
)

$ErrorActionPreference = "Stop"

if (-not $Username -or -not $Password) {
    Write-Error "Usage: .\login.ps1 -Username <u> -Password <p> [-BaseUrl <url>] [-OrgId <n>]"
    exit 1
}

$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
$r1 = Invoke-RestMethod -Uri "$BaseUrl/oauth/password/login" -Method Post `
    -ContentType "application/json" -Body $loginBody -TimeoutSec 15

$tokenBody = @{ sessionId = $r1.sessionId; orgId = $OrgId } | ConvertTo-Json
$r2 = Invoke-RestMethod -Uri "$BaseUrl/oauth/session/token" -Method Post `
    -ContentType "application/json" -Body $tokenBody -TimeoutSec 15

$tokenDir = Join-Path $HOME ".suzuran"
New-Item -ItemType Directory -Path $tokenDir -Force | Out-Null
$tokenFile = Join-Path $tokenDir "token.json"
$expiresAt = (Get-Date).AddMinutes(10).ToUniversalTime().ToString("o")
@{ baseUrl = $BaseUrl; orgId = $OrgId; accessToken = $r2.access_token; expiresAt = $expiresAt } `
    | ConvertTo-Json | Set-Content -Path $tokenFile -Encoding utf8

Write-Output "logged in as $Username (org $OrgId) -> $tokenFile (expires $expiresAt)"
# skills/open-suzuran/scripts/mcp.ps1
# Call an MCP tool on the Suzuran Cloud platform using the stored token.
# Usage: .\mcp.ps1 -Tool app.list -Args '{"orgId":1}' [-BaseUrl http://localhost:8888]
param(
    [Parameter(Mandatory = $true)][string]$Tool,
    [string]$Args = "{}",
    [string]$BaseUrl = ""
)

$ErrorActionPreference = "Stop"

$tokenFile = Join-Path $HOME ".suzuran\token.json"
if (-not (Test-Path $tokenFile)) {
    Write-Error "No token found. Run login.ps1 first."
    exit 1
}
$session = Get-Content $tokenFile -Raw | ConvertFrom-Json

if (-not $BaseUrl) { $BaseUrl = $session.baseUrl }

if ($session.expiresAt -and [datetime]::Parse($session.expiresAt).ToLocalTime() -lt (Get-Date)) {
    Write-Warning "Token may have expired (saved at $($session.expiresAt)). Re-run login.ps1 if you get 401s."
}

$argsObj = $Args | ConvertFrom-Json
$payload = @{
    jsonrpc = "2.0"; id = 1; method = "tools/call"
    params  = @{ name = $Tool; arguments = $argsObj }
} | ConvertTo-Json -Depth 8 -Compress

$r = Invoke-RestMethod -Uri "$BaseUrl/mcp" -Method Post `
    -Headers @{ Authorization = "Bearer $($session.accessToken)" } `
    -ContentType "application/json" -Body $payload -TimeoutSec 60

if ($r.error) {
    Write-Error "MCP error: $($r.error.message)"
    exit 1
}
if ($r.result.isError) {
    Write-Error "Tool error: $($r.result.content[0].text)"
    exit 1
}
Write-Output $r.result.content[0].text
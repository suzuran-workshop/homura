# skills/open-suzuran/scripts/import-zip.ps1
# Import a local code zip into the platform (new app) or update an existing app's code.
# Usage:
#   .\import-zip.ps1 -ZipPath app.zip -OrgId 1            # import new app
#   .\import-zip.ps1 -ZipPath app.zip -AppId <id>         # update existing app code
param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [string]$AppId = "",
    [int]$OrgId = 1
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ZipPath)) {
    Write-Error "Zip not found: $ZipPath"
    exit 1
}

# Base64 must be kept as a single string; ConvertTo-Json escapes it properly.
$b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($ZipPath))

$scriptDir = Split-Path $MyInvocation.MyCommand.Path
if ($AppId) {
    & (Join-Path $scriptDir "mcp.ps1") -Tool app.update_code -Args (@{ appId = $AppId; zipBase64 = $b64 } | ConvertTo-Json -Depth 3 -Compress)
} else {
    & (Join-Path $scriptDir "mcp.ps1") -Tool app.import -Args (@{ orgId = $OrgId; zipBase64 = $b64 } | ConvertTo-Json -Depth 3 -Compress)
}
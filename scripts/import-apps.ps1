# scripts/import-apps.ps1
# Batch-import business apps from the sibling repo (suzuran-dlc-edu/apps) into the platform.
# Each app directory is zipped and uploaded via POST /api/provider/apps/import.
# The platform stores every package in object storage; this script is only a
# convenience for migrating existing apps — the platform itself never depends
# on host paths.
#
# Usage:
#   .\scripts\import-apps.ps1 [-BaseUrl http://localhost:8888] [-Token <access_token>] [-AppDir <path>] [-Names "leave-management,course-elective"]
param(
    [string]$BaseUrl = "http://localhost:8888",
    [string]$Token = "",
    [string]$AppDir = "",
    [string]$Names = ""
)

$ErrorActionPreference = "Stop"

if (-not $Token) {
    Write-Error "Provide an access token (login first): .\import-apps.ps1 -Token <token>"
    exit 1
}
if (-not $AppDir) {
    $AppDir = Join-Path (Split-Path $PSScriptRoot -Parent) "suzuran-dlc-edu/apps"
}
if (-not (Test-Path $AppDir)) {
    Write-Error "App directory not found: $AppDir"
    exit 1
}

$apps = Get-ChildItem -LiteralPath $AppDir -Directory
if ($Names) {
    $nameSet = $Names -split "," | ForEach-Object { $_.Trim() }
    $apps = $apps | Where-Object { $nameSet -contains $_.Name }
}

$tmpDir = Join-Path $env:TEMP "suzuran-app-import"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$ok = 0; $failed = @()
foreach ($app in $apps) {
    $zip = Join-Path $tmpDir "$($app.Name).zip"
    if (Test-Path $zip) { Remove-Item $zip }
    Compress-Archive -Path (Join-Path $app.FullName "*") -DestinationPath $zip
    $resp = curl.exe -s -X POST "$BaseUrl/api/provider/apps/import" `
        -H "Authorization: Bearer $Token" `
        -F "file=@$zip;type=application/zip"
    if ($resp -match '"id"') {
        $ok++
        Write-Output "imported: $($app.Name)"
    } else {
        $failed += "$($app.Name): $resp"
        Write-Output "failed: $($app.Name): $resp"
    }
}

Write-Output "done: $ok imported, $($failed.Count) failed"
if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Output "  $_" }
}
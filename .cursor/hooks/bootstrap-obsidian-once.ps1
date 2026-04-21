#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Write-HookWarning {
    param(
        [string]$ProjectRoot,
        [string]$Message
    )

    try {
        $stateDir = Join-Path $ProjectRoot ".cursor\state"
        if (-not (Test-Path -LiteralPath $stateDir)) {
            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        }
        $logPath = Join-Path $stateDir "obsidian-hook-warnings.log"
        $ts = (Get-Date).ToString("s")
        Add-Content -LiteralPath $logPath -Value "[$ts] bootstrap-obsidian-once: $Message" -Encoding ASCII
    }
    catch {
        # Logging must remain fail-open.
    }
}

try {
    $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    $stateDir = Join-Path $projectRoot ".cursor\state"
    $stateFile = Join-Path $stateDir "obsidian-bootstrap.done"

    $ingestConfigPath = Join-Path $projectRoot ".obsidian-ingest.json"

    # Run full bootstrap only once; always repair missing ingest (e.g. template without file).
    if (Test-Path -LiteralPath $stateFile) {
        if (-not (Test-Path -LiteralPath $ingestConfigPath)) {
            $syncScript = Join-Path $projectRoot "scripts\obsidian\sync-docs.ps1"
            if (Test-Path -LiteralPath $syncScript) {
                powershell -NoProfile -ExecutionPolicy Bypass -File $syncScript | Out-Null
            }
        }
        exit 0
    }

    Ensure-Directory -Path $stateDir

    $syncScript = Join-Path $projectRoot "scripts\obsidian\sync-docs.ps1"
    if (Test-Path -LiteralPath $syncScript) {
        powershell -NoProfile -ExecutionPolicy Bypass -File $syncScript | Out-Null
    }

    $installHookScript = Join-Path $projectRoot "scripts\obsidian\install-hook.ps1"
    $gitDir = Join-Path $projectRoot ".git"
    if ((Test-Path -LiteralPath $gitDir) -and (Test-Path -LiteralPath $installHookScript)) {
        powershell -NoProfile -ExecutionPolicy Bypass -File $installHookScript -TargetRepo $projectRoot | Out-Null
    }

    $timestamp = (Get-Date).ToString("s")
    Set-Content -LiteralPath $stateFile -Value "bootstrapped_at=$timestamp" -Encoding ASCII
    exit 0
}
catch {
    try {
        $safeRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        Write-HookWarning -ProjectRoot $safeRoot -Message $_.Exception.Message
    }
    catch {
        # no-op
    }
    # Never block session startup because of bootstrap failures.
    exit 0
}

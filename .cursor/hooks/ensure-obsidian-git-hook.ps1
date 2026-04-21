#!/usr/bin/env pwsh
# Cursor afterFileEdit: Git 저장소에 Obsidian용 post-commit이 없거나 예전 형식이면 install-hook.ps1를 한 번 맞춘다.
# stdin은 소비만 하고(파이프 대기 방지), 편집 경로와 무관하게 동작한다.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
        Add-Content -LiteralPath $logPath -Value "[$ts] ensure-obsidian-git-hook: $Message" -Encoding ASCII
    }
    catch {
        # Logging must remain fail-open.
    }
}

try {
    $null = [Console]::In.ReadToEnd()

    $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    $gitDir = Join-Path $projectRoot ".git"
    $installScript = Join-Path $projectRoot "scripts\obsidian\install-hook.ps1"
    $hookFile = Join-Path $gitDir "hooks\post-commit"
    $stateDir = Join-Path $projectRoot ".cursor\state"
    $markerFile = Join-Path $stateDir "obsidian-post-commit.ok"

    if (-not (Test-Path -LiteralPath $gitDir)) {
        exit 0
    }
    if (-not (Test-Path -LiteralPath $installScript)) {
        exit 0
    }

    function Test-HookLooksCurrent {
        param([string]$Path)
        if (-not (Test-Path -LiteralPath $Path)) {
            return $false
        }
        $content = Get-Content -LiteralPath $Path -Raw
        return ($content -match 'sync-docs\.ps1' -and $content -match 'write-commit-journal')
    }

    $hookGood = Test-HookLooksCurrent -Path $hookFile
    if ($hookGood -and (Test-Path -LiteralPath $markerFile)) {
        exit 0
    }

    if (-not $hookGood) {
        powershell -NoProfile -ExecutionPolicy Bypass -File $installScript -TargetRepo $projectRoot 2>$null | Out-Null
        $hookGood = Test-HookLooksCurrent -Path $hookFile
    }

    if ($hookGood) {
        if (-not (Test-Path -LiteralPath $stateDir)) {
            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        }
        $stamp = (Get-Date).ToString("s")
        Set-Content -LiteralPath $markerFile -Value "verified_at=$stamp" -Encoding ASCII
    }
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
    exit 0
}

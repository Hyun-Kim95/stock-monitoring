param(

    [Parameter(Mandatory = $true)]

    [string]$TargetRepo,

    [string]$ScriptPath = ""

)



Set-StrictMode -Version Latest

$ErrorActionPreference = "Stop"



$journalInRepo = Join-Path $TargetRepo "scripts\obsidian\write-commit-journal.ps1"

$syncInRepo = Join-Path $TargetRepo "scripts\obsidian\sync-docs.ps1"



if (-not [string]::IsNullOrWhiteSpace($ScriptPath)) {

    if (-not (Test-Path -LiteralPath $ScriptPath)) {

        throw "Journal script not found: $ScriptPath"

    }

} elseif (-not (Test-Path -LiteralPath $journalInRepo)) {

    throw "Journal script not found in target repo (expected): $journalInRepo"

}



if (-not (Test-Path -LiteralPath $syncInRepo)) {

    throw "Sync script not found in target repo (expected): $syncInRepo"

}



$hookDir = Join-Path $TargetRepo ".git\hooks"

if (-not (Test-Path -LiteralPath $hookDir)) {

    throw "Git hooks directory not found: $hookDir"

}



$hookFile = Join-Path $hookDir "post-commit"



$hookContent = @(

    "#!/bin/sh"

    "set -eu"

    'REPO_ROOT="$(git rev-parse --show-toplevel)"'

)



if (-not [string]::IsNullOrWhiteSpace($ScriptPath)) {

    $normalizedScriptPath = $ScriptPath.Replace("\", "/")

    # Journal is best-effort; sync-docs must still run if journal fails (set -e in sh).

    $hookContent += ('powershell -NoProfile -ExecutionPolicy Bypass -File "{0}" -RepoRoot "$REPO_ROOT" || true' -f $normalizedScriptPath)

    $hookContent += 'powershell -NoProfile -ExecutionPolicy Bypass -File "$REPO_ROOT/scripts/obsidian/sync-docs.ps1"'

} else {

    $hookContent += 'powershell -NoProfile -ExecutionPolicy Bypass -File "$REPO_ROOT/scripts/obsidian/write-commit-journal.ps1" -RepoRoot "$REPO_ROOT" || true'

    $hookContent += 'powershell -NoProfile -ExecutionPolicy Bypass -File "$REPO_ROOT/scripts/obsidian/sync-docs.ps1"'

}



Set-Content -LiteralPath $hookFile -Value ($hookContent -join "`n") -Encoding ASCII

Write-Host "Hook installed: $hookFile"

Write-Host "On each commit: commit journal (best-effort) -> vault .../journal, then sync-docs -> vault .../docs (see .obsidian-ingest.json for slug/vaultRoot)."



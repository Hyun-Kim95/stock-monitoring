param(
    [string]$RepoRoot,
    [string]$VaultRoot = "D:\Obsidian\projects"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-HubIndexStem.ps1")

# Git log metadata is UTF-8. Windows PowerShell 5.1 decodes native command stdout using
# [Console]::OutputEncoding (often system ANSI/OEM, e.g. CP949), which mojibakes non-ASCII subjects.
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$script:utf8NoBom = $utf8NoBom
try {
    [Console]::OutputEncoding = $utf8NoBom
}
catch {
    # Restricted host / non-interactive—ignore
}
$OutputEncoding = $utf8NoBom

function Escape-YamlDoubleQuotedValue {
    param([string]$Text)
    if ($null -eq $Text) {
        return ''
    }
    $clean = ($Text -replace "`r`n", ' ' -replace "`r", ' ' -replace "`n", ' ')
    return (($clean -replace '\\', '\\\\') -replace '"', '\"')
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Read-GitStdoutFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return ''
    }
    return [System.IO.File]::ReadAllText($Path, $script:utf8NoBom).Trim()
}

# Capture git stdout as UTF-8 bytes (Git always uses UTF-8 for metadata). Using & git in WinPS 5.1 can decode
# with the console code page and corrupt non-ASCII commit subjects.
function Run-Git {
    param(
        [string]$RepoPath,
        [string[]]$GitArguments
    )

    $tmpOut = Join-Path ([System.IO.Path]::GetTempPath()) ('git-journal-' + [System.Guid]::NewGuid().ToString('n') + '.stdout')
    $tmpErr = Join-Path ([System.IO.Path]::GetTempPath()) ('git-journal-' + [System.Guid]::NewGuid().ToString('n') + '.stderr')
    try {
        $allArgs = @('-C', $RepoPath) + $GitArguments
        $proc = Start-Process -FilePath 'git' -ArgumentList $allArgs -Wait -NoNewWindow -PassThru `
            -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr
        if ($proc.ExitCode -ne 0) {
            $stderr = Read-GitStdoutFile -Path $tmpErr
            throw "git command failed (exit $($proc.ExitCode)): git -C $RepoPath $($GitArguments -join ' ') — $stderr"
        }

        return (Read-GitStdoutFile -Path $tmpOut)
    }
    finally {
        Remove-Item -LiteralPath $tmpOut -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $tmpErr -Force -ErrorAction SilentlyContinue
    }
}

function Try-Git {
    param(
        [string]$RepoPath,
        [string[]]$GitArguments
    )

    $tmpOut = Join-Path ([System.IO.Path]::GetTempPath()) ('git-journal-' + [System.Guid]::NewGuid().ToString('n') + '.stdout')
    $tmpErr = Join-Path ([System.IO.Path]::GetTempPath()) ('git-journal-' + [System.Guid]::NewGuid().ToString('n') + '.stderr')
    try {
        $allArgs = @('-C', $RepoPath) + $GitArguments
        $proc = Start-Process -FilePath 'git' -ArgumentList $allArgs -Wait -NoNewWindow -PassThru `
            -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr
        if ($proc.ExitCode -ne 0) {
            return $null
        }

        return (Read-GitStdoutFile -Path $tmpOut)
    }
    finally {
        Remove-Item -LiteralPath $tmpOut -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $tmpErr -Force -ErrorAction SilentlyContinue
    }
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Get-Location | Select-Object -ExpandProperty Path
}

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "RepoRoot not found: $RepoRoot"
}

$repoName = Split-Path -Path $RepoRoot -Leaf
$ingestConfigPath = Join-Path $RepoRoot ".obsidian-ingest.json"
$slug = $repoName
$displayName = ""
$hubFileStem = ""

if (Test-Path -LiteralPath $ingestConfigPath) {
    $repoConfig = Get-Content -LiteralPath $ingestConfigPath -Encoding utf8 -Raw | ConvertFrom-Json
    if ($repoConfig.slug) {
        $slug = [string]$repoConfig.slug
    }
    if ($repoConfig.vaultRoot) {
        $VaultRoot = [string]$repoConfig.vaultRoot
    }
    $dnProp = $repoConfig.PSObject.Properties['displayName']
    if ($null -ne $dnProp -and -not [string]::IsNullOrWhiteSpace([string]$dnProp.Value)) {
        $displayName = [string]$dnProp.Value
    }
    $hfProp = $repoConfig.PSObject.Properties['hubFileStem']
    if ($null -ne $hfProp -and -not [string]::IsNullOrWhiteSpace([string]$hfProp.Value)) {
        $hubFileStem = [string]$hfProp.Value
    }
}

$hubStem = Get-HubIndexStem -Slug $slug -DisplayName $displayName -HubFileStem $hubFileStem

$sourceRepo = $repoName
$remoteOrigin = Try-Git -RepoPath $RepoRoot -GitArguments @('config', '--get', 'remote.origin.url')
if (-not [string]::IsNullOrWhiteSpace($remoteOrigin)) {
    $sourceRepo = $remoteOrigin
}

$shaFull = Run-Git -RepoPath $RepoRoot -GitArguments @("rev-parse", "HEAD")
$shaShort = Run-Git -RepoPath $RepoRoot -GitArguments @("rev-parse", "--short", "HEAD")
$subject = Run-Git -RepoPath $RepoRoot -GitArguments @("log", "-1", "--pretty=%s")
$author = Run-Git -RepoPath $RepoRoot -GitArguments @("log", "-1", "--pretty=%an")
$committedAt = Run-Git -RepoPath $RepoRoot -GitArguments @("log", "-1", "--date=iso", "--pretty=%cd")
$changedFilesRaw = Run-Git -RepoPath $RepoRoot -GitArguments @("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")
$changedFiles = @()
if (-not [string]::IsNullOrWhiteSpace($changedFilesRaw)) {
    $changedFiles = @(
        $changedFilesRaw -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
}

$journalRoot = Join-Path (Join-Path $VaultRoot $slug) "journal"
Ensure-Directory -Path $journalRoot

$timestamp = Get-Date -Format "yyyy-MM-ddTHHmmss"
$updatedAt = (Get-Date).ToString("s")
$notePath = Join-Path $journalRoot "$timestamp-$shaShort.md"
$safeRepoRoot = $RepoRoot.Replace("\", "\\")
$safeSourceRepo = $sourceRepo.Replace("\", "\\")

# Avoid `[[` / `#` inside double-quoted array literals (hook-invoked Windows PowerShell parses them as operators/types).
$frontmatter = New-Object System.Collections.Generic.List[string]
$null = $frontmatter.Add('---')
$null = $frontmatter.Add('type: commit-journal')
$null = $frontmatter.Add("project: $slug")
if (-not [string]::IsNullOrWhiteSpace($displayName)) {
    $dq = Escape-YamlDoubleQuotedValue -Text $displayName
    $null = $frontmatter.Add('display_name: "' + $dq + '"')
}
$null = $frontmatter.Add("source_repo: $safeSourceRepo")
$null = $frontmatter.Add("repo_name: $repoName")
$null = $frontmatter.Add("repo_root: $safeRepoRoot")
$null = $frontmatter.Add("updated_at: $updatedAt")
$null = $frontmatter.Add("commit: $shaFull")
$null = $frontmatter.Add("commit_short: $shaShort")
$null = $frontmatter.Add("author: $author")
$null = $frontmatter.Add("committed_at: $committedAt")
$null = $frontmatter.Add('tags: [tech, commit, journal]')
$null = $frontmatter.Add('links:')
$null = $frontmatter.Add('    - ''[[' + $slug + '/docs/' + $hubStem + ']]''')
$null = $frontmatter.Add('    - ''[[' + $slug + '/docs/obsidian/dashboards/commit-journal-overview]]''')
$null = $frontmatter.Add('---')
$null = $frontmatter.Add('')

$body = New-Object System.Collections.Generic.List[string]
$null = $body.Add('# ' + $subject)
$null = $body.Add('')
$null = $body.Add('## Metadata')
$null = $body.Add('- Repo: ' + $repoName)
$null = $body.Add('- Slug: ' + $slug)
if (-not [string]::IsNullOrWhiteSpace($displayName)) {
    $null = $body.Add('- Project name: ' + $displayName)
}
$null = $body.Add('- Commit: ' + $shaShort)
$null = $body.Add('- Author: ' + $author)
$null = $body.Add('- CommittedAt: ' + $committedAt)
$null = $body.Add('- UpdatedAt: ' + $updatedAt)
$null = $body.Add('')
$null = $body.Add('## Changed Files')

if ($changedFiles.Count -eq 0) {
    $null = $body.Add('- (none)')
} else {
    foreach ($file in $changedFiles) {
        $null = $body.Add('- ' + $file)
    }
}

$null = $body.Add('')
$null = $body.Add('## Related Links')
$null = $body.Add('- [[' + $slug + '/docs/' + $hubStem + ']]')
$null = $body.Add('- [[' + $slug + '/docs/obsidian/dashboards/commit-journal-overview|Commit journal (Dataview)]]')

$content = ($frontmatter + $body) -join "`r`n"
# UTF-8 with BOM: Obsidian / some Windows tools detect encoding reliably (WinPS 5.1 Set-Content UTF8 = BOM).
$utf8Bom = [System.Text.UTF8Encoding]::new($true)
[System.IO.File]::WriteAllText($notePath, $content, $utf8Bom)

Write-Host "Commit journal written: $notePath"

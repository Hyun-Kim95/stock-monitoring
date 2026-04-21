#!/usr/bin/env pwsh
<#
.SYNOPSIS
  docs/ 하위( obsidian 제외 )의 .md를 점검하고 frontmatter/Vault 링크 정합성을 맞춘다.
  기본 모드: 기존 주입 동작 + 불일치 리포트
  CheckOnly: 점검만 수행
  FixMismatch: 기존 문서의 project/Vault 링크 불일치도 보정
#>
param(
    [string]$RepoRoot = "",
    [switch]$CheckOnly,
    [switch]$FixMismatch,
    [string[]]$LaneFilter = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-HubIndexStem.ps1")

if ($CheckOnly -and $FixMismatch) {
    throw "CheckOnly and FixMismatch cannot be used together."
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$slug = Split-Path -Path $RepoRoot -Leaf
$displayName = ""
$hubFileStem = ""
$ingestPath = Join-Path $RepoRoot ".obsidian-ingest.json"
if (Test-Path -LiteralPath $ingestPath) {
    try {
        $ingest = Get-Content -LiteralPath $ingestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($ingest.slug) {
            $slug = [string]$ingest.slug
        }
        $dnProp = $ingest.PSObject.Properties['displayName']
        if ($null -ne $dnProp -and -not [string]::IsNullOrWhiteSpace([string]$dnProp.Value)) {
            $displayName = [string]$dnProp.Value
        }
        $hfProp = $ingest.PSObject.Properties['hubFileStem']
        if ($null -ne $hfProp -and -not [string]::IsNullOrWhiteSpace([string]$hfProp.Value)) {
            $hubFileStem = [string]$hfProp.Value
        }
    } catch {
        # keep folder slug
    }
}

$hubStem = Get-HubIndexStem -Slug $slug -DisplayName $displayName -HubFileStem $hubFileStem

function Escape-YamlDoubleQuotedValue {
    param([string]$Text)
    if ($null -eq $Text) {
        return ''
    }
    $clean = ($Text -replace "`r`n", ' ' -replace "`r", ' ' -replace "`n", ' ')
    return (($clean -replace '\\', '\\\\') -replace '"', '\"')
}

function Get-ExpectedVaultBlock {
    param(
        [string]$ProjectSlug,
        [string]$ProjectHubStem
    )

    return @"

## Vault

- [[$ProjectSlug/docs/$ProjectHubStem|Hub]]
- [[$ProjectSlug/docs/obsidian/dashboards/projects-overview|Dashboards]]
- [[$ProjectSlug/docs/obsidian/dashboards/commit-journal-overview|Commit journals (Dataview)]]
"@
}

function Test-HasYamlFrontmatter {
    param([string]$Text)
    return ($Text.TrimStart().StartsWith("---"))
}

function Get-VaultSectionRange {
    param([string]$Text)
    $startMatch = [regex]::Match($Text, '(?m)^##\s+Vault\s*$')
    if (-not $startMatch.Success) {
        return $null
    }

    $start = $startMatch.Index
    $searchStart = $start + $startMatch.Length
    $nextHeading = [regex]::Match($Text.Substring($searchStart), '(?m)^##\s+')
    if ($nextHeading.Success) {
        $end = $searchStart + $nextHeading.Index
    } else {
        $end = $Text.Length
    }

    return [pscustomobject]@{
        Start = $start
        End   = $end
    }
}

function Get-FrontmatterRange {
    param([string]$Text)
    $leading = [regex]::Match($Text, '\A(?:\uFEFF)?[ \t\r\n]*')
    $offset = $leading.Length
    $openMatch = [regex]::Match($Text.Substring($offset), '\A---\s*(?:\r?\n)')
    if (-not $openMatch.Success) {
        return $null
    }

    $afterOpen = $offset + $openMatch.Length
    $endMatch = [regex]::Match($Text.Substring($afterOpen), '(?m)^---\s*$')
    if (-not $endMatch.Success) {
        return $null
    }
    $end = $afterOpen + $endMatch.Index + $endMatch.Length

    return [pscustomobject]@{
        Start = $offset
        End   = $end
    }
}

function Upsert-ProjectInFrontmatter {
    param(
        [string]$Text,
        [string]$ProjectSlug
    )

    $fm = Get-FrontmatterRange -Text $Text
    if ($null -eq $fm) {
        return $Text
    }

    $frontmatter = $Text.Substring($fm.Start, $fm.End - $fm.Start)
    if ($frontmatter -match '(?m)^project:\s*.*$') {
        $frontmatter = [regex]::Replace($frontmatter, '(?m)^project:\s*.*$', "project: $ProjectSlug", 1)
    } else {
        $frontmatter = $frontmatter -replace "(?m)^type:\s*.*$", "`$0`nproject: $ProjectSlug"
        if ($frontmatter -notmatch '(?m)^project:\s*') {
            $frontmatter = [regex]::Replace(
                $frontmatter,
                "(?m)^---\s*$",
                "---`nproject: $ProjectSlug",
                1
            )
        }
    }

    return $Text.Substring(0, $fm.Start) + $frontmatter + $Text.Substring($fm.End)
}

function Ensure-VaultBlock {
    param(
        [string]$Text,
        [string]$ExpectedVault
    )

    $range = Get-VaultSectionRange -Text $Text
    if ($null -eq $range) {
        return ($Text.TrimEnd() + $ExpectedVault + "`n")
    }

    $before = $Text.Substring(0, $range.Start).TrimEnd()
    $after = $Text.Substring($range.End).TrimStart()
    $rebuilt = $before + $ExpectedVault
    if (-not [string]::IsNullOrWhiteSpace($after)) {
        $rebuilt += "`n`n" + $after
    }
    if (-not $rebuilt.EndsWith("`n")) {
        $rebuilt += "`n"
    }
    return $rebuilt
}

$defaultLanes = @("requirements", "qa", "design", "decisions", "changelog")
$lanes = $defaultLanes
if ($LaneFilter.Count -gt 0) {
    $laneSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($lane in $LaneFilter) {
        if (-not [string]::IsNullOrWhiteSpace($lane)) {
            $null = $laneSet.Add($lane.Trim())
        }
    }
    $lanes = @($defaultLanes | Where-Object { $laneSet.Contains($_) })
    if ($lanes.Count -eq 0) {
        throw "LaneFilter did not match known lanes: $($defaultLanes -join ', ')"
    }
}

$expectedVault = Get-ExpectedVaultBlock -ProjectSlug $slug -ProjectHubStem $hubStem

$summary = [ordered]@{
    Total      = 0
    OK         = 0
    Mismatch   = 0
    Fixed      = 0
    Skip       = 0
}

foreach ($lane in $lanes) {
    $laneRoot = Join-Path $RepoRoot (Join-Path "docs" $lane)
    if (-not (Test-Path -LiteralPath $laneRoot)) {
        Write-Host "SKIP  lane-missing  $laneRoot"
        $summary.Skip++
        continue
    }

    Get-ChildItem -LiteralPath $laneRoot -Filter "*.md" -Recurse -File | ForEach-Object {
        $summary.Total++
        $full = $_.FullName
        $raw = Get-Content -LiteralPath $full -Raw -Encoding UTF8
        if ($null -eq $raw) {
            $raw = ""
        }

        $needsHeader = -not (Test-HasYamlFrontmatter -Text $raw)
        $needsProjectFix = $false
        $needsVaultFix = $false
        $updatedAt = $_.LastWriteTime.ToString("s")

        if (-not $needsHeader) {
            $fm = Get-FrontmatterRange -Text $raw
            if ($null -ne $fm) {
                $frontmatter = $raw.Substring($fm.Start, $fm.End - $fm.Start)
                $projectMatch = [regex]::Match($frontmatter, '(?m)^project:\s*(.+?)\s*$')
                if (-not $projectMatch.Success -or $projectMatch.Groups[1].Value.Trim() -ne $slug) {
                    $needsProjectFix = $true
                }
            } else {
                $needsProjectFix = $true
            }

            $vaultRange = Get-VaultSectionRange -Text $raw
            if ($null -eq $vaultRange) {
                $needsVaultFix = $true
            } else {
                $vaultContent = $raw.Substring($vaultRange.Start, $vaultRange.End - $vaultRange.Start).Trim()
                $slugEscaped = [regex]::Escape($slug)
                if (-not [regex]::IsMatch($vaultContent, "\[\[$slugEscaped/docs/")) {
                    $needsVaultFix = $true
                }
            }
        } else {
            $needsProjectFix = $true
            $needsVaultFix = $true
        }

        $isMismatch = $needsHeader -or $needsProjectFix -or $needsVaultFix
        if (-not $isMismatch) {
            Write-Host "OK    $full"
            $summary.OK++
            return
        }

        $reasonParts = New-Object System.Collections.Generic.List[string]
        if ($needsHeader) { $null = $reasonParts.Add("frontmatter-missing") }
        if ($needsProjectFix -and -not $needsHeader) { $null = $reasonParts.Add("project-mismatch") }
        if ($needsVaultFix -and -not $needsHeader) { $null = $reasonParts.Add("vault-mismatch") }
        if ($needsHeader) { $null = $reasonParts.Add("vault-append") }
        $reason = ($reasonParts -join ",")

        if ($CheckOnly -or (-not $FixMismatch -and -not $needsHeader)) {
            Write-Host "MISMATCH  $reason  $full"
            $summary.Mismatch++
            return
        }

        $out = $raw
        if ($needsHeader) {
            $headerLines = New-Object System.Collections.Generic.List[string]
            $null = $headerLines.Add('---')
            $null = $headerLines.Add('type: doc')
            $null = $headerLines.Add("project: $slug")
            if (-not [string]::IsNullOrWhiteSpace($displayName)) {
                $dq = Escape-YamlDoubleQuotedValue -Text $displayName
                $null = $headerLines.Add('display_name: "' + $dq + '"')
            }
            $null = $headerLines.Add("doc_lane: $lane")
            $null = $headerLines.Add("updated_at: $updatedAt")
            $null = $headerLines.Add('tags: [docs, vault-sync]')
            $null = $headerLines.Add('---')
            $null = $headerLines.Add('')
            $header = ($headerLines -join "`n") + "`n"

            $body = $raw.TrimEnd()
            $out = $header + $body
        } elseif ($FixMismatch -and $needsProjectFix) {
            $out = Upsert-ProjectInFrontmatter -Text $out -ProjectSlug $slug
        }

        if ($needsVaultFix -or $needsHeader -or $FixMismatch) {
            $out = Ensure-VaultBlock -Text $out -ExpectedVault $expectedVault
        } elseif (-not $out.EndsWith("`n")) {
            $out += "`n"
        }

        Set-Content -LiteralPath $full -Value $out -Encoding utf8
        Write-Host "FIXED  $reason  $full"
        $summary.Fixed++
    }
}

Write-Host ("Done. Slug/project: {0}" -f $slug)
Write-Host ("Summary: total={0}, ok={1}, mismatch={2}, fixed={3}, skip={4}" -f $summary.Total, $summary.OK, $summary.Mismatch, $summary.Fixed, $summary.Skip)

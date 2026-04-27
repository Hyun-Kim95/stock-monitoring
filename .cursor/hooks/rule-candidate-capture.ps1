#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-AllStringValues {
    param([object]$Node)

    $values = New-Object System.Collections.Generic.List[string]
    if ($null -eq $Node) { return $values }
    if ($Node -is [string]) {
        $values.Add($Node)
        return $values
    }
    if ($Node -is [System.Collections.IDictionary]) {
        foreach ($key in $Node.Keys) {
            foreach ($item in (Get-AllStringValues -Node $Node[$key])) { $values.Add($item) }
        }
        return $values
    }
    if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [string])) {
        foreach ($entry in $Node) {
            foreach ($item in (Get-AllStringValues -Node $entry)) { $values.Add($item) }
        }
        return $values
    }
    foreach ($prop in $Node.PSObject.Properties) {
        foreach ($item in (Get-AllStringValues -Node $prop.Value)) { $values.Add($item) }
    }
    return $values
}

function Ensure-ParentDirectory {
    param([string]$Path)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

    $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    $candidatePath = Join-Path $projectRoot "docs\agent\rule-candidates.ndjson"
    Ensure-ParentDirectory -Path $candidatePath

    $payload = $raw | ConvertFrom-Json -Depth 20
    $allStrings = Get-AllStringValues -Node $payload
    if (-not $allStrings -or $allStrings.Count -eq 0) { exit 0 }

    $text = ($allStrings -join "`n")
    $matches = [regex]::Matches($text, "(?im)(?:규칙\s*후보|새\s*규칙|운영\s*규칙)\s*[:：]\s*(.+)")
    if ($matches.Count -eq 0) { exit 0 }

    $existingRuleLines = @{}
    if (Test-Path -LiteralPath $candidatePath) {
        foreach ($line in (Get-Content -LiteralPath $candidatePath -Encoding UTF8)) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try {
                $item = $line | ConvertFrom-Json -Depth 10
                if ($null -ne $item.rule_text) {
                    $existingRuleLines[[string]$item.rule_text] = $true
                }
            } catch {}
        }
    }

    $newCandidates = New-Object System.Collections.Generic.List[object]
    foreach ($m in $matches) {
        $ruleText = $m.Groups[1].Value.Trim()
        if ([string]::IsNullOrWhiteSpace($ruleText)) { continue }
        if ($existingRuleLines.ContainsKey($ruleText)) { continue }

        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $id = "rc_$timestamp"
        $target = "rule"
        $targetPath = ".cursor/rules/90-runtime-rule-$timestamp.mdc"
        if ($ruleText -match "^\[AGENTS\]\s*(.+)$") {
            $target = "agents"
            $targetPath = "AGENTS.md"
            $ruleText = $Matches[1].Trim()
        }
        elseif ($ruleText -match "^\[RULES\]\s*(.+)$") {
            $target = "rule"
            $targetPath = ".cursor/rules/90-runtime-rule-$timestamp.mdc"
            $ruleText = $Matches[1].Trim()
        }

        $candidate = [ordered]@{
            id = $id
            title = "작업 중 수집된 운영 규칙"
            scope = "general"
            target = $target
            target_path = $targetPath
            rule_text = $ruleText
            source = "hook:afterAgentResponse"
            status = "pending"
            created_at = (Get-Date).ToString("o")
        }
        Add-Content -LiteralPath $candidatePath -Value ($candidate | ConvertTo-Json -Compress) -Encoding UTF8
        $existingRuleLines[$ruleText] = $true
        $newCandidates.Add($candidate)
    }

    if ($newCandidates.Count -gt 0) {
        $first = $newCandidates[0]
        $preview = [string]$first.rule_text
        if ($preview.Length -gt 70) {
            $preview = $preview.Substring(0, 70) + "..."
        }

        $ids = ($newCandidates | ForEach-Object { [string]$_.id }) -join ", "
        $msg = "새 규칙 후보가 등록되었습니다. 후보: $ids / 예시: '$preview' / 처리: '규칙 승인 최신' 또는 '규칙 반려 최신 사유: ...'"
        $output = @{
            additional_context = $msg
        }
        Write-Output ($output | ConvertTo-Json -Compress)
    }

    exit 0
}
catch {
    exit 0
}

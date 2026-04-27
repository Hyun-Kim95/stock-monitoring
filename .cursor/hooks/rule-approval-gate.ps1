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

function Read-CandidateItems {
    param([string]$Path)
    $items = New-Object System.Collections.Generic.List[object]
    if (-not (Test-Path -LiteralPath $Path)) { return $items }
    foreach ($line in (Get-Content -LiteralPath $Path -Encoding UTF8)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try { $items.Add(($line | ConvertFrom-Json -Depth 20)) } catch {}
    }
    return $items
}

function Write-CandidateItems {
    param(
        [string]$Path,
        [System.Collections.Generic.List[object]]$Items
    )
    Ensure-ParentDirectory -Path $Path
    Set-Content -LiteralPath $Path -Value "" -Encoding UTF8
    foreach ($item in $Items) {
        Add-Content -LiteralPath $Path -Value ($item | ConvertTo-Json -Compress) -Encoding UTF8
    }
}

function Get-PendingCandidatesNewestFirst {
    param([System.Collections.Generic.List[object]]$Items)
    $pending = @()
    foreach ($item in $Items) {
        if ([string]$item.status -eq "pending") { $pending += $item }
    }
    return @($pending | Sort-Object -Property created_at -Descending)
}

function Build-PendingListMessage {
    param(
        [System.Collections.Generic.List[object]]$Items,
        [int]$Limit
    )

    $pending = Get-PendingCandidatesNewestFirst -Items $Items
    if ($pending.Count -eq 0) {
        return "현재 pending 규칙 후보가 없습니다."
    }

    if ($Limit -lt 1) { $Limit = 10 }
    $count = [Math]::Min($Limit, $pending.Count)
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("pending 규칙 후보 $count/$($pending.Count)건:")
    for ($i = 0; $i -lt $count; $i++) {
        $item = $pending[$i]
        $text = [string]$item.rule_text
        if ($text.Length -gt 60) { $text = $text.Substring(0, 60) + "..." }
        $lines.Add("#$($i + 1) | $([string]$item.id) | $text")
    }
    $lines.Add("승인: 규칙 승인 #번호(또는 숫자) | 반려: 규칙 반려 #번호(또는 숫자) 사유: ...")
    return ($lines -join "`n")
}

function Resolve-CandidateBySelector {
    param(
        [System.Collections.Generic.List[object]]$Items,
        [string]$Selector
    )

    $selectorText = [string]$Selector
    if ([string]::IsNullOrWhiteSpace($selectorText)) { return $null }
    $selectorText = $selectorText.Trim()
    $pending = Get-PendingCandidatesNewestFirst -Items $Items
    if ($pending.Count -eq 0) { return $null }

    # 1) Explicit id match.
    foreach ($item in $pending) {
        if ([string]$item.id -eq $selectorText) { return $item }
    }

    # 2) Latest alias.
    if ($selectorText -match "^(최신|마지막|last|latest)$") {
        return $pending[0]
    }

    # 3) Ordinal alias (#1 = newest pending).
    if ($selectorText -match "^#?(\d+)$") {
        $index = [int]$Matches[1]
        if ($index -ge 1 -and $index -le $pending.Count) {
            return $pending[$index - 1]
        }
    }

    # 4) Keyword contains (first newest match).
    foreach ($item in $pending) {
        $ruleText = [string]$item.rule_text
        if (-not [string]::IsNullOrWhiteSpace($ruleText) -and $ruleText -like "*$selectorText*") {
            return $item
        }
    }

    return $null
}

function Ensure-RuleFile {
    param(
        [string]$ProjectRoot,
        [object]$Candidate
    )
    $relativePath = [string]$Candidate.target_path
    if ([string]::IsNullOrWhiteSpace($relativePath)) { return }
    $fullPath = Join-Path $ProjectRoot $relativePath
    Ensure-ParentDirectory -Path $fullPath
    if (Test-Path -LiteralPath $fullPath) { return }

    $ruleText = [string]$Candidate.rule_text
    if ([string]::IsNullOrWhiteSpace($ruleText)) { $ruleText = "승인된 운영 규칙 내용이 비어 있어 추후 보완이 필요합니다." }
    $description = "작업 중 승인된 운영 규칙을 반영한다."
    $titleName = (Split-Path -Leaf $relativePath).Replace(".mdc", "")
    $content = @(
        "---",
        "description: $description",
        "alwaysApply: true",
        "---",
        "",
        "# $titleName",
        "",
        "## 목적",
        "작업 중 승인된 규칙을 새 세션에서도 일관되게 적용한다.",
        "",
        "## 규칙",
        "- $ruleText",
        "",
        "## 관계",
        "- SSOT 우선순위는 `AGENTS.md`와 User-level 계획/분담 규칙을 따른다."
    )
    Set-Content -LiteralPath $fullPath -Value $content -Encoding UTF8
}

function Append-AgentsRule {
    param(
        [string]$ProjectRoot,
        [object]$Candidate
    )
    $agentsPath = Join-Path $ProjectRoot "AGENTS.md"
    if (-not (Test-Path -LiteralPath $agentsPath)) { return }

    $ruleText = [string]$Candidate.rule_text
    if ([string]::IsNullOrWhiteSpace($ruleText)) { return }
    $sectionTitle = "## 작업 중 합의된 운영 규칙"
    $bullet = "- $ruleText"

    $raw = Get-Content -LiteralPath $agentsPath -Raw -Encoding UTF8
    if ($raw -match [regex]::Escape($bullet)) { return }
    if ($raw -match [regex]::Escape($sectionTitle)) {
        $updated = $raw.TrimEnd() + "`r`n$bullet`r`n"
        Set-Content -LiteralPath $agentsPath -Value $updated -Encoding UTF8
        return
    }

    $updated = $raw.TrimEnd() + "`r`n`r`n$sectionTitle`r`n$bullet`r`n"
    Set-Content -LiteralPath $agentsPath -Value $updated -Encoding UTF8
}

function Append-ApprovalLog {
    param(
        [string]$Path,
        [string]$Line
    )
    Ensure-ParentDirectory -Path $Path
    if (-not (Test-Path -LiteralPath $Path)) {
        Set-Content -LiteralPath $Path -Value @(
            "# Rule approvals",
            "",
            "| 시각 | ID | 결과 | 메모 |",
            "|------|----|------|------|"
        ) -Encoding UTF8
    }
    Add-Content -LiteralPath $Path -Value $Line -Encoding UTF8
}

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

    $payload = $raw | ConvertFrom-Json -Depth 20
    $allStrings = (Get-AllStringValues -Node $payload)
    if (-not $allStrings -or $allStrings.Count -eq 0) { exit 0 }
    $text = ($allStrings -join "`n")

    $listMatch = [regex]::Match($text, "(?im)규칙\s*후보\s*목록(?:\s+(\d+))?")
    $approveMatch = [regex]::Match($text, "(?im)규칙\s*승인\s+([^\r\n]+)")
    $rejectMatch = [regex]::Match($text, "(?im)규칙\s*반려\s+([^\r\n]+?)(?:\s+사유\s*:\s*(.+))?$")
    if (-not $listMatch.Success -and -not $approveMatch.Success -and -not $rejectMatch.Success) { exit 0 }

    $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    $candidatePath = Join-Path $projectRoot "docs\agent\rule-candidates.ndjson"
    $approvalPath = Join-Path $projectRoot "docs\agent\rule-approvals.md"
    $items = Read-CandidateItems -Path $candidatePath
    if ($listMatch.Success) {
        $limit = 10
        $limitRaw = $listMatch.Groups[1].Value.Trim()
        if (-not [string]::IsNullOrWhiteSpace($limitRaw)) {
            try { $limit = [int]$limitRaw } catch { $limit = 10 }
        }
        $message = Build-PendingListMessage -Items $items -Limit $limit
        $output = @{
            permission = "deny"
            user_message = $message
            agent_message = "규칙 후보 목록 요청을 처리했습니다."
        }
        Write-Output ($output | ConvertTo-Json -Compress)
        exit 2
    }

    if ($items.Count -eq 0) { exit 0 }

    if ($approveMatch.Success) {
        $selector = $approveMatch.Groups[1].Value.Trim()
        $resolved = Resolve-CandidateBySelector -Items $items -Selector $selector
        if ($null -ne $resolved) {
            $resolved.status = "approved"
            $resolved.approved_at = (Get-Date).ToString("o")
            if ([string]$resolved.target -eq "agents") {
                Append-AgentsRule -ProjectRoot $projectRoot -Candidate $resolved
            } else {
                Ensure-RuleFile -ProjectRoot $projectRoot -Candidate $resolved
            }
            $line = "| $(Get-Date -Format s) | $($resolved.id) | 승인 | 자동 반영 완료 (selector: $selector) |"
            Append-ApprovalLog -Path $approvalPath -Line $line
        }
        Write-CandidateItems -Path $candidatePath -Items $items
        exit 0
    }

    if ($rejectMatch.Success) {
        $selector = $rejectMatch.Groups[1].Value.Trim()
        $reason = $rejectMatch.Groups[2].Value.Trim()
        if ([string]::IsNullOrWhiteSpace($reason)) { $reason = "사유 미기재" }
        $resolved = Resolve-CandidateBySelector -Items $items -Selector $selector
        if ($null -ne $resolved) {
            $resolved.status = "rejected"
            $resolved.rejected_at = (Get-Date).ToString("o")
            $resolved.rejected_reason = $reason
            $line = "| $(Get-Date -Format s) | $($resolved.id) | 반려 | $reason (selector: $selector) |"
            Append-ApprovalLog -Path $approvalPath -Line $line
        }
        Write-CandidateItems -Path $candidatePath -Items $items
        exit 0
    }

    exit 0
}
catch {
    exit 0
}

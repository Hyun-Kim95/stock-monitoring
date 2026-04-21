#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-AllStringValues {
    param([object]$Node)

    $values = New-Object System.Collections.Generic.List[string]
    if ($null -eq $Node) {
        return $values
    }

    if ($Node -is [string]) {
        $values.Add($Node)
        return $values
    }

    if ($Node -is [System.Collections.IDictionary]) {
        foreach ($key in $Node.Keys) {
            foreach ($item in (Get-AllStringValues -Node $Node[$key])) {
                $values.Add($item)
            }
        }
        return $values
    }

    if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [string])) {
        foreach ($entry in $Node) {
            foreach ($item in (Get-AllStringValues -Node $entry)) {
                $values.Add($item)
            }
        }
        return $values
    }

    foreach ($prop in $Node.PSObject.Properties) {
        foreach ($item in (Get-AllStringValues -Node $prop.Value)) {
            $values.Add($item)
        }
    }

    return $values
}

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        exit 0
    }

    $payload = $raw | ConvertFrom-Json -Depth 20
    $allStrings = (Get-AllStringValues -Node $payload) | ForEach-Object { $_.ToLowerInvariant() }

    if (-not $allStrings -or $allStrings.Count -eq 0) {
        exit 0
    }

    # Guard is intentionally conservative and warning-only to avoid false blocks.
    $completionSignals = @("완료", "검증 완료", "출시 준비", "done", "ready for release")
    $evidenceSignals = @(
        "stitch", "디자인 반영", "상태 ui", "로딩", "빈", "오류", "권한",
        "e2e", "시나리오", "캡처", "screenshot", "url", "증빙"
    )

    $hasCompletionSignal = $false
    foreach ($token in $completionSignals) {
        if ($allStrings -match [regex]::Escape($token)) {
            $hasCompletionSignal = $true
            break
        }
    }

    if (-not $hasCompletionSignal) {
        exit 0
    }

    $evidenceMatches = 0
    foreach ($token in $evidenceSignals) {
        if ($allStrings -match [regex]::Escape($token)) {
            $evidenceMatches++
        }
    }

    if ($evidenceMatches -lt 2) {
        Write-Host "[completion-guard] 완료/출시 선언 신호가 감지되었습니다."
        Write-Host "[completion-guard] DoD 증빙(디자인 반영, 상태 UI, 시나리오 테스트, URL/캡처)을 함께 남겨주세요."
        Write-Host "[completion-guard] 현재는 경고 모드이며 작업을 차단하지 않습니다."
    }

    exit 0
}
catch {
    # Guard must never block normal editing flow.
    exit 0
}

#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$cooldownSeconds = 20

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

function Write-DeliveryLoopLog {
    param(
        [string]$ProjectRoot,
        [string]$Message
    )

    try {
        $stateDir = Join-Path $ProjectRoot ".cursor\state"
        if (-not (Test-Path -LiteralPath $stateDir)) {
            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        }
        $logPath = Join-Path $stateDir "delivery-loop-warnings.log"
        $ts = (Get-Date).ToString("s")
        Add-Content -LiteralPath $logPath -Value "[$ts] guard-delivery-loop: $Message" -Encoding ASCII
    }
    catch {
        # Logging must remain fail-open.
    }
}

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        exit 0
    }

    $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    $statePath = Join-Path $projectRoot ".cursor\state\delivery-ralph.json"
    if (-not (Test-Path -LiteralPath $statePath)) {
        exit 0
    }

    $stateJson = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8
    $state = $stateJson | ConvertFrom-Json
    if (-not $state.enabled) {
        exit 0
    }

    $phases = @("verify", "perf", "blocker_loop")
    $phase = [string]$state.lifecyclePhase
    if ([string]::IsNullOrWhiteSpace($phase) -or $phases -notcontains $phase.ToLowerInvariant()) {
        exit 0
    }

    $stateDir = Join-Path $projectRoot ".cursor\state"
    $cooldownMarker = Join-Path $stateDir "delivery-loop-guard.last-run"
    if (Test-Path -LiteralPath $cooldownMarker) {
        try {
            $lastRunRaw = (Get-Content -LiteralPath $cooldownMarker -Raw).Trim()
            if (-not [string]::IsNullOrWhiteSpace($lastRunRaw)) {
                $lastRun = [datetime]::Parse($lastRunRaw)
                $elapsed = (Get-Date) - $lastRun
                if ($elapsed.TotalSeconds -lt $cooldownSeconds) {
                    exit 0
                }
            }
        }
        catch {
            Write-DeliveryLoopLog -ProjectRoot $projectRoot -Message "Failed to parse cooldown marker: $cooldownMarker"
        }
    }

    $payload = $raw | ConvertFrom-Json -Depth 20
    $allStrings = (Get-AllStringValues -Node $payload) | ForEach-Object { $_.ToLowerInvariant() }
    if (-not $allStrings -or $allStrings.Count -eq 0) {
        exit 0
    }

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

    $items = @()
    if ($null -ne $state.checklistItems) {
        $items = @($state.checklistItems)
    }

    $checklistOk = $true
    if ($items.Count -gt 0) {
        foreach ($item in $items) {
            if (-not $item.done) {
                $checklistOk = $false
                break
            }
        }
    }

    $evidenceMatches = 0
    foreach ($token in $evidenceSignals) {
        if ($allStrings -match [regex]::Escape($token)) {
            $evidenceMatches++
        }
    }

    $blockEvidence = $false
    try {
        $blockEvidence = [bool]$state.blockNonEvidenceCompletion
    }
    catch {
        $blockEvidence = $false
    }

    if ($items.Count -eq 0) {
        $evidenceOk = ($evidenceMatches -ge 2)
    }
    elseif ($blockEvidence) {
        $evidenceOk = ($evidenceMatches -ge 2)
    }
    else {
        $evidenceOk = $true
    }

    if ($checklistOk -and $evidenceOk) {
        if (-not (Test-Path -LiteralPath $stateDir)) {
            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        }
        Set-Content -LiteralPath $cooldownMarker -Value ((Get-Date).ToString("o")) -Encoding ASCII
        exit 0
    }

    Write-Host "[delivery-loop-guard] 완료/출시 선언이 감지되었으나 완료 루프 하네스 기준을 충족하지 않습니다."
    if (-not $checklistOk) {
        Write-Host "[delivery-loop-guard] delivery-ralph.json 의 checklistItems 를 모두 done 으로 맞추거나, 선언 전에 증빙을 채워 주세요."
    }
    if (-not $evidenceOk) {
        Write-Host "[delivery-loop-guard] DoD 증빙 키워드(디자인 반영, 상태 UI, 시나리오, URL/캡처 등)를 보고에 포함해 주세요."
    }
    Write-Host "[delivery-loop-guard] 현재는 경고 모드이며 편집을 차단하지 않습니다. 상세: docs/agent/delivery-loop-harness.md"

    Write-DeliveryLoopLog -ProjectRoot $projectRoot -Message "Completion signal without checklist/evidence; phase=$phase checklistOk=$checklistOk evidenceOk=$evidenceOk"

    if (-not (Test-Path -LiteralPath $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }
    Set-Content -LiteralPath $cooldownMarker -Value ((Get-Date).ToString("o")) -Encoding ASCII
    exit 0
}
catch {
    try {
        $safeRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
        Write-DeliveryLoopLog -ProjectRoot $safeRoot -Message $_.Exception.Message
    }
    catch {
        # no-op
    }
    exit 0
}

param(
    [string]$RepoRoot = "",
    [string]$TestCommand = "",
    [int]$MaxIterations = 20,
    [int]$MaxMinutes = 120,
    [switch]$Initialize
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
    param([string]$Candidate)

    if (-not [string]::IsNullOrWhiteSpace($Candidate)) {
        return (Resolve-Path -LiteralPath $Candidate).Path
    }
    $here = $PSScriptRoot
    return (Resolve-Path (Join-Path $here "..\..")).Path
}

function Get-StatePath {
    param([string]$Root)
    return (Join-Path $Root ".cursor\state\delivery-ralph.json")
}

function Ensure-StateFromExample {
    param(
        [string]$Root,
        [string]$ExamplePath
    )

    $statePath = Get-StatePath -Root $Root
    if (Test-Path -LiteralPath $statePath) {
        return $statePath
    }

    if (-not (Test-Path -LiteralPath $ExamplePath)) {
        throw "State file missing and example not found: $ExamplePath"
    }

    $dir = Split-Path -Parent $statePath
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    Copy-Item -LiteralPath $ExamplePath -Destination $statePath -Force
    return $statePath
}

function Update-StateRun {
    param(
        [string]$StatePath,
        [int]$Iteration,
        [string]$Command,
        [object]$ExitCode
    )

    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $state | Add-Member -NotePropertyName iteration -NotePropertyValue $Iteration -Force
    $state | Add-Member -NotePropertyName lastCommand -NotePropertyValue $Command -Force
    $state | Add-Member -NotePropertyName lastExitCode -NotePropertyValue $ExitCode -Force
    $state | Add-Member -NotePropertyName updatedAt -NotePropertyValue (Get-Date).ToString("s") -Force
    ($state | ConvertTo-Json -Depth 20) | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

$repo = Resolve-RepoRoot -Candidate $RepoRoot
$example = Join-Path $repo "docs\qa\delivery-loop-state.example.json"
$statePath = Ensure-StateFromExample -Root $repo -ExamplePath $example

if ($Initialize) {
    Write-Host "Initialized or verified state at: $statePath"
    Write-Host "Set enabled=true and lifecyclePhase (e.g. verify), then run with -TestCommand."
    exit 0
}

if ([string]::IsNullOrWhiteSpace($TestCommand)) {
    throw "TestCommand is required (e.g. 'npm test'). Use -Initialize to create state from example."
}

$state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $state.enabled) {
    Write-Host "delivery-ralph.json has enabled=false; exiting without running tests."
    exit 0
}

$deadline = (Get-Date).AddMinutes($MaxMinutes)
$iteration = 0
if ($null -ne $state.iteration) {
    try {
        $iteration = [int]$state.iteration
    }
    catch {
        $iteration = 0
    }
}

while ($iteration -lt $MaxIterations) {
    if ((Get-Date) -gt $deadline) {
        Write-Warning "Stopped: exceeded MaxMinutes=$MaxMinutes"
        Update-StateRun -StatePath $statePath -Iteration $iteration -Command $TestCommand -ExitCode $null
        exit 2
    }

    Write-Host "[$iteration] Running in $repo : $TestCommand"
    $psi = @{
        FilePath               = "powershell.exe"
        WorkingDirectory       = $repo
        NoNewWindow            = $true
        Wait                   = $true
        PassThru               = $true
        ArgumentList           = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command", "$TestCommand; exit `$LASTEXITCODE"
        )
    }
    $proc = Start-Process @psi
    $code = $proc.ExitCode
    $iteration++

    Update-StateRun -StatePath $statePath -Iteration $iteration -Command $TestCommand -ExitCode $code

    if ($code -eq 0) {
        Write-Host "Test command succeeded after $iteration run(s)."
        exit 0
    }

    Write-Warning "Exit code $code; loop continues until success or MaxIterations."
}

Write-Warning "Stopped: reached MaxIterations=$MaxIterations"
exit 1

# Dot-source only: defines Get-HubIndexStem for hub markdown filename (stem without .md).
# Priority: hubFileStem (ingest) > sanitize(displayName) > sanitize(slug)-docs-hub

function Sanitize-HubFileStemSegment {
    param(
        [string]$Raw,
        [int]$MaxLen = 80
    )
    if ($null -eq $Raw) {
        return ''
    }
    $r = $Raw.Trim()
    if ([string]::IsNullOrWhiteSpace($r)) {
        return ''
    }
    # Windows + path-unsafe characters
    $r = [regex]::Replace($r, '[<>:"/\\|?*\x00-\x1f]', '-')
    $r = [regex]::Replace($r, '\s+', '-')
    $r = [regex]::Replace($r, '-{2,}', '-')
    $r = $r.Trim('.', '-', ' ', '_')
    if ($r.Length -gt $MaxLen) {
        $r = $r.Substring(0, $MaxLen).TrimEnd('-')
    }
    if ([string]::IsNullOrWhiteSpace($r) -or $r -eq '-') {
        return ''
    }
    return $r
}

function Get-HubIndexStem {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Slug,
        [string]$DisplayName = "",
        [string]$HubFileStem = ""
    )

    $candidate = ''
    if (-not [string]::IsNullOrWhiteSpace($HubFileStem)) {
        $candidate = Sanitize-HubFileStemSegment -Raw $HubFileStem
    }
    if ([string]::IsNullOrWhiteSpace($candidate) -and -not [string]::IsNullOrWhiteSpace($DisplayName)) {
        $candidate = Sanitize-HubFileStemSegment -Raw $DisplayName
    }
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        $safeSlug = Sanitize-HubFileStemSegment -Raw $Slug -MaxLen 60
        if ([string]::IsNullOrWhiteSpace($safeSlug)) {
            $safeSlug = 'repo'
        }
        $candidate = $safeSlug + '-docs-hub'
    }

    return $candidate
}

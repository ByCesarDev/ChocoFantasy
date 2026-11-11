$localMojang = "$env:APPDATA\levilauncher.exe\versions\1.26.60.05\Minecraft Bedrock\Users\Shared\games\com.mojang"
$standardMojang = "$env:LOCALAPPDATA\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"

$comMojangPaths = @()
if (Test-Path $localMojang) { $comMojangPaths += $localMojang }
if (Test-Path $standardMojang) { $comMojangPaths += $standardMojang }

if ($comMojangPaths.Count -eq 0) {
    Write-Error "No com.mojang folder found in Roaming or LocalAppData!"
    exit 1
}

$repo = $PSScriptRoot

function Create-LinkOrJunction($target, $source, $label) {
    $item = Get-Item -LiteralPath $target -ErrorAction SilentlyContinue
    if ($item) {
        if ($item.LinkType -and ($item.Target -contains $source)) {
            Write-Host "  $label is already correctly linked to: $source" -ForegroundColor Green
            return
        } else {
            Write-Host "  $label exists as a regular folder or outdated link. Replacing with junction..." -ForegroundColor Yellow
            Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
        }
    }

    # Ensure parent folder exists
    $parent = Split-Path -Path $target -Parent
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    try {
        New-Item -ItemType SymbolicLink -Path $target -Value $source -ErrorAction Stop | Out-Null
        Write-Host "  Created $label SymbolicLink: $target -> $source" -ForegroundColor Green
    } catch {
        New-Item -ItemType Junction -Path $target -Value $source -ErrorAction Stop | Out-Null
        Write-Host "  Created $label Junction: $target -> $source" -ForegroundColor Green
    }
}

foreach ($comMojang in $comMojangPaths) {
    Write-Host "Linking packs in: $comMojang" -ForegroundColor Cyan

    $bpTarget = Join-Path $comMojang "development_behavior_packs\ChocoFantasyBP"
    $bpSource = Join-Path $repo "ChocoFantasyBP"
    Create-LinkOrJunction -target $bpTarget -source $bpSource -label "Behavior Pack"

    $rpTarget = Join-Path $comMojang "development_resource_packs\ChocoFantasyRP"
    $rpSource = Join-Path $repo "ChocoFantasyRP"
    Create-LinkOrJunction -target $rpTarget -source $rpSource -label "Resource Pack"
}

Write-Host "`nAll links created and verified successfully!" -ForegroundColor Green

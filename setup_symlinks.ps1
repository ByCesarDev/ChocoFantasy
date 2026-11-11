$localMojang = "CC:\Users\Usuario\AppData\Roaming\levilauncher.exe\versions\1.26.60.05\Minecraft Bedrock\Users\Shared\games\com.mojang"

$comMojangPaths = @()
if (Test-Path $localMojang) { $comMojangPaths += $localMojang }

if ($comMojangPaths.Count -eq 0) {
    Write-Error "No com.mojang folder found in Roaming or LocalAppData!"
    exit 1
}

$repo = $PSScriptRoot

foreach ($comMojang in $comMojangPaths) {
    Write-Host "Creating links in: $comMojang" -ForegroundColor Cyan

    # Behavior Pack Link
    $bpTarget = Join-Path $comMojang "development_behavior_packs\ChocoFantasyBP"
    $bpSource = Join-Path $repo "ChocoFantasyBP"

    if (Test-Path $bpTarget) {
        Write-Host "  Behavior Pack link already exists at: $bpTarget" -ForegroundColor Yellow
    } else {
        try {
            New-Item -ItemType SymbolicLink -Path $bpTarget -Value $bpSource -ErrorAction Stop | Out-Null
            Write-Host "  Created BP SymbolicLink: $bpTarget -> $bpSource" -ForegroundColor Green
        } catch {
            New-Item -ItemType Junction -Path $bpTarget -Value $bpSource | Out-Null
            Write-Host "  Created BP Junction: $bpTarget -> $bpSource" -ForegroundColor Green
        }
    }

    # Resource Pack Link
    $rpTarget = Join-Path $comMojang "development_resource_packs\ChocoFantasyRP"
    $rpSource = Join-Path $repo "ChocoFantasyRP"

    if (Test-Path $rpTarget) {
        Write-Host "  Resource Pack link already exists at: $rpTarget" -ForegroundColor Yellow
    } else {
        try {
            New-Item -ItemType SymbolicLink -Path $rpTarget -Value $rpSource -ErrorAction Stop | Out-Null
            Write-Host "  Created RP SymbolicLink: $rpTarget -> $rpSource" -ForegroundColor Green
        } catch {
            New-Item -ItemType Junction -Path $rpTarget -Value $rpSource | Out-Null
            Write-Host "  Created RP Junction: $rpTarget -> $rpSource" -ForegroundColor Green
        }
    }
}
